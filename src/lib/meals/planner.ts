import { AISLES } from '../../data/starters';
import { Group, INGREDIENT, Ingredient } from './ingredients';
import { addDays, startOfDay } from '../time';
import { PayWeek, feastOn, holidayOn, meatless, payWeek } from './phcalendar';
import { PriceBook, Shop } from './prices';
import { Cuisine, Diet, Equipment, FESTIVE, Meal, RECIPE, RECIPES, RICE_PER_SERVING, Recipe, SABAW, Vibe, canCook, fitsDiet, groupsOf } from './recipes';
import type { DayWeather } from './weather';

/** Everything the meal questionnaire asks. */
export type Profile = {
  shop: Shop;
  /** PSA region code for prices. */
  area: string;
  adults: number;
  kids: number;
  meals: Meal[];
  /** Days you cook, 0 = Sunday. */
  days: number[];
  equipment: Equipment[];
  diets: Diet[];
  /** Empty means any cuisine. */
  cuisines: Cuisine[];
  vibes: Vibe[];
  allergies: Group[];
  dislikes: Group[];
  /** Ingredient ids already in the kitchen. */
  have: string[];
  /** Pesos a week. */
  budget: number;
  /** People who take a packed lunch (baon) to school or work on weekdays, cooked with the night before's dinner. */
  baon?: number;
  /** Who takes turns cooking; empty means no rotation. */
  cooks?: string[];
  /** Days of the month you're paid (15 and 30 for most); empty means don't follow paydays. */
  payday?: number[];
  /** Keep Ash Wednesday and the Fridays of Lent meatless. */
  lent?: boolean;
  /** Turn leftovers into tomorrow's dish (sinangag, adobo flakes...). On unless turned off. */
  leftovers?: boolean;
  /** When you eat, for "start cooking by" times. */
  mealTimes?: Partial<Record<Meal, string>>;
};

/** What the rest of Gawain knows about the week, used to shape the plan. */
export type PlanContext = {
  seed?: number;
  /** Weekday the plan starts on. */
  start?: number;
  /** Weekday → minutes of meetings during work hours (from the calendar). */
  load?: Record<number, number>;
  /** Ingredient → days until what's in the kitchen goes off. */
  useSoon?: Record<string, number>;
  /** The date the plan starts (defaults to the next `start` weekday from now). */
  from?: number;
  /** Weekday → forecast. */
  weather?: Record<number, DayWeather>;
  /** Bagyo mode: cook from the pantry and what keeps without a fridge. */
  bagyo?: boolean;
};

/** A day with this much meeting time gets quick dishes. */
export const HEAVY_DAY = 240;
const LIGHT_DAY = 60;
const BAON_PORTION = 0.8;

export const MEAL_ORDER: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];
/** Restrictions are hard rules; the rest of the diet answers are preferences. */
const STRICT: Diet[] = ['vegan', 'vegetarian', 'pescatarian', 'no_pork', 'no_beef'];
const KID = 0.6;
const GLP1_ADULT = 0.8;

/** How many adult-size portions one meal needs. */
export function portions(p: Pick<Profile, 'adults' | 'kids' | 'diets'>): number {
  const adult = p.diets.includes('glp1') ? GLP1_ADULT : 1;
  return Math.round((p.adults * adult + p.kids * KID) * 10) / 10;
}

/** Plates a week: every person, every meal, every cooking day. */
export function servingsPerWeek(p: Pick<Profile, 'adults' | 'kids' | 'meals' | 'days'>): number {
  return (p.adults + p.kids) * p.meals.length * p.days.length;
}

/** Recipes this household can and would eat, ignoring cost. */
export function eligible(p: Profile, recipes = RECIPES): Recipe[] {
  const eq = new Set<string>(p.equipment);
  const avoid = new Set<Group>([...p.allergies, ...p.dislikes]);
  const strict = p.diets.filter((d) => STRICT.includes(d));
  return recipes.filter((r) => {
    if (!canCook(r, eq)) return false;
    if (strict.some((d) => !fitsDiet(r, d))) return false;
    for (const g of groupsOf(r)) if (avoid.has(g)) return false;
    return true;
  });
}

