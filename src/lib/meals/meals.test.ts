import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/presyo-ncr.json';
import { INGREDIENT, INGREDIENTS, matchIngredient } from './ingredients';
import {
  Profile,
  alternatives,
  budgetGuide,
  costOf,
  eligible,
  fromWhatYouHave,
  grocery,
  makePlan,
  portions,
  servingsPerWeek,
  swapSlot,
} from './planner';
import { PresyoData, parseSize, priceBook } from './prices';
import { RECIPE, RECIPES, groupsOf } from './recipes';

const data = fixture as unknown as PresyoData;
const book = priceBook(data, 'palengke');

const base: Profile = {
  shop: 'palengke',
  area: '130000000',
  adults: 2,
  kids: 1,
  meals: ['lunch', 'dinner'],
  days: [1, 2, 3, 4, 5],
  equipment: ['stove', 'rice_cooker', 'air_fryer'],
  diets: [],
  cuisines: ['filipino'],
  vibes: [],
  allergies: [],
  dislikes: [],
  have: [],
  budget: 3000,
};

describe('recipe library', () => {
  it('only uses ingredients that exist, with sane amounts', () => {
    for (const r of RECIPES) {
      for (const l of r.ingredients) {
        expect(INGREDIENT[l.id], `${r.id} uses unknown ${l.id}`).toBeTruthy();
        expect(l.qty, `${r.id}: ${l.id}`).toBeGreaterThan(0);
      }
      for (const s of r.pairs ?? []) expect(RECIPE[s]?.side, `${r.id} pairs with ${s}`).toBe(true);
      expect(r.steps.length).toBeGreaterThan(0);
    }
  });

  it('has unique ids', () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    expect(new Set(INGREDIENTS.map((i) => i.id)).size).toBe(INGREDIENTS.length);
  });

  it('works out allergens from ingredients', () => {
    expect(groupsOf(RECIPE['sinigang-hipon']).has('shellfish')).toBe(true);
    expect(groupsOf(RECIPE['tofu-adobo']).has('soy')).toBe(true);
  });

  it('matches what people type', () => {
    expect(matchIngredient('itlog')?.id).toBe('egg');
    expect(matchIngredient('Kamatis')?.id).toBe('tomato');
    expect(matchIngredient('bananas')?.id).toBe('banana');
  });
});

describe('prices', () => {
  it('reads sizes in DTI and DA formats', () => {
    expect(parseSize('1 Liter/bottle')).toEqual({ amount: 1, per: 'L' });
    expect(parseSize('1,000 ml/bottle')).toEqual({ amount: 1, per: 'L' });
    expect(parseSize('155g')).toEqual({ amount: 0.155, per: 'kg' });
    expect(parseSize('370mL')).toEqual({ amount: 0.37, per: 'L' });
  });

  it('prices ingredients from Presyo data, per gram / ml / piece', () => {
    expect(book.chicken_thigh.source).toBe('da');
    expect(book.chicken_thigh.perUnit).toBeGreaterThan(0.15);
    expect(book.chicken_thigh.perUnit).toBeLessThan(0.35);
    expect(book.egg.perUnit).toBeGreaterThan(6);
    expect(book.egg.perUnit).toBeLessThan(12);
    expect(book.oil.source).toBe('da');
    expect(book.soy_sauce.source).toBe('srp');
    // A 155 g can of corned beef should cost about its SRP.
    expect(book.corned_beef.perUnit * 150).toBeGreaterThan(20);
    expect(book.corned_beef.perUnit * 150).toBeLessThan(45);
    // Converted units: a corn cob from a per-kg price, coconut milk from a coconut.
    expect(book.corn.source).toBe('psa');
    expect(book.coconut_milk.perUnit * 400).toBeGreaterThan(20);
  });

  it('falls back to estimates without data, and charges more at the supermarket', () => {
    const none = priceBook(null, 'palengke');
    expect(none.tofu.source).toBe('est');
    expect(none.tofu.perUnit).toBeCloseTo(38 / 250);
    const market = priceBook(data, 'supermarket');
    expect(market.chicken_thigh.perUnit).toBeCloseTo(book.chicken_thigh.perUnit * 1.12);
    expect(market.soy_sauce.perUnit).toBeCloseTo(book.soy_sauce.perUnit);
  });

  it('every Presyo source matches an item in the real published data', () => {
    const dir = join(__dirname, '../../../../presyo/app/public/data');
    if (!existsSync(dir)) return; // Only checkable next to the Presyo repo.
    const psa = JSON.parse(readFileSync(join(dir, 'psa/130000000.json'), 'utf8')).items.map((i: { item: string }) => i.item.toLowerCase());
    const da = ['meat', 'vegetables', 'pantry', 'seafood', 'fruits', 'rice'].flatMap((f) =>
      JSON.parse(readFileSync(join(dir, `da/index-${f}.json`), 'utf8')).items.map((i: { item: string }) => i.item.toLowerCase()),
    );
    const srp = JSON.parse(readFileSync(join(dir, 'grocery/srp.json'), 'utf8')).sections.map((s: { name: string }) => s.name.toLowerCase());
    for (const ing of INGREDIENTS)
      for (const s of ing.src ?? []) {
        if ('psa' in s) expect(psa, `${ing.id} psa`).toContain(s.psa.toLowerCase());
        if ('da' in s) expect(da, `${ing.id} da`).toContain(s.da.toLowerCase());
        if ('srp' in s) expect(srp, `${ing.id} srp`).toContain(s.srp.toLowerCase());
      }
  });
});

