import { DAY, addDays, startOfDay } from '../time';

/**
 * The Philippine calendar the meal plan cares about: holidays (no baon, room for a
 * handaan), Lent (meatless days for those who keep them) and paydays (the 15th and
 * 30th for most people). Holidays follow the law that sets them every year; ones a
 * proclamation moves, and the Eid holidays (dated each year by proclamation), aren't
 * known ahead.
 */

export type Holiday = { date: number; name: string; kind: 'regular' | 'special' };

/** Easter Sunday (Gregorian), the anchor for Holy Week and Lent. */
export function easter(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day).getTime();
}

/** Chinese New Year, a special non-working day. Lunar, so listed rather than worked out. */
const CHINESE_NEW_YEAR: Record<number, [number, number]> = {
  2026: [1, 17],
  2027: [1, 6],
  2028: [0, 26],
  2029: [1, 13],
  2030: [1, 3],
  2031: [0, 23],
  2032: [1, 11],
};

const d = (y: number, m: number, day: number) => new Date(y, m, day).getTime();

function lastMonday(y: number, m: number): number {
  const end = new Date(y, m + 1, 0);
  end.setDate(end.getDate() - ((end.getDay() + 6) % 7));
  return end.getTime();
}

export function holidays(year: number): Holiday[] {
  const e = easter(year);
  const out: Holiday[] = [
    { date: d(year, 0, 1), name: "New Year's Day", kind: 'regular' },
    { date: addDays(e, -3), name: 'Maundy Thursday', kind: 'regular' },
    { date: addDays(e, -2), name: 'Good Friday', kind: 'regular' },
    { date: addDays(e, -1), name: 'Black Saturday', kind: 'special' },
    { date: d(year, 3, 9), name: 'Araw ng Kagitingan', kind: 'regular' },
    { date: d(year, 4, 1), name: 'Labor Day', kind: 'regular' },
    { date: d(year, 5, 12), name: 'Independence Day', kind: 'regular' },
    { date: d(year, 7, 21), name: 'Ninoy Aquino Day', kind: 'special' },
    { date: lastMonday(year, 7), name: 'National Heroes Day', kind: 'regular' },
    { date: d(year, 10, 1), name: "All Saints' Day", kind: 'special' },
    { date: d(year, 10, 2), name: "All Souls' Day", kind: 'special' },
    { date: d(year, 10, 30), name: 'Bonifacio Day', kind: 'regular' },
    { date: d(year, 11, 8), name: 'Immaculate Conception', kind: 'special' },
    { date: d(year, 11, 24), name: 'Christmas Eve', kind: 'special' },
    { date: d(year, 11, 25), name: 'Christmas Day', kind: 'regular' },
    { date: d(year, 11, 30), name: 'Rizal Day', kind: 'regular' },
    { date: d(year, 11, 31), name: "New Year's Eve", kind: 'special' },
  ];
  const cny = CHINESE_NEW_YEAR[year];
  if (cny) out.push({ date: d(year, cny[0], cny[1]), name: 'Chinese New Year', kind: 'special' });
  return out.sort((a, b) => a.date - b.date);
}

/** The holiday on this day, if any. */
export function holidayOn(t: number): Holiday | null {
  const day = startOfDay(t);
  return holidays(new Date(day).getFullYear()).find((h) => h.date === day) ?? null;
}

/**
 * Days Catholics keep meatless: Ash Wednesday and every Friday of Lent, Good
 * Friday included. Fish and seafood are fine.
 */
export function meatless(t: number): boolean {
  const day = startOfDay(t);
  const e = easter(new Date(day).getFullYear());
  const ash = addDays(e, -46);
  if (day === ash) return true;
  return new Date(day).getDay() === 5 && day > ash && day < e;
}

/** Feasts with a family dinner: Noche Buena and Media Noche. */
export function feastOn(t: number): 'noche_buena' | 'media_noche' | null {
  const x = new Date(t);
  if (x.getMonth() !== 11) return null;
  return x.getDate() === 24 ? 'noche_buena' : x.getDate() === 31 ? 'media_noche' : null;
}

// Paydays -----------------------------------------------------------------------

/** The paydays in a month: "30" means the last day in a month that's shorter. */
function paydaysIn(y: number, m: number, days: number[]): number[] {
  const last = new Date(y, m + 1, 0).getDate();
  return [...new Set(days.map((x) => Math.min(x, last)))].sort((a, b) => a - b).map((x) => d(y, m, x));
}

/** The latest payday on or before `t`, and the next one after it. */
export function paydaysAround(t: number, days: number[]): { prev: number; next: number } {
  const day = startOfDay(t);
  const x = new Date(day);
  const all = [-1, 0, 1].flatMap((k) => paydaysIn(x.getFullYear(), x.getMonth() + k, days));
  const prev = all.filter((p) => p <= day).at(-1)!;
  const next = all.find((p) => p > day)!;
  return { prev, next };
}

export type PayWeek = { kind: 'tight' | 'fresh' | 'normal'; factor: number; next: number };

/** How much of the usual weekly budget to use before and right after payday. */
export const TIGHT = 0.85;
export const FRESH = 1.15;

/**
 * Where a week starting at `from` falls in the pay cycle. The week running up to
 * payday ("petsa de peligro") gets less, the week right after gets more; over a
 * month it evens out.
 */
export function payWeek(from: number, days: number[]): PayWeek {
  if (!days.length) return { kind: 'normal', factor: 1, next: 0 };
  const { prev, next } = paydaysAround(from, days);
  const day = startOfDay(from);
  if ((day - prev) / DAY <= 2) return { kind: 'fresh', factor: FRESH, next };
  if ((next - day) / DAY <= 7) return { kind: 'tight', factor: TIGHT, next };
  return { kind: 'normal', factor: 1, next };
}