/** Ingredient amounts for `n` portions of a recipe, rice included. */
export function linesFor(r: Recipe, n: number): { id: string; qty: number }[] {
  const k = n / r.serves;
  const out = r.ingredients.map((l) => ({ id: l.id, qty: l.qty * k }));
  if (r.rice) out.push({ id: 'rice', qty: RICE_PER_SERVING * n });
  return out;
}

/** What a planned meal takes: its dish without what comes from leftovers, its sides, and any extra rice for tomorrow. */
export function slotLines(s: Pick<Slot, 'recipeId' | 'portions' | 'sides' | 'uses' | 'extraRice'>): { id: string; qty: number }[] {
  const r = RECIPE[s.recipeId];
  if (!r) return [];
  const k = s.portions / r.serves;
  const own = r.ingredients.filter((l) => !(s.uses && l.left)).map((l) => ({ id: l.id, qty: l.qty * k }));
  if (r.rice) own.push({ id: 'rice', qty: RICE_PER_SERVING * s.portions });
  if (s.extraRice) own.push({ id: 'rice', qty: s.extraRice });
  for (const side of s.sides) if (RECIPE[side]) own.push(...linesFor(RECIPE[side], s.portions));
  return own;
}

/** Cost of a planned meal as bought (leftovers it reuses cost nothing again). */
export function slotCost(s: Slot, prices: PriceBook, have: Set<string> = new Set()): number {
  return slotLines(s).reduce((sum, l) => sum + (have.has(l.id) ? 0 : l.qty * (prices[l.id]?.perUnit ?? 0)), 0);
}

/** Cost of `n` portions using the share of each ingredient actually used. */
export function costOf(r: Recipe, n: number, prices: PriceBook, have: Set<string> = new Set()): number {
  return linesFor(r, n).reduce((sum, l) => sum + (have.has(l.id) ? 0 : l.qty * (prices[l.id]?.perUnit ?? 0)), 0);
}

export type Slot = {
  key: string;
  day: number;
  meal: Meal;
  recipeId: string;
  portions: number;
  /** False for leftovers of an earlier cook (batch cooking). */
  cook: boolean;
  /** For a cook, the leftover slots it covers; for leftovers, the cook's key. */
  linked: string[];
  sides: string[];
  /** Extra packed lunches cooked with this dinner for tomorrow. */
  baon?: number;
  /** Whose turn it is to cook. */
  by?: string;
  /** Made from the leftovers of this earlier slot. */
  uses?: string;
  /** Cooks extra for this later slot's leftover dish. */
  feeds?: string;
  /** Extra portions cooked for `feeds`. */
  extraFor?: number;
  /** Extra uncooked rice (g) cooked tonight for tomorrow's sinangag. */
  extraRice?: number;
};

export type GroceryLine = {
  id: string;
  name: string;
  aisle: string;
  /** Amount needed in base units. */
  need: number;
  unit: Ingredient['unit'];
  /** How to buy it, e.g. "750 g" or "2 × 155 g can". */
  buy: string;
  cost: number;
  have: boolean;
  staple: boolean;
  /** Dishes that use it. */
  for: string[];
};

export type Plan = {
  createdAt: number;
  seed: number;
  /** Weekday the plan starts on. */
  start: number;
  slots: Slot[];
  grocery: GroceryLine[];
  /** Expected spend on things you need to buy (staples counted by the share used). */
  total: number;
  /** The week's budget: the weekly budget moved for the pay cycle. */
  budget: number;
  /** Where this week falls in the pay cycle, if following paydays. */
  pay?: PayWeek;
};

