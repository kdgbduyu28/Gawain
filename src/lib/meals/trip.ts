import { INGREDIENT } from './ingredients';
import { GroceryLine, Profile, Slot, grocery } from './planner';
import { PriceBook } from './prices';
import { RECIPE } from './recipes';

// Palengke trip ---------------------------------------------------------------------

export type Section = 'dry' | 'veg' | 'fruit' | 'eggs' | 'meat' | 'fish';

/** The palengke route: dry goods first, meat and fish last so they stay cold. */
export const ROUTE: Section[] = ['dry', 'veg', 'fruit', 'eggs', 'meat', 'fish'];

export const SECTION_LABEL: Record<Section, string> = {
  dry: 'Dry goods, rice and condiments',
  veg: 'Gulayan (vegetables)',
  fruit: 'Prutasan (fruit)',
  eggs: 'Eggs and tokwa',
  meat: 'Karnehan (meat)',
  fish: 'Isdaan (fish and seafood)',
};

const FRUIT = new Set(['banana', 'banana_saba', 'mango', 'papaya', 'avocado', 'calamansi']);

export function sectionOf(id: string): Section {
  const ing = INGREDIENT[id];
  const g = new Set(ing?.groups ?? []);
  if (g.has('fish') || g.has('shellfish')) return ing?.aisle === 'Pantry' ? 'dry' : 'fish';
  if (ing?.aisle === 'Meat & fish') return 'meat';
  if (FRUIT.has(id)) return 'fruit';
  if (ing?.aisle === 'Produce') return 'veg';
  if (id === 'egg' || id === 'tofu') return 'eggs';
  return 'dry';
}

/** The shopping list grouped in walking order. */
export function byRoute(lines: GroceryLine[]): { section: Section; lines: GroceryLine[] }[] {
  return ROUTE.map((section) => ({ section, lines: lines.filter((l) => sectionOf(l.id) === section) })).filter((x) => x.lines.length);
}

export type Cash = { value: number; count: number }[];

/**
 * What to bring in cash: the total plus 10% for prices that moved, in bills and
 * coins vendors can change: one ₱1,000 at most, and a pouch of small change.
 */
export function cashFor(total: number): { bring: number; cash: Cash } {
  const bring = Math.max(200, Math.ceil((total * 1.1) / 50) * 50);
  const change: Cash = [
    { value: 20, count: 5 },
    { value: 10, count: 3 },
    { value: 5, count: 4 },
  ];
  let rest = bring - change.reduce((n, c) => n + c.value * c.count, 0);
  const out: Cash = [];
  for (const [value, max] of [
    [1000, 1],
    [500, 2],
    [100, 99],
    [50, 99],
  ] as const) {
    const count = Math.min(max, Math.floor(rest / value));
    if (count) out.push({ value, count });
    rest -= count * value;
  }
  // Whatever is left under ₱50 goes into the change pouch as ₱20s.
  if (rest > 0) change[0].count += Math.ceil(rest / 20);
  return { bring, cash: [...out, ...change] };
}

// Handaan ----------------------------------------------------------------------------

/** Portions of mains each guest eats at a buffet, shared across the dishes. */
export const BUFFET_APPETITE = 1.2;
const KID = 0.6;

/** Portions of each dish for a party. */
export function partyPortions(guests: number, kids: number, dishes: number): number {
  const eaters = guests + kids * KID;
  return Math.round(((eaters * BUFFET_APPETITE) / Math.max(1, dishes)) * 10) / 10;
}

export function partySlots(ids: string[], guests: number, kids: number): Slot[] {
  const n = partyPortions(guests, kids, ids.length);
  return ids.filter((id) => RECIPE[id]).map((id, i) => ({ key: `party-${i}`, day: 0, meal: 'dinner', recipeId: id, portions: n, cook: true, linked: [], sides: [] }));
}

export function partyList(ids: string[], guests: number, kids: number, p: Profile, prices: PriceBook): GroceryLine[] {
  return grocery(partySlots(ids, guests, kids), { ...p, have: [] }, prices);
}

// Who paid ---------------------------------------------------------------------------

export type Trip = { id: string; at: number; by: string; amount: number; note: string };
export type Transfer = { from: string; to: string; amount: number };

/**
 * Even split between `people`: what each paid against their share, and the fewest
 * hand-overs that settle it.
 */
export function settle(trips: Trip[], people: string[]): { total: number; share: number; net: Record<string, number>; transfers: Transfer[] } {
  const names = [...new Set([...people, ...trips.map((t) => t.by)])].filter(Boolean);
  const total = trips.reduce((n, t) => n + t.amount, 0);
  const share = names.length ? total / names.length : 0;
  const net: Record<string, number> = Object.fromEntries(names.map((n) => [n, -share]));
  for (const t of trips) net[t.by] = (net[t.by] ?? 0) + t.amount;
  const owe = names.filter((n) => net[n] < -0.5).map((n) => ({ n, v: -net[n] }));
  const get = names.filter((n) => net[n] > 0.5).map((n) => ({ n, v: net[n] }));
  const transfers: Transfer[] = [];
  owe.sort((a, b) => b.v - a.v);
  get.sort((a, b) => b.v - a.v);
  let i = 0;
  let j = 0;
  while (i < owe.length && j < get.length) {
    const x = Math.min(owe[i].v, get[j].v);
    transfers.push({ from: owe[i].n, to: get[j].n, amount: Math.round(x) });
    owe[i].v -= x;
    get[j].v -= x;
    if (owe[i].v < 0.5) i++;
    if (get[j].v < 0.5) j++;
  }
  return { total, share, net, transfers };
}
