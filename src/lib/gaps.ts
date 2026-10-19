import { Chore, dueAt, status, urgency } from './chores';
import { Clock, MIN, at, daysBetween, startOfDay } from './time';

/** A stretch of time you're not free: a calendar event or one of your meeting blocks. */
export type Busy = { start: number; end: number; title: string };

/** A meeting you have every week on set days (standup, 1:1s) when there's no calendar to read. */
export type Block = { id: string; title: string; days: number[]; start: Clock; end: Clock };

export type Schedule = {
  /** 0 = Sunday. */
  workDays: number[];
  workStart: Clock;
  workEnd: Clock;
  /** Chores are never suggested before or after these. */
  dayStart: Clock;
  dayEnd: Clock;
  /** During work hours, only suggest chores up to this long. */
  maxWorkChore: number;
  /** Minutes kept free before the next meeting. */
  buffer: number;
};

export type Gap = {
  start: number;
  end: number;
  minutes: number;
  /** Inside work hours on a workday. */
  work: boolean;
  /** The meeting that ends this gap, if any. */
  next: Busy | null;
};

export function blocksOn(day: number, blocks: Block[]): Busy[] {
  const dow = new Date(day).getDay();
  return blocks
    .filter((b) => b.days.includes(dow))
    .map((b) => ({ start: at(day, b.start), end: at(day, b.end), title: b.title }))
    .filter((b) => b.end > b.start);
}

/** Sort and merge overlapping or touching intervals; a merged run keeps its first title. */
export function merge(busy: Busy[]): Busy[] {
  const out: Busy[] = [];
  for (const b of [...busy].sort((x, y) => x.start - y.start)) {
    const last = out[out.length - 1];
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else out.push({ ...b });
  }
  return out;
}

/** Free stretches of at least `minMinutes` on the day containing `day`, from `now` on. */
export function gapsOn(day: number, busy: Busy[], s: Schedule, now: number, minMinutes = 10): Gap[] {
  const d0 = startOfDay(day);
  // Round "now" up to the next minute so a gap never starts in the past.
  const from = Math.max(at(d0, s.dayStart), Math.ceil(now / MIN) * MIN);
  const to = at(d0, s.dayEnd);
  if (from >= to) return [];

  const merged = merge(busy.filter((b) => b.end > from && b.start < to));
  const free: { start: number; end: number; next: Busy | null }[] = [];
  let cursor = from;
  for (const b of merged) {
    if (b.start > cursor) free.push({ start: cursor, end: b.start, next: b });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < to) free.push({ start: cursor, end: to, next: null });

  // Split at the edges of work hours so each gap is all-work or all-personal time.
  const workday = s.workDays.includes(new Date(d0).getDay());
  const ws = at(d0, s.workStart);
  const we = at(d0, s.workEnd);
  const pieces: Gap[] = [];
  for (const f of free) {
    const cuts = workday ? [f.start, ...[ws, we].filter((c) => c > f.start && c < f.end), f.end] : [f.start, f.end];
    for (let i = 0; i < cuts.length - 1; i++) {
      const start = cuts[i];
      const end = cuts[i + 1];
      pieces.push({
        start,
        end,
        minutes: Math.floor((end - start) / MIN),
        work: workday && start >= ws && end <= we,
        next: end === f.end ? f.next : null,
      });
    }
  }
  return pieces.filter((g) => g.minutes >= minMinutes);
}

export type Suggestion = { gap: Gap; chores: Chore[]; minutes: number };

const RANK: Record<string, number> = { overdue: 0, today: 0, new: 1, soon: 2 };
/** More than this in one go stops feeling like a suggestion. */
const MAX_PICKS = 3;

/**
 * Fill each gap with home chores that fit, most pressing first. A chore is only
 * suggested once, in the earliest gap it fits. Work-hour gaps only get short chores.
 */
export function suggest(gaps: Gap[], chores: Chore[], s: Schedule, now: number): Suggestion[] {
  // Chores due tomorrow can fill a gap early; nothing done today comes back the same day.
  const fits = (c: Chore) =>
    c.where === 'home' &&
    status(c, now) in RANK &&
    (status(c, now) !== 'soon' || daysBetween(now, dueAt(c)) <= 1) &&
    (c.lastDone === null || daysBetween(c.lastDone, now) > 0);
  const pool = chores
    .filter(fits)
    .sort((a, b) => RANK[status(a, now)] - RANK[status(b, now)] || urgency(b, now) - urgency(a, now) || a.minutes - b.minutes);
  const used = new Set<string>();
  const out: Suggestion[] = [];
  for (const gap of gaps) {
    let room = gap.minutes - (gap.next ? s.buffer : 0);
    const cap = gap.work ? Math.min(room, s.maxWorkChore) : room;
    const picks: Chore[] = [];
    for (const c of pool) {
      if (used.has(c.id) || c.minutes > cap || c.minutes > room) continue;
      // During work, one quick chore per break is plenty.
      if (picks.length >= (gap.work ? 1 : MAX_PICKS)) break;
      picks.push(c);
      used.add(c.id);
      room -= c.minutes;
    }
    if (picks.length) out.push({ gap, chores: picks, minutes: picks.reduce((n, c) => n + c.minutes, 0) });
  }
  return out;
}

/**
 * When to remind you about an appliance that finishes at `endsAt`: right then if
 * you're free, otherwise a couple of minutes after the meeting (or back-to-back
 * meetings) it lands in.
 */
export function remindAt(endsAt: number, busy: Busy[], grace = 2 * MIN): { at: number; during: Busy | null } {
  const hit = merge(busy).find((b) => endsAt >= b.start && endsAt < b.end);
  return hit ? { at: hit.end + grace, during: hit } : { at: endsAt, during: null };
}