/** Small seeded RNG so "Shuffle" gives a new plan but the same seed gives the same plan. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const PROTEINS: Group[] = ['pork', 'beef', 'chicken', 'fish', 'shellfish', 'tofu', 'beans', 'egg'];
const proteinOf = (r: Recipe) => PROTEINS.find((g) => groupsOf(r).has(g)) ?? null;
const nonStaple = (r: Recipe) => r.ingredients.filter((l) => !INGREDIENT[l.id]?.staple).map((l) => l.id);

type Ctx = {
  p: Profile;
  prices: PriceBook;
  have: Set<string>;
  target: number;
  random: () => number;
  start: number;
  load: Record<number, number>;
  useSoon: Record<string, number>;
  /** Weekday → the date it falls on in this plan. */
  dates: Record<number, number>;
  weather: Record<number, DayWeather>;
  bagyo: boolean;
};

/** Every ingredient (staples aside) keeps two weeks or more: cans, rice, eggs, roots. */
export function keepsWithoutMarket(r: Recipe): boolean {
  return nonStaple(r).every((id) => (INGREDIENT[id]?.life ?? 0) >= 14);
}

/**
 * How much a dish's ingredients have moved in price over the last month, weighted
 * by what each costs in it (0.1 = its ingredients are 10% dearer than a month ago).
 */
export function pricePressure(r: Recipe, prices: PriceBook): number {
  let w = 0;
  let sum = 0;
  for (const l of r.ingredients) {
    const pr = prices[l.id];
    if (!pr || INGREDIENT[l.id]?.staple || pr.change === undefined) continue;
    const c = l.qty * pr.perUnit;
    w += c;
    sum += c * pr.change;
  }
  return w ? sum / w : 0;
}

function score(r: Recipe, slot: { day: number; meal: Meal }, ctx: Ctx, used: Map<string, number>, bought: Set<string>, prev: Recipe | null): number {
  const { p } = ctx;
  let s = ctx.random() * 1.5;
  if (p.cuisines.length && p.cuisines.includes(r.cuisine)) s += 3;
  for (const v of p.vibes) {
    if (v === 'quick' ? r.minutes <= 25 : v === 'budget' ? false : r.tags.includes(v)) s += 1.5;
  }
  for (const d of p.diets) if (!STRICT.includes(d) && (r.labels ?? []).includes(d as 'high_protein')) s += 2;

  const ids = nonStaple(r);
  if (ids.length) {
    s += (4 * ids.filter((i) => ctx.have.has(i)).length) / ids.length;
    s += (2 * ids.filter((i) => bought.has(i)).length) / ids.length;
  }

  const per = costOf(r, 1, ctx.prices, ctx.have);
  const over = per / ctx.target - 1;
  s -= (p.vibes.includes('budget') ? 5 : 3) * Math.max(0, over);
  if (over < -0.3) s += 0.5;

  // Prices that jumped this month push a dish down; ones that fell push it up.
  const pressure = pricePressure(r, ctx.prices);
  s -= 4 * Math.max(0, pressure - 0.05) * 10;
  s += 2 * Math.max(0, -pressure - 0.03) * 10;

  // Busy meeting days get quick cooking; light days have room for the slow dishes.
  if (slot.meal === 'lunch' || slot.meal === 'dinner') {
    const busy = ctx.load[slot.day] ?? 0;
    if (busy >= HEAVY_DAY) s += r.minutes <= 20 ? 1 : r.minutes > 30 ? -2.5 : 0;
    else if (busy <= LIGHT_DAY && r.minutes >= 50) s += 0.5;
  }

  // Cook what's about to go off before it does.
  const offset = (slot.day - ctx.start + 7) % 7;
  let fresh = 0;
  for (const l of r.ingredients) {
    const left = ctx.useSoon[l.id];
    if (left !== undefined && offset <= left) fresh += 3;
  }
  s += Math.min(6, fresh);

  // Weather: sabaw in the rain, nothing long or ovened on a hot day, pantry cooking in a storm.
  const w = ctx.weather[slot.day];
  if (w?.rain && SABAW.has(r.id)) s += 2.5;
  if (w?.hot) {
    if (r.tags.includes('no_cook') || r.minutes <= 20) s += 1;
    if (r.minutes > 60 || (r.equipment.includes('oven') && !r.equipment.some((e) => e.includes('|')))) s -= 1.5;
  }
  const stormy = ctx.bagyo || !!w?.storm || !!ctx.weather[(slot.day + 6) % 7]?.storm;
  if (stormy) {
    // Fish, leafy greens and fresh seafood won't be at the market (or keep without power).
    const spoils = nonStaple(r).filter((id) => (INGREDIENT[id]?.life ?? 30) <= 3).length;
    s += (keepsWithoutMarket(r) ? 3 : 0) - Math.min(6, 3 * spoils);
  }

  // Holidays and Noche Buena / Media Noche call for handaan dishes.
  const date = ctx.dates[slot.day];
  if (date !== undefined && (slot.meal === 'dinner' || slot.meal === 'lunch') && FESTIVE.has(r.id)) {
    if (feastOn(date) && slot.meal === 'dinner') s += 6;
    else if (holidayOn(date)) s += 2;
  }

  s -= 6 * (used.get(r.id) ?? 0);
  if (r.family) s -= 4 * (used.get(`family:${r.family}`) ?? 0);
  if (prev && proteinOf(prev) && proteinOf(prev) === proteinOf(r)) s -= 2.5;
  // Working from home: weekday lunches should be quick.
  if (slot.meal === 'lunch' && slot.day >= 1 && slot.day <= 5 && r.minutes > 40) s -= 2;
  if (slot.meal === 'breakfast' && r.minutes > 30) s -= 1.5;
  return s;
}

