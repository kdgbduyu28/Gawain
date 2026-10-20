import { Busy } from '../gaps';
import { MIN, at } from '../time';
import type { Meal } from './recipes';

/** When people usually eat, unless they say otherwise. */
export const MEAL_TIMES: Record<Meal, string> = { breakfast: '07:00', lunch: '12:00', dinner: '19:00', snack: '15:30' };

/** A rice cooker takes about this long. */
export const RICE_MINUTES = 35;
/** Cooking that's done this long before eating is fine; earlier and it goes cold. */
const LATE_OK = 30 * MIN;

export type StartBy = {
  start: number;
  /** When the food is ready (later than `eat` if a meeting is in the way). */
  ready: number;
  eat: number;
  /** A meeting moved the cooking: before it, or after it ends. */
  around: { how: 'before' | 'after'; title: string } | null;
  /** When to switch on the rice cooker, for dishes served with rice. */
  riceAt: number | null;
};

/**
 * When to start cooking to eat on time, working around meetings: cook first and
 * finish before a meeting that's in the way, or, if that means cooking far too
 * early, start right after it ends and eat a little late.
 */
export function startBy(minutes: number, date: number, meal: Meal, times: Partial<Record<Meal, string>> = {}, busy: Busy[] = [], rice = false): StartBy {
  const eat = at(date, times[meal] ?? MEAL_TIMES[meal]);
  const len = minutes * MIN;
  const clash = (a: number, b: number) => busy.filter((x) => x.start < b && x.end > a).sort((x, y) => x.start - y.start);
  const riceFor = (ready: number) => (rice ? ready - RICE_MINUTES * MIN : null);

  const inWay = clash(eat - len, eat);
  if (!inWay.length) return { start: eat - len, ready: eat, eat, around: null, riceAt: riceFor(eat) };

  // After the last meeting in the way.
  const last = inWay[inWay.length - 1];
  const after = { start: last.end, ready: last.end + len };
  // Before the first one, if that window is free.
  const first = inWay[0];
  const beforeStart = first.start - len;
  const beforeFree = !clash(beforeStart, first.start).length;

  if (after.ready - eat <= LATE_OK || !beforeFree) {
    return { start: after.start, ready: after.ready, eat, around: { how: 'after', title: last.title }, riceAt: riceFor(Math.max(eat, after.ready)) };
  }
  return { start: beforeStart, ready: first.start, eat, around: { how: 'before', title: first.title }, riceAt: riceFor(eat) };
}
