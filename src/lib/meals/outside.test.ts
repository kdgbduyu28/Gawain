import { describe, expect, it } from 'vitest';
import { plan as planReminders } from '../reminders';
import { DAY, HOUR, MIN } from '../time';
import fixture from './__fixtures__/presyo-ncr.json';
import { NO_TANK, energyOf, gasPerDay, kwhFromPresyo, lpgFromPresyo, swapTank, tankLeft, weekEnergy } from './energy';
import { easter, feastOn, holidayOn, holidays, meatless, payWeek, paydaysAround } from './phcalendar';
import { Profile, grocery, makePlan, slotLines, swapSlot } from './planner';
import { PresyoData, priceBook } from './prices';
import { FESTIVE, RECIPE, SABAW } from './recipes';
import { startBy } from './timing';
import { byWeekday, classify, parseForecast } from './weather';

const book = priceBook(fixture as unknown as PresyoData, 'palengke');
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

const base: Profile = {
  shop: 'palengke',
  area: '130000000',
  adults: 2,
  kids: 0,
  meals: ['breakfast', 'lunch', 'dinner'],
  days: [0, 1, 2, 3, 4, 5, 6],
  equipment: ['stove', 'rice_cooker', 'air_fryer', 'oven', 'pressure_cooker'],
  diets: [],
  cuisines: ['filipino'],
  vibes: [],
  allergies: [],
  dislikes: [],
  have: [],
  budget: 9000,
};
// Monday 5 Oct 2026: an ordinary week.
const OCT5 = day(2026, 10, 5);

describe('Philippine calendar', () => {
  it('finds Easter and Holy Week', () => {
    expect(easter(2026)).toBe(day(2026, 4, 5));
    expect(easter(2027)).toBe(day(2027, 3, 28));
    expect(holidayOn(day(2026, 4, 3))?.name).toBe('Good Friday');
    expect(holidayOn(day(2026, 8, 31))?.name).toBe('National Heroes Day');
    expect(holidayOn(day(2026, 10, 6))).toBeNull();
    // Twelve by law, less the two Eid days proclaimed each year.
    expect(holidays(2026).filter((h) => h.kind === 'regular')).toHaveLength(10);
  });

  it('knows the meatless days of Lent', () => {
    expect(meatless(day(2026, 2, 18))).toBe(true); // Ash Wednesday
    expect(meatless(day(2026, 3, 6))).toBe(true); // a Friday in Lent
    expect(meatless(day(2026, 4, 3))).toBe(true); // Good Friday
    expect(meatless(day(2026, 4, 10))).toBe(false); // Friday after Easter
    expect(meatless(day(2026, 2, 13))).toBe(false); // Friday before Lent
  });

  it('marks Noche Buena and Media Noche', () => {
    expect(feastOn(day(2026, 12, 24))).toBe('noche_buena');
    expect(feastOn(day(2026, 12, 31))).toBe('media_noche');
    expect(feastOn(day(2026, 12, 25))).toBeNull();
  });
});

describe('paydays', () => {
  it('treats "30" as the last day of a short month', () => {
    expect(paydaysAround(day(2026, 2, 20), [15, 30])).toEqual({ prev: day(2026, 2, 15), next: day(2026, 2, 28) });
    expect(paydaysAround(day(2026, 3, 1), [15, 30])).toEqual({ prev: day(2026, 2, 28), next: day(2026, 3, 15) });
  });

  it('tightens the week before payday and loosens the one after', () => {
    expect(payWeek(day(2026, 10, 9), [15, 30]).kind).toBe('tight');
    expect(payWeek(day(2026, 10, 16), [15, 30]).kind).toBe('fresh');
    expect(payWeek(day(2026, 10, 19), [15, 30]).kind).toBe('normal');
    expect(payWeek(day(2026, 10, 19), []).factor).toBe(1);
  });

  it('plans to the moved budget', () => {
    const p = { ...base, budget: 3000, payday: [15, 30] };
    const tight = makePlan(p, book, { seed: 2, start: 5, from: day(2026, 10, 9) });
    const fresh = makePlan(p, book, { seed: 2, start: 5, from: day(2026, 10, 16) });
    expect(tight.budget).toBe(2550);
    expect(tight.pay?.kind).toBe('tight');
    expect(fresh.budget).toBe(3450);
  });
});