/** Days in plan order, starting from `start` (the weekday the plan begins, Monday by default). */
export function orderedDays(days: number[], start = 1): number[] {
  return [...days].sort((a, b) => ((a - start + 7) % 7) - ((b - start + 7) % 7));
}

/**
 * Build a week: pick a dish for every meal on every cooking day, then swap the
 * priciest dishes for cheaper ones until the grocery total fits the budget (or
 * nothing cheaper fits the rules).
 */
export function makePlan(p: Profile, prices: PriceBook, opts: number | PlanContext = {}, recipes = RECIPES): Plan {
  const { seed = Date.now(), start = 1, load = {}, useSoon = {}, weather = {}, bagyo = false, from: fromOpt }: PlanContext = typeof opts === 'number' ? { seed: opts } : opts;
  const from = startOfDay(fromOpt ?? nextWeekday(Date.now(), start));
  const pay = p.payday?.length ? payWeek(from, p.payday) : undefined;
  const budget = Math.round(p.budget * (pay?.factor ?? 1));
  const pool = eligible(p, recipes).filter((r) => !r.side && !r.leftover);
  const have = new Set(p.have);
  const n = portions(p);
  const target = Math.max(10, budget / Math.max(1, n * p.meals.length * p.days.length));
  const dates: Record<number, number> = {};
  for (let i = 0; i < 7; i++) dates[(start + i) % 7] = addDays(from, i);
  const ctx: Ctx = { p, prices, have, target, random: rng(seed), start, load, useSoon, dates, weather, bagyo };
  const baon = Math.max(0, p.baon ?? 0);
  const used = new Map<string, number>();
  const bought = new Set<string>();
  const slots: Slot[] = [];
  const days = orderedDays(p.days, start);
  const meals = MEAL_ORDER.filter((m) => p.meals.includes(m));
  const batch = p.vibes.includes('batch');
  const taken = new Set<string>();
  let prev: Recipe | null = null;

  for (let di = 0; di < days.length; di++) {
    const day = days[di];
    for (const meal of meals) {
      const key = `${day}-${meal}`;
      if (taken.has(key)) continue;
      // Lent: no meat on Ash Wednesday and Fridays, for those who keep it.
      const noMeat = !!p.lent && meatless(dates[day]);
      const fits = pool.filter((r) => r.meals.includes(meal) && (!noMeat || fitsDiet(r, 'pescatarian')));
      if (!fits.length) continue;
      const best = fits.map((r) => ({ r, s: score(r, { day, meal }, ctx, used, bought, prev) })).sort((a, b) => b.s - a.s)[0].r;
      const slot: Slot = { key, day, meal, recipeId: best.id, portions: n, cook: true, linked: [], sides: [] };
      // Weeknight dinners also pack tomorrow's baon, if the dish keeps (not before a holiday).
      const tomorrow = (day + 1) % 7;
      const offTomorrow = !!holidayOn(addDays(dates[day], 1));
      if (baon && meal === 'dinner' && tomorrow >= 1 && tomorrow <= 5 && !offTomorrow && best.keeps >= 1) {
        slot.baon = baon;
        slot.portions = Math.round((n + baon * BAON_PORTION) * 10) / 10;
      }
      // Cook dinner once, eat it again for tomorrow's lunch.
      const nextDay = days[di + 1];
      if (batch && meal === 'dinner' && best.keeps >= 2 && nextDay !== undefined && meals.includes('lunch') && (nextDay - day + 7) % 7 === 1) {
        const lk = `${nextDay}-lunch`;
        taken.add(lk);
        slot.linked.push(lk);
        slot.portions = Math.round((slot.portions + n) * 10) / 10;
        slots.push(slot, { key: lk, day: nextDay, meal: 'lunch', recipeId: best.id, portions: n, cook: false, linked: [key], sides: [] });
      } else {
        slots.push(slot);
      }
      used.set(best.id, (used.get(best.id) ?? 0) + 1);
      if (best.family) used.set(`family:${best.family}`, (used.get(`family:${best.family}`) ?? 0) + 1);
      for (const id of nonStaple(best)) bought.add(id);
      prev = best;
    }
  }
  slots.sort((a, b) => days.indexOf(a.day) - days.indexOf(b.day) || MEAL_ORDER.indexOf(a.meal) - MEAL_ORDER.indexOf(b.meal));

  fitBudget(slots, p, prices, pool, budget, dates);
  if (p.leftovers !== false) chainLeftovers(slots, p, days, dates, recipes);
  assignCooks(slots, p.cooks ?? []);
  return { ...finish(slots, p, prices, seed, start, budget), pay };
}

