import { describe, expect, it } from 'vitest';
import { at } from '../time';
import fixture from './__fixtures__/presyo-ncr.json';
import { meetingLoad } from './context';
import { INGREDIENT } from './ingredients';
import { addStock, consume, inKitchen, parseBuy, goingOff } from './kitchen';
import { HEAVY_DAY, Profile, assignCooks, grocery, howToBuy, kilo, makePlan, portions, pricePressure } from './planner';
import { PresyoData, compareMarkets, marketsFrom, priceBook } from './prices';
import { RECIPE } from './recipes';

const data = fixture as unknown as PresyoData;
const book = priceBook(data, 'palengke');
const DAY = 86_400_000;
const NOW = new Date(2026, 9, 20, 9, 0).getTime(); // Tuesday

const base: Profile = {
  shop: 'palengke',
  area: '130000000',
  adults: 2,
  kids: 0,
  meals: ['lunch', 'dinner'],
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

describe('price trends', () => {
  const series = (vals: number[]) => [...Array(40).fill(null), ...vals];
  const withTrend = (): PresyoData => ({
    ...data,
    da: [
      // Liempo: 300 a month ago, 345 now (+15%).
      { item: 'Pork Belly (Liempo)', unit: 'kg', s: series([300, ...Array(29).fill(null), 345]) },
      // Chicken thigh: 250 → 225 (−10%).
      { item: 'Chicken Thigh', unit: 'kg', s: series([250, ...Array(29).fill(null), 225]) },
    ],
  });

  it('reads how much a price moved over a month from DA daily series', () => {
    const b = priceBook(withTrend(), 'palengke');
    expect(b.pork_liempo.change).toBeCloseTo(0.15);
    expect(b.chicken_thigh.change).toBeCloseTo(-0.1);
  });

  it('reads month-on-month change from PSA monthly series', () => {
    const tilapia = data.psa.find((x) => x.item === 'Fish, Tilapia, Medium')!;
    const vals = tilapia.s.filter((x): x is number => x !== null);
    expect(book.tilapia.change).toBeCloseTo(vals.at(-1)! / vals.at(-2)! - 1);
  });

  it('weights a dish by what each ingredient costs in it, and steers plans away from price spikes', () => {
    const b = priceBook(withTrend(), 'palengke');
    expect(pricePressure(RECIPE['lechon-kawali'], b)).toBeGreaterThan(0.08);
    expect(pricePressure(RECIPE['chicken-adobo'], b)).toBeLessThan(-0.05);
    const count = (bk: typeof b, id: string) =>
      [1, 2, 3, 4, 5, 6].reduce((n, seed) => n + makePlan(base, bk, seed).slots.filter((s) => s.cook && s.recipeId === id).length, 0);
    expect(count(b, 'lechon-kawali')).toBeLessThanOrEqual(count(book, 'lechon-kawali'));
  });
});

describe('market comparison', () => {
  const markets = marketsFrom(
    [
      { item: 'Pork (Kasim)', m: { a: 300, b: 340, c: 320 } },
      { item: 'Pork (Kasim)', m: { a: 310 } },
      { item: 'Tomato', m: { a: 100, b: 80, c: 90 } },
      { item: 'Egg (Medium)', m: { a: 8, b: 9 } },
      { item: 'Ampalaya', m: { a: 150, b: 140, c: 160 } },
    ],
    [
      { id: 'a', name: 'Market A' },
      { id: 'b', name: 'Market B' },
    ],
  );

  it('pivots DA items into per-market prices, averaging variants', () => {
    expect(markets.find((m) => m.id === 'a')!.prices['Pork (Kasim)']).toBe(305);
    expect(markets.find((m) => m.id === 'c')!.name).toBe('C');
    expect(marketsFrom([{ item: 'Tomato', m: { 'north-diversion-market': 90 } }], [])[0].name).toBe('North Diversion Market');
  });

  it('prices the list at each market, cheapest first', () => {
    const r = compareMarkets(
      [
        { id: 'pork_kasim', need: 1000 },
        { id: 'tomato', need: 500 },
        { id: 'egg', need: 10 },
        { id: 'ampalaya', need: 400 },
        { id: 'tofu', need: 500 },
      ],
      markets,
    );
    expect(r.covered.sort()).toEqual(['ampalaya', 'egg', 'pork_kasim', 'tomato']);
    expect(r.markets.map((m) => m.id)).toEqual(['a', 'c', 'b']);
    // Market C has no eggs: filled in at the median (8.5) so totals compare.
    expect(r.markets.find((m) => m.id === 'c')!.cost).toBe(Math.round(320 + 45 + 85 + 64));
    // A market pricing under 75% of the list isn't compared.
    expect(compareMarkets([{ id: 'pork_kasim', need: 1000 }, { id: 'egg', need: 10 }, { id: 'tomato', need: 100 }, { id: 'ampalaya', need: 100 }], [...markets, { id: 'd', name: 'D', prices: { Tomato: 50 } }]).markets.some((m) => m.id === 'd')).toBe(false);
  });
});

describe('calendar-aware cooking', () => {
  const sched = { workDays: [1, 2, 3, 4, 5], workStart: '09:00', workEnd: '18:00', dayStart: '07:00', dayEnd: '22:00', maxWorkChore: 15, buffer: 5 };

  it('adds up meeting time inside work hours per weekday', () => {
    const tue = NOW;
    const load = meetingLoad(
      [
        { start: at(tue, '08:00'), end: at(tue, '10:00'), title: 'Early' }, // only 1 h counts
        { start: at(tue, '13:00'), end: at(tue, '14:30'), title: 'Review' },
        { start: at(tue, '14:00'), end: at(tue, '15:00'), title: 'Overlap' },
      ],
      sched,
      tue,
    );
    expect(load[2]).toBe(60 + 120);
    expect(load[6]).toBe(0);
  });

  it('keeps cooking quick on heavy meeting days', () => {
    const heavy = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, HEAVY_DAY + 60]));
    const avg = (load: Record<number, number>) => {
      const mins = [1, 2, 3].flatMap((seed) => makePlan(base, book, { seed, load }).slots.filter((s) => s.cook).map((s) => RECIPE[s.recipeId].minutes));
      return mins.reduce((a, b) => a + b, 0) / mins.length;
    };
    expect(avg(heavy)).toBeLessThan(avg({}));
  });
});

