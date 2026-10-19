import { DAY, addDays, daysBetween } from './time';

export type Level = 'full' | 'low' | 'out';

export type Item = {
  id: string;
  name: string;
  aisle: string;
  /** Saved place id to buy it at; null means any store. */
  store: string | null;
  /** Free text like "2 packs" or "5 kg". */
  note: string;
  level: Level;
  onList: boolean;
  /** Pantry items stay after you buy them. One-off list items (tracked: false) are removed. */
  tracked: boolean;
  /** How long one purchase lasts, if you set it yourself. Otherwise it's learned from `bought`. */
  lastsDays: number | null;
  /** Recent purchase times, oldest first (capped). */
  bought: number[];
  addedAt: number;
};

export const MAX_BOUGHT = 8;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Days one purchase usually lasts: your own setting, else the median gap between
 * the last few purchases (needs at least two). Median so one panic-buy doesn't skew it.
 */
export function lastsDays(item: Item): number | null {
  if (item.lastsDays) return item.lastsDays;
  if (item.bought.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < item.bought.length; i++) gaps.push((item.bought[i] - item.bought[i - 1]) / DAY);
  return Math.max(1, Math.round(median(gaps)));
}

/** When it's expected to run out, or null if there's no estimate yet. */
export function runOutAt(item: Item): number | null {
  const days = lastsDays(item);
  const last = item.bought[item.bought.length - 1];
  return days && last ? addDays(last, days) : null;
}

/** ok, soon (predicted to run out within `withinDays`), low or out (you said so). */
export type Stock = 'ok' | 'soon' | 'low' | 'out';

export function stock(item: Item, now: number, withinDays = 2): Stock {
  if (item.level !== 'full') return item.level;
  const at = runOutAt(item);
  return at !== null && daysBetween(now, at) <= withinDays ? 'soon' : 'ok';
}

/** Tracked items predicted to run out soon that aren't on the list yet. */
export function runningOutSoon(items: Item[], now: number): Item[] {
  return items.filter((i) => i.tracked && !i.onList && stock(i, now) === 'soon');
}

/** Changes for setting a level by hand: low or out puts it on the list. */
export function withLevel(item: Item, level: Level): Item {
  return { ...item, level, onList: level === 'full' ? item.onList : true };
}

/** Ticking it off the list: restocked, and the purchase feeds the "lasts about" estimate. */
export function withBought(item: Item, now: number): Item {
  return { ...item, level: 'full', onList: false, bought: [...item.bought, now].slice(-MAX_BOUGHT) };
}

/** The list for a given store: items set to that store plus items for any store. */
export function listFor(items: Item[], storeId: string | null): Item[] {
  return items.filter((i) => i.onList && (storeId === null || i.store === null || i.store === storeId));
}