/** The next date that is this weekday (today if it is). */
export function nextWeekday(now: number, weekday: number): number {
  const day = startOfDay(now);
  return addDays(day, (weekday - new Date(day).getDay() + 7) % 7);
}

const MAX_CHAINS = 3;

/**
 * Turn some of tonight's leftovers into tomorrow's dish: extra rice for sinangag,
 * a bigger adobo for adobo flakes. The earlier dish is cooked bigger, and the later
 * one doesn't buy what it reuses.
 */
export function chainLeftovers(slots: Slot[], p: Profile, days: number[], dates: Record<number, number>, recipes = RECIPES) {
  const chains = eligible(p, recipes).filter((r) => r.leftover);
  if (!chains.length) return;
  const usedChain = new Map<string, number>();
  let count = 0;
  for (const src of slots) {
    if (count >= MAX_CHAINS) break;
    if (!src.cook || src.feeds || src.meal === 'breakfast') continue;
    const r = RECIPE[src.recipeId];
    const next = days[days.indexOf(src.day) + 1];
    if (next === undefined || (next - src.day + 7) % 7 !== 1) continue;
    for (const c of chains) {
      const lo = c.leftover!;
      const matches = lo.from === 'rice' ? !!r.rice && src.meal === 'dinner' : lo.from.includes(r.id);
      if (!matches || (usedChain.get(c.id) ?? 0) >= (lo.from === 'rice' ? 2 : 1)) continue;
      const target = slots.find((t) => t.day === next && c.meals.includes(t.meal) && t.cook && !t.uses && !t.feeds && !t.linked.length);
      if (!target) continue;
      if (p.lent && meatless(dates[next]) && !fitsDiet(c, 'pescatarian')) continue;
      target.recipeId = c.id;
      target.sides = [];
      target.uses = src.key;
      src.feeds = target.key;
      if (lo.from === 'rice') src.extraRice = Math.round(RICE_PER_SERVING * target.portions);
      else {
        src.extraFor = Math.round(lo.share * target.portions * 10) / 10;
        src.portions = Math.round((src.portions + src.extraFor) * 10) / 10;
      }
      usedChain.set(c.id, (usedChain.get(c.id) ?? 0) + 1);
      count++;
      break;
    }
  }
}

