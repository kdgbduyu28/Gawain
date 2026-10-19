import type { Busy } from './gaps';
import { DAY, HOUR, MIN } from './time';

/**
 * Just enough iCalendar (RFC 5545) to turn a calendar's secret iCal link into
 * busy times: repeating meetings (daily/weekly/monthly RRULEs with BYDAY, INTERVAL,
 * UNTIL, COUNT), EXDATE, moved or cancelled single occurrences (RECURRENCE-ID),
 * time zones (IANA and the Windows names Outlook uses). Free, cancelled and
 * all-day events are skipped.
 */

type Prop = { value: string; params: Record<string, string> };
type When = { utc: number; date: boolean; tz: string | null; wall: Wall | null };
type Wall = { y: number; m: number; d: number; h: number; mi: number; s: number };

type VEvent = {
  uid: string;
  summary: string;
  start: When;
  end: When | null;
  duration: number | null;
  rrule: Record<string, string> | null;
  exdates: number[];
  recurrenceId: number | null;
  free: boolean;
  cancelled: boolean;
};

// Outlook and Exchange write Windows zone names. The common ones; unknown names fall back to local time.
const WINDOWS_TZ: Record<string, string> = {
  'Singapore Standard Time': 'Asia/Singapore',
  'Malay Peninsula Standard Time': 'Asia/Kuala_Lumpur',
  'China Standard Time': 'Asia/Shanghai',
  'Taipei Standard Time': 'Asia/Taipei',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'Korea Standard Time': 'Asia/Seoul',
  'India Standard Time': 'Asia/Kolkata',
  'SE Asia Standard Time': 'Asia/Bangkok',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
  UTC: 'UTC',
  'Coordinated Universal Time': 'UTC',
};

function zone(tz: string | undefined): string | null {
  if (!tz) return null;
  const name = WINDOWS_TZ[tz] ?? tz.replace(/^\/[^/]+\/[^/]+\//, ''); // strip "/mozilla.org/20050126_1/" style prefixes
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return name;
  } catch {
    return null;
  }
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();

/** Offset of `tz` from UTC at instant `t`, in ms. */
function offset(t: number, tz: string): number {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    fmtCache.set(tz, f);
  }
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(t))) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(t / 1000) * 1000;
}

/** Wall-clock time in `tz` (or the device's zone when null) to a UTC timestamp. */
function toUtc(w: Wall, tz: string | null): number {
  if (!tz) return new Date(w.y, w.m - 1, w.d, w.h, w.mi, w.s).getTime();
  const guess = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s);
  const first = guess - offset(guess, tz);
  // Second pass lands on the right side of a DST change.
  return guess - offset(first, tz);
}

function parseWhen(p: Prop | undefined): When | null {
  if (!p) return null;
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(p.value.trim());
  if (!m) return null;
  const w: Wall = { y: +m[1], m: +m[2], d: +m[3], h: +(m[4] ?? 0), mi: +(m[5] ?? 0), s: +(m[6] ?? 0) };
  const date = p.params.VALUE === 'DATE' || m[4] === undefined;
  if (m[7]) return { utc: Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s), date, tz: 'UTC', wall: w };
  const tz = zone(p.params.TZID);
  return { utc: toUtc(w, tz), date, tz, wall: w };
}

function parseDuration(s: string | undefined): number | null {
  const m = s && /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(s.trim());
  if (!m) return null;
  const ms = (+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * DAY + +(m[4] ?? 0) * HOUR + +(m[5] ?? 0) * MIN + +(m[6] ?? 0) * 1000;
  return m[1] === '-' ? -ms : ms;
}

function unescape(s: string): string {
  return s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
}

/** Split into content lines (unfolding continuations) and group VEVENT properties. */
function events(text: string): VEvent[] {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const out: VEvent[] = [];
  let cur: Record<string, Prop[]> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT' && cur) {
      const one = (k: string) => cur![k]?.[0];
      const start = parseWhen(one('DTSTART'));
      if (start) {
        const rrule = one('RRULE')
          ? Object.fromEntries(one('RRULE')!.value.split(';').map((kv) => kv.split('=') as [string, string]))
          : null;
        out.push({
          uid: one('UID')?.value ?? '',
          summary: unescape(one('SUMMARY')?.value ?? ''),
          start,
          end: parseWhen(one('DTEND')),
          duration: parseDuration(one('DURATION')?.value),
          rrule,
          exdates: (cur.EXDATE ?? []).flatMap((p) =>
            p.value.split(',').map((v) => parseWhen({ value: v, params: p.params })?.utc ?? NaN),
          ),
          recurrenceId: parseWhen(one('RECURRENCE-ID'))?.utc ?? null,
          free: one('TRANSP')?.value === 'TRANSPARENT' || one('X-MICROSOFT-CDO-BUSYSTATUS')?.value === 'FREE',
          cancelled: one('STATUS')?.value === 'CANCELLED',
        });
      }
      cur = null;
    } else if (cur) {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const [name, ...params] = line.slice(0, colon).split(';');
      const prop: Prop = { value: line.slice(colon + 1), params: {} };
      for (const p of params) {
        const eq = p.indexOf('=');
        if (eq > 0) prop.params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
      }
      (cur[name.toUpperCase()] ??= []).push(prop);
    }
  }
  return out;
}

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const MAX_STEPS = 5000;