describe('kitchen stock', () => {
  it('reads amounts back from shopping-list notes', () => {
    expect(parseBuy('1.2 kg', INGREDIENT.chicken_thigh)).toBe(1200);
    expect(parseBuy('605 g', INGREDIENT.bangus)).toBe(605);
    expect(parseBuy('2 × 155 g can', INGREDIENT.sardines)).toBe(310);
    expect(parseBuy('¾ kilo', INGREDIENT.tomato)).toBe(750);
    expect(parseBuy('1½ kilo', INGREDIENT.pork_kasim)).toBe(1500);
    expect(parseBuy('6 piraso', INGREDIENT.egg)).toBe(6);
    expect(parseBuy('2 tali', INGREDIENT.malunggay)).toBe(100);
    expect(parseBuy('', INGREDIENT.tofu)).toBe(250);
  });

  it('uses up what dishes take and flags what goes off soon', () => {
    let s = addStock({}, 'kangkong', 500, NOW);
    s = addStock(s, 'potato', 1000, NOW);
    s = consume(s, [
      { id: 'kangkong', qty: 498 },
      { id: 'potato', qty: 300 },
    ]);
    expect(s.kangkong).toBeUndefined();
    expect(s.potato.qty).toBe(700);
    const later = addStock(s, 'tilapia', 1000, NOW);
    expect(goingOff(later, NOW + DAY, 3)).toEqual({ tilapia: 1 });
    expect(inKitchen(later, NOW + 5 * DAY)).toEqual(['potato']);
  });

  it('plans dishes that use what is about to go off', () => {
    const uses = (useSoonMap: Record<string, number>) =>
      [1, 2, 3, 4].reduce(
        (n, seed) =>
          n +
          makePlan(base, book, { seed, start: 2, useSoon: useSoonMap })
            .slots.filter((s) => s.cook)
            .slice(0, 4)
            .filter((s) => RECIPE[s.recipeId].ingredients.some((l) => l.id === 'kangkong')).length,
        0,
      );
    expect(uses({ kangkong: 1 })).toBeGreaterThan(uses({}));
  });
});

describe('household', () => {
  it('cooks extra at weeknight dinners for tomorrow’s baon', () => {
    const plan = makePlan({ ...base, baon: 2 }, book, { seed: 3, start: 1, from: new Date(2026, 9, 5).getTime() });
    const sunday = plan.slots.find((s) => s.key === '0-dinner')!;
    const friday = plan.slots.find((s) => s.key === '5-dinner')!;
    expect(sunday.baon).toBe(2);
    expect(sunday.portions).toBeCloseTo(portions(base) + 1.6);
    expect(friday.baon).toBeUndefined();
    expect(RECIPE[sunday.recipeId].keeps).toBeGreaterThanOrEqual(1);
  });

  it('takes turns by the day and skips leftovers', () => {
    const plan = makePlan({ ...base, vibes: ['batch'] }, book, { seed: 3, start: 1 });
    assignCooks(plan.slots, ['Tim', 'Ana']);
    const byDay = (d: number) => [...new Set(plan.slots.filter((s) => s.day === d && s.cook).map((s) => s.by))];
    expect(byDay(1)).toEqual(['Tim']);
    expect(byDay(2)).toEqual(['Ana']);
    expect(byDay(3)).toEqual(['Tim']);
    expect(plan.slots.filter((s) => !s.cook).every((s) => s.by === undefined)).toBe(true);
  });
});

describe('palengke buying', () => {
  it('weighs in quarter kilos, sells eggs by the piece and greens by the tali', () => {
    expect(kilo(300)).toBe('½ kilo');
    expect(kilo(240)).toBe('¼ kilo');
    expect(kilo(1200)).toBe('1¼ kilo');
    expect(kilo(2000)).toBe('2 kilo');
    expect(howToBuy(INGREDIENT.tomato, 300, 0.1, 'palengke')).toEqual({ buy: '½ kilo', cost: 50 });
    expect(howToBuy(INGREDIENT.tomato, 300, 0.1, 'supermarket').buy).toBe('300 g');
    expect(howToBuy(INGREDIENT.garlic, 40, 0.2, 'palengke').buy).toBe('40 g');
    expect(howToBuy(INGREDIENT.egg, 6, 8.5, 'palengke')).toEqual({ buy: '6 piraso', cost: 51 });
    expect(howToBuy(INGREDIENT.egg, 6, 8.5, 'supermarket').buy).toBe('1 × tray of 30');
    expect(howToBuy(INGREDIENT.malunggay, 80, 0.3, 'palengke').buy).toBe('2 tali');
  });

  it('flows into the shopping list', () => {
    const p = { ...base, days: [1], meals: ['dinner' as const] };
    const list = grocery([{ key: '1-dinner', day: 1, meal: 'dinner', recipeId: 'tinola', portions: 4, cook: true, linked: [], sides: [] }], p, book);
    expect(list.find((l) => l.id === 'chicken_whole')!.buy).toBe('1 kilo');
    expect(list.find((l) => l.id === 'malunggay')!.buy).toBe('1 tali');
  });
});