/** Undo a leftover chain touching `key`: the later dish then buys its own. */
function unchain(slots: Slot[], key: string) {
  const s = slots.find((x) => x.key === key);
  if (!s) return;
  const src = s.uses ? slots.find((x) => x.key === s.uses) : s.feeds ? s : null;
  const dst = src?.feeds ? slots.find((x) => x.key === src.feeds) : null;
  if (src) {
    if (src.extraFor) src.portions = Math.round((src.portions - src.extraFor) * 10) / 10;
    delete src.extraFor;
    delete src.extraRice;
    delete src.feeds;
  }
  if (dst) delete dst.uses;
}

/** Swap the dish that saves the most until the week fits the budget. */
function fitBudget(slots: Slot[], p: Profile, prices: PriceBook, pool: Recipe[], budget = p.budget, dates: Record<number, number> = {}) {
  const have = new Set(p.have);
  for (let i = 0; i < 60 && totalOf(slots, p, prices) > budget; i++) {
    let bestSave = 0;
    let swap: { slot: Slot; r: Recipe } | null = null;
    const usedIds = new Set(slots.map((s) => s.recipeId));
    for (const s of slots) {
      if (!s.cook) continue;
      const cur = costOf(RECIPE[s.recipeId], s.portions, prices, have);
      for (const r of pool) {
        if (!r.meals.includes(s.meal) || r.id === s.recipeId) continue;
        if (p.lent && dates[s.day] !== undefined && meatless(dates[s.day]) && !fitsDiet(r, 'pescatarian')) continue;
        if (s.linked.length && r.keeps < 2) continue;
        if (s.baon && r.keeps < 1) continue;
        // Prefer variety: only repeat a dish if it saves a lot.
        const save = cur - costOf(r, s.portions, prices, have) - (usedIds.has(r.id) ? cur * 0.25 : 0);
        if (save > bestSave) {
          bestSave = save;
          swap = { slot: s, r };
        }
      }
    }
    if (!swap) break;
    swap.slot.recipeId = swap.r.id;
    for (const k of swap.slot.linked) {
      const left = slots.find((x) => x.key === k);
      if (left) left.recipeId = swap.r.id;
    }
  }
}

function totalOf(slots: Slot[], p: Profile, prices: PriceBook): number {
  return grocery(slots, p, prices).reduce((n, g) => n + (g.have ? 0 : g.cost), 0);
}

const QUARTERS = ['', '¼', '½', '¾'];

/** "¼ kilo", "1½ kilo": how the palengke weighs things, rounded up to the quarter. */
export function kilo(grams: number): string {
  const q = Math.max(1, Math.ceil(grams / 250 - 0.04));
  const whole = Math.floor(q / 4);
  return `${whole || ''}${QUARTERS[q % 4]} kilo`.trim();
}

/**
 * How to buy an ingredient and what that costs. At the palengke, things sold by weight
 * come in quarter kilos (small amounts of garlic or chili are weighed as-is), bundles
 * are by the tali and eggs by the piece. Supermarkets sell grams and whole packs.
 */
export function howToBuy(ing: Ingredient, qty: number, per: number, shop: Shop): { buy: string; cost: number } {
  const palengke = shop !== 'supermarket';
  const byWeight = ing.packLabel === 'kg' || ing.packLabel === '1 L carton';
  if (byWeight) {
    if (palengke && ing.unit === 'g' && qty >= 150) {
      const g = Math.max(1, Math.ceil(qty / 250 - 0.04)) * 250;
      return { buy: kilo(qty), cost: g * per };
    }
    return { buy: fmtAmount(qty, ing.unit), cost: qty * per };
  }
  if (palengke && ing.loose && ing.unit === 'pc' && qty < ing.pack) {
    const n = Math.ceil(qty - 0.05);
    return { buy: `${n} piraso`, cost: n * per };
  }
  const packs = Math.max(1, Math.ceil(qty / ing.pack - 0.05));
  if (palengke && ing.packLabel === 'bundle') return { buy: `${packs} tali`, cost: packs * ing.pack * per };
  return { buy: `${packs} × ${ing.packLabel}`, cost: packs * ing.pack * per };
}