/** Start times (UTC) of every occurrence of `e` that starts before `to`. */
function occurrences(e: VEvent, to: number): number[] {
  const r = e.rrule;
  if (!r) return [e.start.utc];
  const w = e.start.wall!;
  const tz = e.start.tz === 'UTC' ? 'UTC' : e.start.tz;
  const at = (y: number, m: number, d: number) => toUtc({ ...w, y, m, d }, tz);
  const interval = Math.max(1, parseInt(r.INTERVAL ?? '1', 10) || 1);
  const until = r.UNTIL ? (parseWhen({ value: r.UNTIL, params: {} })?.utc ?? Infinity) : Infinity;
  const count = r.COUNT ? parseInt(r.COUNT, 10) : Infinity;
  const byday = r.BYDAY ? r.BYDAY.split(',').map((s) => /^([+-]?\d+)?([A-Z]{2})$/.exec(s)).filter(Boolean) as RegExpExecArray[] : [];

  const out: number[] = [];
  const push = (t: number) => {
    if (t < e.start.utc) return true;
    if (t > until || out.length >= count || t >= to) return false;
    out.push(t);
    return true;
  };

  // Walk calendar days with Date.UTC so weekday maths ignore DST.
  const base = Date.UTC(w.y, w.m - 1, w.d);
  const ymd = (t: number) => {
    const d = new Date(t);
    return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()] as const;
  };

  if (r.FREQ === 'DAILY') {
    const days = byday.map((b) => DAYS.indexOf(b[2]));
    for (let i = 0; i < MAX_STEPS; i++) {
      const day = base + i * interval * DAY;
      if (days.length && !days.includes(new Date(day).getUTCDay())) continue;
      if (!push(at(...ymd(day)))) break;
    }
  } else if (r.FREQ === 'WEEKLY') {
    const wkst = DAYS.indexOf(r.WKST ?? 'MO');
    const days = (byday.length ? byday.map((b) => DAYS.indexOf(b[2])) : [new Date(base).getUTCDay()]).sort(
      (a, b) => ((a - wkst + 7) % 7) - ((b - wkst + 7) % 7),
    );
    const weekStart = base - ((new Date(base).getUTCDay() - wkst + 7) % 7) * DAY;
    outer: for (let i = 0; i < MAX_STEPS; i++) {
      const ws = weekStart + i * interval * 7 * DAY;
      for (const d of days) {
        if (!push(at(...ymd(ws + ((d - wkst + 7) % 7) * DAY)))) break outer;
      }
    }
  } else if (r.FREQ === 'MONTHLY') {
    for (let i = 0; i < MAX_STEPS; i++) {
      const y = w.y + Math.floor((w.m - 1 + i * interval) / 12);
      const m = ((w.m - 1 + i * interval) % 12) + 1;
      const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const dates: number[] = [];
      if (byday.length) {
        for (const b of byday) {
          const wd = DAYS.indexOf(b[2]);
          const n = b[1] ? parseInt(b[1], 10) : 0;
          const all: number[] = [];
          for (let d = 1; d <= dim; d++) if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === wd) all.push(d);
          if (n > 0 && all[n - 1]) dates.push(all[n - 1]);
          else if (n < 0 && all[all.length + n]) dates.push(all[all.length + n]);
          else if (!n) dates.push(...all);
        }
      } else if (w.d <= dim) dates.push(w.d);
      let go = true;
      for (const d of dates.sort((a, b) => a - b)) if (!(go = push(at(y, m, d)))) break;
      if (!go) break;
    }
  } else if (r.FREQ === 'YEARLY') {
    for (let i = 0; i < 200; i++) if (!push(at(w.y + i * interval, w.m, w.d))) break;
  } else {
    out.push(e.start.utc);
  }
  return out;
}

/** Busy times between `from` and `to` from an .ics file's text. */
export function busyFromIcs(text: string, from: number, to: number): Busy[] {
  const all = events(text);
  // Single occurrences that were moved or cancelled, keyed by series UID.
  const overridden = new Map<string, Set<number>>();
  for (const e of all) if (e.recurrenceId !== null) (overridden.get(e.uid) ?? overridden.set(e.uid, new Set()).get(e.uid)!).add(e.recurrenceId);

  const out: Busy[] = [];
  for (const e of all) {
    if (e.start.date || e.free || e.cancelled) continue;
    const length = e.end ? e.end.utc - e.start.utc : (e.duration ?? 0);
    if (length <= 0) continue;
    const skip = new Set([...e.exdates, ...(e.recurrenceId === null ? (overridden.get(e.uid) ?? []) : [])]);
    for (const start of occurrences(e, to)) {
      if (skip.has(start) || start + length <= from) continue;
      out.push({ start, end: start + length, title: e.summary });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Accepts webcal:// links and checks it's at least a URL. */
export function normalizeIcsUrl(s: string): string | null {
  const t = s.trim().replace(/^webcals?:\/\//i, 'https://');
  try {
    const u = new URL(t);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}
