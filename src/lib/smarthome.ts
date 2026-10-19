/**
 * Smart-home triggers. A hub (Home Assistant, an iPhone Shortcut on an NFC tag,
 * anything that can send a web request) posts "<trigger> <event>" to the
 * household's secret link, e.g. "washer finished" or "trash pressed". Devices
 * pull those events and apply them here with the app's own rules, so a button
 * press counts exactly like ticking the chore, and a washer that finishes during
 * a meeting reminds you after it.
 */
import { Chore, Done, withDone } from './chores';
import { Timer } from './reminders';
import { HOUR, MIN } from './time';

export type Trigger = {
  id: string;
  /** What the hub sends, e.g. "washer": lowercase letters, numbers, - and _. */
  key: string;
  name: string;
  icon: string;
  /** 'chore' marks `choreId` done. 'appliance' runs a timer named after the trigger. */
  kind: 'chore' | 'appliance';
  choreId: string | null;
  /** How long the appliance usually runs, learned from real start and finish events. */
  minutes: number;
  /** It has sent a "finished" before, so its timers wait for that instead of reminding at the estimate. */
  reportsFinish: boolean;
  createdAt: number;
};

export type HomeEvent = { id: number; key: string; event: string; at: number };

/** A second press within this long counts once (double taps, a button bounced, two hubs). */
export const SAME_PRESS = 30 * MIN;
/** Only remind about a finished appliance if it finished this recently. */
const REMIND_WITHIN = 6 * HOUR;
/** Measured runs outside this range are glitches (a plug unplugged), not a cycle to learn from. */
const LEARN_MIN = 5;
const LEARN_MAX = 6 * 60;

export const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/;

/** "Take out the trash" → "take-out-the-trash". */
export function keyFrom(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
}

const STARTED = new Set(['start', 'started', 'on', 'running', 'run', 'begin', 'began']);
const FINISHED = new Set(['', 'done', 'finish', 'finished', 'complete', 'completed', 'end', 'ended', 'off', 'stop', 'stopped', 'press', 'pressed', 'single', 'click', 'tap', 'tapped']);

/** What an event means for this trigger, or null to ignore it. */
export function verb(t: Pick<Trigger, 'kind'>, event: string): 'done' | 'started' | 'finished' | null {
  const e = event.trim().toLowerCase();
  if (t.kind === 'chore') return FINISHED.has(e) ? 'done' : null;
  if (STARTED.has(e)) return 'started';
  if (FINISHED.has(e)) return 'finished';
  return null;
}

export type HomeState = { chores: Chore[]; history: Done[]; timers: Timer[]; triggers: Trigger[] };

/**
 * Applies events (oldest first). Safe to run on events already applied, here or
 * on another device: the same press never counts twice.
 */