describe('Lent and holidays in the plan', () => {
  it('keeps Lenten Fridays meatless for those who keep them', () => {
    const p = { ...base, lent: true };
    // Monday 2 March 2026, in Lent: Friday is the 6th.
    const plan = makePlan(p, book, { seed: 4, start: 1, from: day(2026, 3, 2) });
    const friday = plan.slots.filter((s) => s.day === 5).map((s) => RECIPE[s.recipeId]);
    expect(friday.length).toBeGreaterThan(0);
    expect(friday.every((r) => !r.ingredients.some((l) => ['pork_', 'beef_', 'chicken_', 'longganisa', 'corned_beef', 'luncheon_meat'].some((m) => l.id.startsWith(m))))).toBe(true);
  });

  it('plans handaan dishes for Noche Buena', () => {
    // Monday 21 December 2026: Thursday the 24th is Noche Buena.
    const hits = [1, 2, 3, 4].filter((seed) => FESTIVE.has(makePlan(base, book, { seed, start: 1, from: day(2026, 12, 21) }).slots.find((s) => s.key === '4-dinner')!.recipeId));
    expect(hits.length).toBeGreaterThanOrEqual(3);
  });

  it('skips baon before a holiday', () => {
    // Sunday 1 Nov: Monday 2 Nov is All Souls' Day.
    const plan = makePlan({ ...base, baon: 1 }, book, { seed: 3, start: 0, from: day(2026, 11, 1) });
    expect(plan.slots.find((s) => s.key === '0-dinner')!.baon).toBeUndefined();
  });
});

describe('weather', () => {
  it('reads Open-Meteo and classifies days', () => {
    const days = parseForecast({
      daily: {
        time: ['2026-10-05', '2026-10-06', '2026-10-07'],
        weather_code: [3, 63, 95],
        temperature_2m_max: [34, 29, 27],
        precipitation_sum: [0, 22, 90],
        wind_gusts_10m_max: [20, 35, 95],
      },
    });
    expect(days.map((d) => [d.hot, d.rain, d.storm])).toEqual([
      [true, false, false],
      [false, true, false],
      [false, true, true],
    ]);
    expect(Object.keys(byWeekday(days, OCT5)).map(Number).sort()).toEqual([1, 2, 3]);
    expect(parseForecast(null)).toEqual([]);
  });

  it('puts sabaw on rainy days and pantry cooking in a storm', () => {
    const rain = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, classify(OCT5 + ((d + 6) % 7) * DAY, 28, 30, 30, 63)]));
    const soups = (weather: typeof rain) =>
      [1, 2, 3].reduce((n, seed) => n + makePlan(base, book, { seed, start: 1, from: OCT5, weather }).slots.filter((s) => SABAW.has(s.recipeId)).length, 0);
    expect(soups(rain)).toBeGreaterThan(soups({}));
    const perishable = (bagyo: boolean) =>
      [1, 2, 3].reduce(
        (n, seed) =>
          n +
          makePlan(base, book, { seed, start: 1, from: OCT5, bagyo })
            .slots.filter((s) => s.cook)
            .filter((s) => RECIPE[s.recipeId].ingredients.some((l) => ['tilapia', 'bangus', 'kangkong', 'pechay', 'shrimp'].includes(l.id))).length,
        0,
      );
    expect(perishable(true)).toBeLessThan(perishable(false));
  });
});

describe('leftover chains', () => {
  const chained = () => {
    for (let seed = 1; seed < 40; seed++) {
      const plan = makePlan(base, book, { seed, start: 1, from: OCT5 });
      const t = plan.slots.find((s) => s.uses);
      if (t) return { plan, t, src: plan.slots.find((s) => s.key === t.uses)! };
    }
    throw new Error('no chain in 40 plans');
  };

  it('cooks extra tonight and skips buying it again tomorrow', () => {
    const { t, src } = chained();
    const c = RECIPE[t.recipeId];
    expect(c.leftover).toBeDefined();
    expect(src.feeds).toBe(t.key);
    const lines = slotLines(t);
    for (const l of c.ingredients.filter((x) => x.left)) expect(lines.some((x) => x.id === l.id)).toBe(false);
    if (c.leftover!.from === 'rice') expect(src.extraRice).toBeGreaterThan(0);
    else expect(src.extraFor).toBeGreaterThan(0);
  });

  it('can be turned off', () => {
    for (let seed = 1; seed < 10; seed++) expect(makePlan({ ...base, leftovers: false }, book, { seed, start: 1, from: OCT5 }).slots.some((s) => s.uses)).toBe(false);
  });

  it('comes apart cleanly when the first dish is swapped', () => {
    const { plan, t, src } = chained();
    const other = Object.values(RECIPE).find((r) => r.meals.includes(src.meal) && !r.side && !r.leftover && r.id !== src.recipeId && !r.rice)!;
    const next = swapSlot(plan, src.key, other.id, base, book);
    const s2 = next.slots.find((s) => s.key === src.key)!;
    const t2 = next.slots.find((s) => s.key === t.key)!;
    expect(s2.feeds).toBeUndefined();
    expect(s2.extraRice).toBeUndefined();
    expect(t2.uses).toBeUndefined();
    // The later dish now buys what it used to reuse.
    const c = RECIPE[t2.recipeId];
    for (const l of c.ingredients.filter((x) => x.left)) expect(grocery(next.slots, base, book).some((g) => g.id === l.id)).toBe(true);
  });
});