function fmtAmount(qty: number, unit: Ingredient['unit']): string {
  if (unit === 'pc') return `${Math.ceil(qty)}`;
  if (qty >= 1000) return `${Math.round(qty / 100) / 10} ${unit === 'g' ? 'kg' : 'L'}`;
  return `${Math.max(5, Math.round(qty / 5) * 5)} ${unit}`;
}

/**
 * The shopping list for these slots: amounts added up across dishes. Things sold by
 * weight are costed by weight; packs (cans, bottles, bundles) are rounded up to whole
 * packs; staples count only the share used, since a bottle of soy sauce lasts weeks.
 */
export function grocery(slots: Slot[], p: Profile, prices: PriceBook): GroceryLine[] {
  const have = new Set(p.have);
  const need = new Map<string, { qty: number; for: Set<string> }>();
  for (const s of slots) {
    if (!s.cook || !RECIPE[s.recipeId]) continue;
    const name = RECIPE[s.recipeId].name;
    for (const l of slotLines(s)) {
      const cur = need.get(l.id) ?? { qty: 0, for: new Set<string>() };
      cur.qty += l.qty;
      cur.for.add(name);
      need.set(l.id, cur);
    }
  }
  const out: GroceryLine[] = [];
  for (const [id, { qty, for: dishes }] of need) {
    const ing = INGREDIENT[id];
    if (!ing) continue;
    const per = prices[id]?.perUnit ?? ing.est / ing.pack;
    const staple = !!ing.staple;
    const { buy, cost } = staple ? { buy: `${fmtAmount(qty, ing.unit)} used`, cost: qty * per } : howToBuy(ing, qty, per, p.shop);
    out.push({
      id,
      name: ing.name,
      aisle: ing.aisle,
      need: qty,
      unit: ing.unit,
      buy,
      cost: Math.round(cost * 100) / 100,
      have: have.has(id),
      staple,
      for: [...dishes],
    });
  }
  // Walk the store in Gawain's aisle order (produce first, condiments last).
  const order = (a: string) => {
    const i = (AISLES as readonly string[]).indexOf(a);
    return i < 0 ? 99 : i;
  };
  return out.sort((a, b) => order(a.aisle) - order(b.aisle) || a.name.localeCompare(b.name));
}

function finish(slots: Slot[], p: Profile, prices: PriceBook, seed: number, start = 1, budget = p.budget): Plan {
  const list = grocery(slots, p, prices);
  return {
    createdAt: Date.now(),
    seed,
    start,
    slots,
    grocery: list,
    total: Math.round(list.reduce((n, g) => n + (g.have ? 0 : g.cost), 0)),
    budget,
  };
}

/** Recompute the list and total after changing a dish or side. */
export function replan(plan: Plan, p: Profile, prices: PriceBook): Plan {
  const budget = plan.pay ? Math.round(p.budget * plan.pay.factor) : p.budget;
  return { ...finish(plan.slots, p, prices, plan.seed, plan.start, budget), createdAt: plan.createdAt, pay: plan.pay };
}

/** Put a different dish in one slot (and its leftovers). */
export function swapSlot(plan: Plan, key: string, recipeId: string, p: Profile, prices: PriceBook): Plan {
  const slots = plan.slots.map((s) => ({ ...s }));
  const s = slots.find((x) => x.key === key);
  if (!s) return plan;
  const cook = s.cook ? s : slots.find((x) => x.key === s.linked[0]);
  if (cook && (cook.uses || cook.feeds)) unchain(slots, cook.key);
  for (const x of slots) if (x === cook || cook?.linked.includes(x.key)) x.recipeId = recipeId;
  return replan({ ...plan, slots }, p, prices);
}

