import { DAY } from '../time';
import type { Plan, Profile } from './planner';
import { Equipment, RECIPE, Recipe } from './recipes';

/**
 * Rough gas and electricity for cooking, and when the LPG tank runs out.
 *
 * A two-burner LPG stove on medium burns about 0.15 kg an hour; appliances use
 * their usual wattage for the time they're on. Until a tank has been swapped once,
 * the empty date comes from the week's plan; after that, from how long tanks
 * really last in this kitchen.
 */

export type Rates = { lpgPerKg: number; kwh: number };

/** Tank size most homes use. */
export const TANK_KG = 11;
/** When Presyo has nothing: an 11 kg tank and Meralco-ish power, late 2026. */
export const DEFAULT_RATES: Rates = { lpgPerKg: 1350 / TANK_KG, kwh: 14 };

const LPG_KG_PER_HOUR = 0.15;
/** Boiling water, coffee, reheating: gas that isn't a planned dish. */
export const OTHER_GAS_PER_DAY = 0.04;
/** Share of a recipe's time that's actually cooking (the rest is chopping). */
const ACTIVE = 0.75;
const CHARCOAL_PESOS = 60;

/** kW and how much of the time it's drawing power. */
const APPLIANCE: Partial<Record<Equipment, { kw: number; duty: number }>> = {
  oven: { kw: 1.8, duty: 0.7 },
  air_fryer: { kw: 1.5, duty: 0.8 },
  microwave: { kw: 1.1, duty: 1 },
  pressure_cooker: { kw: 1, duty: 0.5 },
  slow_cooker: { kw: 0.2, duty: 1 },
};
const RICE_COOKER_KWH = 0.3;
const RICE_ON_STOVE_H = 0.33;

export type Energy = { lpgKg: number; kwh: number; charcoal: number };

const NONE: Energy = { lpgKg: 0, kwh: 0, charcoal: 0 };

/** Gas and power to cook a dish once, with what this kitchen has. */
export function energyOf(r: Recipe, equipment: Equipment[]): Energy {
  const has = new Set<string>(equipment);
  const tools = r.equipment.map((need) => {
    const opts = need.split('|');
    return (opts.find((o) => has.has(o)) ?? opts[0]) as Equipment;
  });
  const hours = (r.minutes * ACTIVE) / 60 / Math.max(1, tools.length);
  const e = { ...NONE };
  for (const t of tools) {
    if (t === 'stove') e.lpgKg += LPG_KG_PER_HOUR * hours;
    else if (t === 'grill') e.charcoal += CHARCOAL_PESOS;
    else if (t === 'rice_cooker') e.kwh += RICE_COOKER_KWH;
    else if (APPLIANCE[t]) e.kwh += APPLIANCE[t]!.kw * APPLIANCE[t]!.duty * hours;
  }
  if (r.rice) {
    if (has.has('rice_cooker')) e.kwh += RICE_COOKER_KWH;
    else e.lpgKg += LPG_KG_PER_HOUR * RICE_ON_STOVE_H;
  }
  return e;
}

export const pesos = (e: Energy, rates: Rates) => e.lpgKg * rates.lpgPerKg + e.kwh * rates.kwh + e.charcoal;

/** The week's cooking: every dish actually cooked (leftover days cook nothing). */
export function weekEnergy(plan: Plan, p: Pick<Profile, 'equipment'>): Energy {
  const out = { ...NONE };
  for (const s of plan.slots) {
    if (!s.cook || !RECIPE[s.recipeId]) continue;
    for (const id of [s.recipeId, ...s.sides]) {
      const e = RECIPE[id] ? energyOf(RECIPE[id], p.equipment) : NONE;
      out.lpgKg += e.lpgKg;
      out.kwh += e.kwh;
      out.charcoal += e.charcoal;
    }
  }
  return out;
}

/** Gas a day from the plan, plus everyday use. */
export function planGasPerDay(plan: Plan, p: Pick<Profile, 'equipment'>): number {
  const days = new Set(plan.slots.map((s) => s.day)).size || 7;
  return weekEnergy(plan, p).lpgKg / days + OTHER_GAS_PER_DAY;
}

export type Tank = {
  /** When the current tank was connected, or null if not tracked. */
  since: number | null;
  size: number;
  /** How many days earlier tanks lasted, newest last. */
  lasted: number[];
};

export const NO_TANK: Tank = { since: null, size: TANK_KG, lasted: [] };

/** Gas a day: learned from real tanks once there are some, else the plan's estimate. */
export function gasPerDay(tank: Tank, planned: number): number {
  const recent = tank.lasted.slice(-3);
  if (!recent.length) return planned;
  return tank.size / (recent.reduce((a, b) => a + b, 0) / recent.length);
}

/** Days of gas left and the day it likely runs out. */
export function tankLeft(tank: Tank, now: number, perDay: number): { days: number; emptyOn: number; share: number } | null {
  if (tank.since === null || perDay <= 0) return null;
  const used = ((now - tank.since) / DAY) * perDay;
  const left = Math.max(0, tank.size - used);
  const days = left / perDay;
  return { days, emptyOn: now + days * DAY, share: left / tank.size };
}

/** A new tank went in: remember how long the last one lasted. */
export function swapTank(tank: Tank, now: number): Tank {
  const lasted = tank.since === null ? tank.lasted : [...tank.lasted, Math.max(1, Math.round((now - tank.since) / DAY))].slice(-6);
  return { ...tank, since: now, lasted };
}

/** Middle of a [low, high] price range, or the number itself. */
const mid = (x: number | [number, number] | null | undefined) => (Array.isArray(x) ? (x[0] + x[1]) / 2 : (x ?? null));

/** Presyo's LPG file: the latest month's 11 kg tank price range. */
export function lpgFromPresyo(json: { periods?: string[]; s?: ([number, number] | number | null)[] } | null): { perKg: number; period: string } | null {
  if (!json?.s?.length || !json.periods) return null;
  for (let i = json.s.length - 1; i >= 0; i--) {
    const m = mid(json.s[i]);
    if (m) return { perKg: m / TANK_KG, period: json.periods[i] };
  }
  return null;
}

/** Presyo's power file: the region's typical ₱/kWh in the latest month with numbers. */
export function kwhFromPresyo(json: { periods?: string[]; utilities?: { s: (number | null)[] }[] } | null): { kwh: number; period: string } | null {
  if (!json?.utilities?.length || !json.periods) return null;
  for (let i = json.periods.length - 1; i >= 0; i--) {
    const vals = json.utilities.map((u) => u.s[i]).filter((x): x is number => typeof x === 'number').sort((a, b) => a - b);
    if (vals.length) return { kwh: vals[vals.length >> 1], period: json.periods[i] };
  }
  return null;
}