describe('questionnaire maths', () => {
  it('counts portions (kids eat less, GLP-1 portions are smaller) and plates a week', () => {
    expect(portions(base)).toBe(2.6);
    expect(portions({ ...base, diets: ['glp1'] })).toBe(2.2);
    expect(servingsPerWeek(base)).toBe(30);
  });

  it('labels the budget against what this household usually spends', () => {
    const g = budgetGuide(base, book);
    expect(g.low).toBeGreaterThan(0);
    expect(g.typical).toBeGreaterThanOrEqual(g.low);
    expect(budgetGuide({ ...base, budget: Math.round(g.low * 0.5) }, book).level).toBe('very_tight');
    expect(budgetGuide({ ...base, budget: g.typical * 3 }, book).level).toBe('comfortable');
    expect(g.perPlate).toBe(100);
  });
});

describe('eligible dishes', () => {
  it('respects allergies, dislikes, diets and equipment', () => {
    const vegan = eligible({ ...base, diets: ['vegan'] });
    expect(vegan.length).toBeGreaterThan(3);
    for (const r of vegan) for (const g of ['pork', 'beef', 'chicken', 'fish', 'shellfish', 'egg', 'dairy', 'honey']) expect(groupsOf(r).has(g as never), `${r.id} ${g}`).toBe(false);

    const noShell = eligible({ ...base, allergies: ['shellfish'] });
    expect(noShell.some((r) => groupsOf(r).has('shellfish'))).toBe(false);

    const noFish = eligible({ ...base, dislikes: ['fish', 'tofu'] });
    expect(noFish.some((r) => groupsOf(r).has('fish') || groupsOf(r).has('tofu'))).toBe(false);

    const stoveOnly = eligible({ ...base, equipment: ['stove'] });
    expect(stoveOnly.some((r) => r.id === 'lechon-kawali')).toBe(false);
    expect(stoveOnly.some((r) => r.id === 'fried-tilapia')).toBe(true);
  });
});