export type BudgetLevel = 'very_tight' | 'tight' | 'on_budget' | 'comfortable';

/**
 * What a week usually costs for this household with today's prices: the cheapest
 * quarter of eligible dishes ("low") and the middle ("typical"), per plate and per week.
 */
export function budgetGuide(p: Profile, prices: PriceBook): { low: number; typical: number; perPlate: number; level: BudgetLevel } {
  const n = portions(p);
  const plates = Math.max(1, n * p.meals.length * p.days.length);
  const have = new Set(p.have);
  const costs = eligible(p)
    .filter((r) => !r.side && r.meals.some((m) => p.meals.includes(m)))
    .map((r) => costOf(r, 1, prices, have))
    .sort((a, b) => a - b);
  const pick = (q: number) => (costs.length ? costs[Math.min(costs.length - 1, Math.floor(q * costs.length))] : 0);
  const low = Math.round(pick(0.25) * plates);
  const typical = Math.round(pick(0.5) * plates);
  const level: BudgetLevel = p.budget < low * 0.9 ? 'very_tight' : p.budget < typical * 0.9 ? 'tight' : p.budget <= typical * 1.3 ? 'on_budget' : 'comfortable';
  return { low, typical, perPlate: p.budget / Math.max(1, servingsPerWeek(p)), level };
}

export function planLevel(total: number, budget: number): 'over' | 'close' | 'under' {
  if (total > budget) return 'over';
  if (total > budget * 0.9) return 'close';
  return 'under';
}

/** Dishes ranked by how much of them you can make with what's already in the kitchen. */
export function fromWhatYouHave(p: Profile, limit = 6): { recipe: Recipe; share: number; missing: string[] }[] {
  const have = new Set(p.have);
  return eligible(p)
    .filter((r) => !r.side)
    .map((r) => {
      const ids = nonStaple(r);
      const missing = ids.filter((i) => !have.has(i));
      return { recipe: r, share: ids.length ? 1 - missing.length / ids.length : 0, missing };
    })
    .filter((x) => x.share > 0)
    .sort((a, b) => b.share - a.share || a.missing.length - b.missing.length)
    .slice(0, limit);
}

/**
 * Other dishes for a slot, cheapest first, that follow the household's rules, priced
 * for the same number of portions. A dinner that also covers tomorrow's lunch only
 * offers dishes that keep.
 */
export function alternatives(
  p: Profile,
  prices: PriceBook,
  meal: Meal,
  exclude: string,
  limit = 8,
  opts: { portions?: number; keeps?: boolean } = {},
): { recipe: Recipe; cost: number }[] {
  const n = opts.portions ?? portions(p);
  const have = new Set(p.have);
  return eligible(p)
    .filter((r) => !r.side && r.meals.includes(meal) && r.id !== exclude && (!opts.keeps || r.keeps >= 2))
    .map((r) => ({ recipe: r, cost: costOf(r, n, prices, have) }))
    .sort((a, b) => a.cost - b.cost)
    .slice(0, limit);
}

/** Sides that go with a main and that the household can eat. */
export function sidesFor(p: Profile, r: Recipe): Recipe[] {
  const ok = new Set(eligible(p).map((x) => x.id));
  return (r.pairs ?? []).map((id) => RECIPE[id]).filter((x): x is Recipe => !!x && ok.has(x.id));
}


/** Take turns by the day: one person cooks everything that day. Leftover meals need no cook. */
export function assignCooks(slots: Slot[], cooks: string[]) {
  const names = cooks.map((c) => c.trim()).filter(Boolean);
  const days: number[] = [];
  for (const s of slots) if (!days.includes(s.day)) days.push(s.day);
  for (const s of slots) s.by = s.cook && names.length ? names[days.indexOf(s.day) % names.length] : undefined;
}
