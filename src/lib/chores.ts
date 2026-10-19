import { DAY, addDays, daysBetween, startOfDay } from './time';

export type Chore = {
  id: string;
  name: string;
  room: string;
  /** Days between doing it and doing it again; null for a one-off (an errand, a repair). */
  everyDays: number | null;
  minutes: number;
  /** 'out' chores are errands: they show up in the away-from-home reminder, never in calendar gaps. */
  where: 'home' | 'out';
  lastDone: number | null;
  createdAt: number;
  /** "Not today": pushes the due date without counting as done. */
  snoozedUntil: number | null;
};

export type Done = { choreId: string; at: number; /** Days late (0 when on time or early). */ late: number };

/**
 * When the chore is next due. Repeating chores count from the last time they were
 * actually done, so doing one late moves every later due date too.
 */
export function dueAt(c: Chore): number {
  const base = c.everyDays !== null && c.lastDone !== null ? addDays(c.lastDone, c.everyDays) : c.createdAt;
  return c.snoozedUntil !== null && c.snoozedUntil > base ? c.snoozedUntil : base;
}

/**
 * - new: repeating, but never marked done, so there's no real due date yet
 * - overdue / today / soon (next 2 days) / later
 */
export type Status = 'new' | 'overdue' | 'today' | 'soon' | 'later';

export function status(c: Chore, now: number): Status {
  if (c.everyDays !== null && c.lastDone === null && c.snoozedUntil === null) return 'new';
  const d = daysBetween(now, dueAt(c));
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d <= 2) return 'soon';
  return 'later';
}

/** Whole days past due (0 if not overdue). */
export function daysLate(c: Chore, now: number): number {
  return Math.max(0, daysBetween(dueAt(c), now));
}

/**
 * How pressing it is: 1.0 means due today. Repeating chores scale by their own
 * interval, so a daily chore one day late (2.0) outranks a monthly one a day late (~1.03).
 */
export function urgency(c: Chore, now: number): number {
  const s = status(c, now);
  if (s === 'new') return 0.5;
  const span = (c.everyDays ?? 7) * DAY;
  const until = startOfDay(dueAt(c)) - startOfDay(now);
  return 1 - until / span;
}

/** Chores that should be done today or are late, most pressing first. */
export function dueNow(chores: Chore[], now: number): Chore[] {
  return byUrgency(chores.filter((c) => ['overdue', 'today'].includes(status(c, now))), now);
}

export function byUrgency(chores: Chore[], now: number): Chore[] {
  return [...chores].sort((a, b) => urgency(b, now) - urgency(a, now) || a.minutes - b.minutes);
}

/**
 * The chores and history after marking a chore done at `at`, or null if there's
 * no such chore. One-offs are finished for good; repeating chores restart their interval.
 */
export function withDone(chores: Chore[], history: Done[], id: string, at: number, maxHistory: number): { chores: Chore[]; history: Done[] } | null {
  const c = chores.find((x) => x.id === id);
  if (!c) return null;
  const late = status(c, at) === 'overdue' ? daysLate(c, at) : 0;
  return {
    history: [...history, { choreId: id, at, late }].slice(-maxHistory),
    chores:
      c.everyDays === null
        ? chores.filter((x) => x.id !== id)
        : chores.map((x) => (x.id === id ? { ...x, lastDone: Math.max(at, x.lastDone ?? 0), snoozedUntil: null } : x)),
  };
}

/** Share of the last `n` completions that were on time. Null with no history. */
export function onTimeRate(history: Done[], choreId: string, n = 10): number | null {
  const mine = history.filter((h) => h.choreId === choreId).slice(-n);
  if (!mine.length) return null;
  return mine.filter((h) => h.late === 0).length / mine.length;
}

/** Consecutive on-time completions, counting back from the most recent. */
export function streak(history: Done[], choreId: string): number {
  const mine = history.filter((h) => h.choreId === choreId);
  let n = 0;
  for (let i = mine.length - 1; i >= 0 && mine[i].late === 0; i--) n++;
  return n;
}
