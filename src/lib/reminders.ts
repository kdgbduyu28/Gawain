import { Chore, status } from './chores';
import { Busy, Gap, Schedule, Suggestion, gapsOn, remindAt, suggest } from './gaps';
import { Item, runningOutSoon } from './pantry';
import { Clock, MIN, addDays, at, fmtMinutes, fmtTime, startOfDay } from './time';

export type Timer = {
  id: string;
  label: string;
  icon: string;
  startedAt: number;
  /** When it finishes (an estimate until a smart plug reports the real end). */
  endsAt: number;
  /** When a smart plug or hub reported it finished. */
  finishedAt?: number;
  /** Started by a hub that also reports the finish: don't remind at the estimate. */
  waitForFinish?: boolean;
  /** Don't remind before this (a finish heard about just now, a little after it happened). */
  remindFrom?: number;
};

export type Planned = { id: string; title: string; body: string; href: string; at: number };

export type PlanInput = {
  chores: Chore[];
  items: Item[];
  timers: Timer[];
  busy: Busy[];
  schedule: Schedule;
  digest: Clock | null;
  gapNudges: boolean;
};

const DIGEST_DAYS = 3;
const NUDGE_DAYS = 2;
const MAX_NUDGES = 6;

export function list(names: string[], max = 3): string {
  const shown = names.slice(0, max);
  const more = names.length - shown.length;
  const joined = shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : (shown[0] ?? '');
  return more > 0 ? `${shown.join(', ')} and ${more} more` : joined;
}

/** Notification text for one suggestion, e.g. "20 free minutes before Standup". */
export function nudgeText(s: Suggestion): { title: string; body: string } {
  const { gap } = s;
  const names = s.chores.map((c) => `${c.name} (${fmtMinutes(c.minutes)})`);
  const what = s.chores.length === 1 ? `${names[0]}?` : `${list(names)}?`;
  if (gap.next) {
    return {
      title: `${fmtMinutes(gap.minutes)} free before ${gap.next.title || 'your next meeting'} at ${fmtTime(gap.next.start)}`,
      body: what,
    };
  }
  if (gap.work) return { title: 'Quick break?', body: what };
  return { title: `Free until ${fmtTime(gap.end, true)}`, body: `Good time for ${what.charAt(0).toLowerCase()}${what.slice(1)}` };
}

export function timerText(t: Timer, busy: Busy[]): { at: number; title: string; body: string } {
  const r = remindAt(Math.max(t.endsAt, t.remindFrom ?? 0), busy);
  if (!r.during) return { at: r.at, title: `${t.label} is done`, body: 'Finished just now.' };
  return {
    at: r.at,
    title: `${t.label} is done`,
    body: `It finished at ${fmtTime(t.endsAt)} during ${r.during.title || 'your meeting'}. You're free now.`,
  };
}

/** Every notification the current state calls for, keyed by a stable id. */
export function plan(s: PlanInput, now: number): Planned[] {
  const out: Planned[] = [];

  for (const t of s.timers) {
    if (t.waitForFinish) continue;
    const r = timerText(t, s.busy);
    if (r.at > now) out.push({ id: `timer:${t.id}`, title: r.title, body: r.body, href: '/', at: r.at });
  }

  if (s.gapNudges) {
    let n = 0;
    let pending = s.chores;
    for (let d = 0; d < NUDGE_DAYS && n < MAX_NUDGES; d++) {
      const day = startOfDay(addDays(now, d));
      // Plan later days as if today's suggestions get done, so tomorrow suggests something else.
      const gaps: Gap[] = gapsOn(day, s.busy, s.schedule, now, 10).filter((g) => g.start > now + MIN);
      const sugg = suggest(gaps, pending, s.schedule, Math.max(now, day));
      for (const sg of sugg.slice(0, MAX_NUDGES - n)) {
        const txt = nudgeText(sg);
        out.push({ id: `gap:${sg.gap.start}:${sg.chores.map((c) => c.id).join('+')}`, ...txt, href: '/', at: sg.gap.start });
        n++;
      }
      const done = new Set(sugg.flatMap((x) => x.chores.map((c) => c.id)));
      pending = pending.filter((c) => !done.has(c.id));
    }
  }

  if (s.digest) {
    for (let d = 0; d < DIGEST_DAYS; d++) {
      const when = at(addDays(now, d), s.digest);
      if (when <= now) continue;
      const due = s.chores.filter((c) => ['overdue', 'today'].includes(status(c, when)));
      const onList = s.items.filter((i) => i.onList).length;
      const soon = runningOutSoon(s.items, when).length;
      if (!due.length && !onList && !soon) continue;
      const parts: string[] = [];
      if (due.length) parts.push(`${due.length} chore${due.length > 1 ? 's' : ''} due`);
      if (onList) parts.push(`${onList} on the grocery list`);
      if (soon) parts.push(`${soon} running low soon`);
      out.push({
        id: `digest:${startOfDay(when)}`,
        title: due.length ? `Today: ${list(due.map((c) => c.name))}` : 'Groceries',
        body: parts.join(' · '),
        href: '/',
        at: when,
      });
    }
  }
  return out;
}

/** What to say when you leave home or arrive at a store, or null if there's nothing. */
export function awayText(
  where: { kind: 'left-home' } | { kind: 'at-store'; storeId: string; name: string },
  items: Item[],
  chores: Chore[],
  now: number,
): { title: string; body: string } | null {
  const store = where.kind === 'at-store' ? where.storeId : null;
  const list_ = items.filter((i) => i.onList && (store === null || i.store === null || i.store === store));
  const soon = runningOutSoon(items, now).filter((i) => store === null || i.store === null || i.store === store);
  const errands = chores.filter((c) => c.where === 'out' && status(c, now) !== 'later' && status(c, now) !== 'new');
  if (!list_.length && !errands.length && !soon.length) return null;

  const lines: string[] = [];
  if (list_.length) lines.push(list(list_.map((i) => i.name), 4));
  if (soon.length) lines.push(`Probably running low: ${list(soon.map((i) => i.name), 3)}`);
  if (errands.length) lines.push(`Errands: ${list(errands.map((c) => c.name), 3)}`);
  const count = list_.length ? `${list_.length} item${list_.length > 1 ? 's' : ''} on your list` : 'Errands to run';
  const title = where.kind === 'left-home' ? `You're out. ${count}` : `At ${where.name}. ${count}`;
  return { title, body: lines.join('\n') };
}