describe('gas and power', () => {
  it('counts the stove in LPG and appliances in kWh', () => {
    const adobo = energyOf(RECIPE['chicken-adobo'], ['stove', 'rice_cooker']);
    expect(adobo.lpgKg).toBeCloseTo(0.15 * ((45 * 0.75) / 60));
    expect(adobo.kwh).toBeCloseTo(0.3);
    const wings = energyOf(RECIPE['air-fryer-wings'], ['stove', 'air_fryer']);
    expect(wings.lpgKg).toBe(0);
    expect(wings.kwh).toBeGreaterThan(0.3);
    const noCooker = energyOf(RECIPE['chicken-adobo'], ['stove']);
    expect(noCooker.lpgKg).toBeGreaterThan(adobo.lpgKg);
  });

  it('adds up the week and predicts when the tank runs out', () => {
    const plan = makePlan(base, book, { seed: 1, start: 1, from: OCT5 });
    const e = weekEnergy(plan, base);
    expect(e.lpgKg).toBeGreaterThan(0.5);
    const now = OCT5 + 10 * DAY;
    const left = tankLeft({ since: OCT5, size: 11, lasted: [] }, now, 0.25)!;
    expect(left.days).toBeCloseTo(34);
    expect(tankLeft(NO_TANK, now, 0.25)).toBeNull();
  });

  it('learns from real tanks', () => {
    let t = swapTank(NO_TANK, OCT5);
    t = swapTank(t, OCT5 + 44 * DAY);
    expect(t.lasted).toEqual([44]);
    expect(gasPerDay(t, 0.5)).toBeCloseTo(11 / 44);
    expect(gasPerDay(NO_TANK, 0.5)).toBe(0.5);
  });

  it("reads Presyo's LPG and power files", () => {
    expect(lpgFromPresyo({ periods: ['2026-08', '2026-09'], s: [[1000, 1200], [1030, 1530]] })).toEqual({ perKg: 1280 / 11, period: '2026-09' });
    expect(kwhFromPresyo({ periods: ['2026-09', '2026-10'], utilities: [{ s: [14.7, 15.06] }, { s: [11, null] }] })).toEqual({ kwh: 15.06, period: '2026-10' });
    expect(lpgFromPresyo(null)).toBeNull();
  });
});

describe('start-by times', () => {
  const d = OCT5;
  it('starts early enough to eat on time', () => {
    const s = startBy(45, d, 'dinner', {}, [], true);
    expect(s.start).toBe(d + 18 * HOUR + 15 * MIN);
    expect(s.riceAt).toBe(d + 18 * HOUR + 25 * MIN);
    expect(s.around).toBeNull();
  });

  it('cooks after a meeting when that is only a little late', () => {
    const s = startBy(30, d, 'dinner', {}, [{ start: d + 18 * HOUR, end: d + 18 * HOUR + 45 * MIN, title: 'Sync' }]);
    expect(s.around).toEqual({ how: 'after', title: 'Sync' });
    expect(s.ready).toBe(d + 19 * HOUR + 15 * MIN);
  });

  it('cooks before a long meeting instead', () => {
    const s = startBy(30, d, 'dinner', { dinner: '19:30' }, [{ start: d + 18 * HOUR + 30 * MIN, end: d + 20 * HOUR, title: 'Client call' }]);
    expect(s.around?.how).toBe('before');
    expect(s.start).toBe(d + 18 * HOUR);
  });

  it('switches the rice cooker plug on right on time, meeting or not', () => {
    const at = d + 18 * HOUR;
    const out = planReminders(
      {
        chores: [],
        items: [],
        timers: [{ id: 'r', label: 'Rice cooker on', icon: 'power-outline', startedAt: d, endsAt: at, plug: 'switch.rice' }],
        busy: [{ start: at - HOUR, end: at + HOUR, title: 'Call' }],
        schedule: { workDays: [], workStart: '09:00', workEnd: '18:00', dayStart: '07:00', dayEnd: '22:00', maxWorkChore: 15, buffer: 5 },
        digest: null,
        gapNudges: false,
      },
      d,
    );
    expect(out).toEqual([expect.objectContaining({ id: 'plug:r', at })]);
  });
});