export function applyEvents(s: HomeState, events: HomeEvent[], now: number, maxHistory: number): HomeState & { log: string[] } {
  let { chores, history, timers, triggers } = s;
  const log: string[] = [];

  for (const ev of [...events].sort((a, b) => a.at - b.at || a.id - b.id)) {
    const t = triggers.find((x) => x.key === ev.key.trim().toLowerCase());
    const v = t ? verb(t, ev.event) : null;
    if (!t || !v) continue;

    if (v === 'done') {
      const c = chores.find((x) => x.id === t.choreId);
      if (!c) continue;
      if (c.lastDone !== null && Math.abs(ev.at - c.lastDone) < SAME_PRESS) continue;
      const r = withDone(chores, history, c.id, ev.at, maxHistory)!;
      ({ chores, history } = r);
      log.push(`${c.name} done`);
      continue;
    }

    const id = `hook:${t.id}`;
    if (v === 'started') {
      // Already over by the time we heard about it.
      if (ev.at + t.minutes * MIN <= now) continue;
      if (timers.some((x) => x.id === id && x.startedAt === ev.at)) continue;
      const timer: Timer = {
        id,
        label: t.name,
        icon: t.icon,
        startedAt: ev.at,
        endsAt: ev.at + t.minutes * MIN,
        ...(t.reportsFinish ? { waitForFinish: true } : {}),
      };
      timers = [...timers.filter((x) => x.id !== id), timer];
      log.push(`${t.name} started`);
      continue;
    }

    // Finished: end the run it belongs to (one started by the hub, or by hand with the same name).
    const name = t.name.trim().toLowerCase();
    const run = timers
      .filter((x) => (x.id === id || x.label.trim().toLowerCase() === name) && x.startedAt <= ev.at)
      .sort((a, b) => b.startedAt - a.startedAt)[0];
    if (run?.finishedAt !== undefined && ev.at - run.finishedAt < SAME_PRESS) continue;

    const ran = run && run.finishedAt === undefined ? (ev.at - run.startedAt) / MIN : null;
    const learned = ran !== null && ran >= LEARN_MIN && ran <= LEARN_MAX ? Math.round((t.minutes * 2 + ran) / 3) : t.minutes;
    if (learned !== t.minutes || !t.reportsFinish) {
      triggers = triggers.map((x) => (x.id === t.id ? { ...x, minutes: learned, reportsFinish: true } : x));
    }

    const ended: Timer = {
      ...(run && run.finishedAt === undefined ? run : { id, label: t.name, icon: t.icon, startedAt: ev.at }),
      endsAt: ev.at,
      finishedAt: ev.at,
      waitForFinish: undefined,
      // Remind now (or after the meeting you're in); an old event just shows as done.
      remindFrom: now - ev.at < REMIND_WITHIN ? now + 2_000 : undefined,
    };
    timers = timers.some((x) => x.id === ended.id) ? timers.map((x) => (x.id === ended.id ? ended : x)) : [...timers, ended];
    log.push(`${t.name} finished`);
  }

  return { chores, history, timers, triggers, log };
}

/** The household's link that hubs post to. */
export function hookUrl(site: string, token: string): string {
  return `${site.replace(/\/+$/, '')}/api/home/${token}`;
}

/** Home Assistant configuration.yaml: one REST command every automation can call. */
export function haRestCommand(url: string): string {
  return `rest_command:
  gawain:
    url: "${url}"
    method: post
    content_type: "application/json"
    payload: '{"trigger": "{{ trigger }}", "event": "{{ event }}"}'`;
}

/** A Home Assistant automation for one trigger, in the YAML editor's format. */
export function haAutomation(t: Pick<Trigger, 'key' | 'name' | 'kind'>, choreName = t.name): string {
  const quote = (s: string) => s.replace(/"/g, "'");
  if (t.kind === 'appliance') {
    return `alias: "${quote(t.name)} finished → Gawain"
description: "Power drops below 3 W for 3 minutes: the cycle is over."
triggers:
  - trigger: numeric_state
    entity_id: sensor.${t.key.replace(/-/g, '_')}_power   # your plug's power sensor
    below: 3
    for: "00:03:00"
actions:
  - action: rest_command.gawain
    data:
      trigger: ${t.key}
      event: finished
mode: single`;
  }
  return `alias: "${quote(t.name)} → Gawain"
description: "Marks ${quote(choreName)} done in Gawain."
triggers:
  - trigger: state
    entity_id: event.${t.key.replace(/-/g, '_')}_button   # pick your button in the visual editor
actions:
  - action: rest_command.gawain
    data:
      trigger: ${t.key}
      event: pressed
mode: single`;
}

/** For anything else that can send a request (Tasker, IFTTT, a script). */
export function curlExample(url: string, t: Pick<Trigger, 'key' | 'kind'>): string {
  const event = t.kind === 'appliance' ? 'finished' : 'pressed';
  return `curl -X POST "${url}" \\
  -H "content-type: application/json" \\
  -d '{"trigger": "${t.key}", "event": "${event}"}'`;
}