describe('making a plan', () => {
  it('fills every meal on every cooking day with dishes the household can eat', () => {
    const plan = makePlan({ ...base, allergies: ['shellfish'], dislikes: ['ampalaya'] }, book, 42);
    expect(plan.slots).toHaveLength(10);
    for (const s of plan.slots) {
      const g = groupsOf(RECIPE[s.recipeId]);
      expect(g.has('shellfish') || g.has('ampalaya')).toBe(false);
      expect(RECIPE[s.recipeId].meals).toContain(s.meal);
    }
    expect(plan.total).toBe(Math.round(plan.grocery.filter((g) => !g.have).reduce((n, g) => n + g.cost, 0)));
  });

  it("doesn't repeat a dish family (three adobos) in one week", () => {
    for (const seed of [1, 2, 3, 11]) {
      const plan = makePlan({ ...base, days: [0, 1, 2, 3, 4, 5, 6], meals: ['breakfast', 'lunch', 'dinner'], budget: 6000 }, book, seed);
      const fams = plan.slots.filter((s) => s.cook).map((s) => RECIPE[s.recipeId].family).filter(Boolean);
      expect(fams.filter((f) => f === 'adobo').length, `seed ${seed}`).toBeLessThanOrEqual(1);
    }
  });

  it('stays under budget when cheap enough dishes exist', () => {
    const g = budgetGuide(base, book);
    const plan = makePlan({ ...base, budget: g.typical }, book, 7);
    expect(plan.total).toBeLessThanOrEqual(g.typical);
  });

  it('is repeatable for a seed and varied across seeds', () => {
    const a = makePlan(base, book, 1).slots.map((s) => s.recipeId);
    expect(makePlan(base, book, 1).slots.map((s) => s.recipeId)).toEqual(a);
    const many = new Set([1, 2, 3, 4, 5].map((seed) => makePlan(base, book, seed).slots.map((s) => s.recipeId).join()));
    expect(many.size).toBeGreaterThan(1);
  });

  it('never puts leftovers before the dinner they come from, whatever day the week starts', () => {
    for (const start of [0, 1, 3, 6]) {
      const plan = makePlan({ ...base, days: [0, 1, 2, 3, 4, 5, 6], vibes: ['batch'] }, book, { seed: 4, start });
      const order = (d: number) => (d - start + 7) % 7;
      for (const l of plan.slots.filter((s) => !s.cook)) {
        const cook = plan.slots.find((s) => s.key === l.linked[0])!;
        expect(order(l.day), `start ${start}`).toBe(order(cook.day) + 1);
      }
    }
  });

  it('cooks dinner once and eats it again for lunch when batch cooking', () => {
    const plan = makePlan({ ...base, vibes: ['batch'] }, book, 3);
    const left = plan.slots.filter((s) => !s.cook);
    expect(left.length).toBeGreaterThan(0);
    for (const l of left) {
      const cook = plan.slots.find((s) => s.key === l.linked[0])!;
      expect(cook.recipeId).toBe(l.recipeId);
      expect(cook.portions).toBe(portions(base) * 2);
    }
  });

  it('uses what you already have and leaves it off the bill', () => {
    const haveEggs = { ...base, have: ['egg', 'rice', 'garlic', 'onion'] };
    const plan = makePlan(haveEggs, book, 5);
    for (const g of plan.grocery) if (['egg', 'rice', 'garlic', 'onion'].includes(g.id)) expect(g.have).toBe(true);
    expect(fromWhatYouHave(haveEggs)[0].share).toBeGreaterThan(0);
  });

  it('adds up the shopping list across dishes and rounds packs up', () => {
    const p = { ...base, days: [1], meals: ['lunch' as const] };
    const plan = { slots: [{ key: '1-lunch', day: 1, meal: 'lunch' as const, recipeId: 'sardinas-misua', portions: 6, cook: true, linked: [], sides: [] }] };
    const list = grocery(plan.slots, p, book);
    const sardines = list.find((l) => l.id === 'sardines')!;
    expect(sardines.need).toBeCloseTo(620);
    expect(sardines.buy).toBe('4 × 155 g can');
    expect(list.find((l) => l.id === 'rice')!.need).toBe(480);
  });

  it('swaps a dish and its leftovers together', () => {
    const p = { ...base, vibes: ['batch' as const] };
    const plan = makePlan(p, book, 3);
    const cook = plan.slots.find((s) => s.linked.length && s.cook)!;
    const alts = alternatives(p, book, 'dinner', cook.recipeId, 8, { portions: cook.portions, keeps: true });
    expect(alts.every((a) => a.recipe.keeps >= 2)).toBe(true);
    expect(alts[0].cost).toBeCloseTo(costOf(alts[0].recipe, cook.portions, book));
    const alt = alts[0];
    const next = swapSlot(plan, cook.key, alt.recipe.id, p, book);
    for (const k of [cook.key, ...cook.linked]) expect(next.slots.find((s) => s.key === k)!.recipeId).toBe(alt.recipe.id);
  });

  it('costs dishes by the share of each ingredient used', () => {
    const adobo = RECIPE['chicken-adobo'];
    const one = costOf(adobo, 1, book);
    expect(costOf(adobo, 4, book)).toBeCloseTo(one * 4);
    expect(one).toBeGreaterThan(30);
    expect(one).toBeLessThan(120);
  });
});
