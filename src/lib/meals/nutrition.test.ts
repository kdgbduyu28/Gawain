import { describe, expect, it } from 'vitest';
import { INGREDIENTS } from './ingredients';
import { dailyAverage, hasNutrition, ofLines, perPortion, slotPortion } from './nutrition';
import { makePlan } from './planner';
import { priceBook } from './prices';
import { RECIPE, RECIPES } from './recipes';

describe('nutrition', () => {
  it('knows every ingredient', () => {
    expect(INGREDIENTS.filter((i) => !hasNutrition(i.id)).map((i) => i.id)).toEqual([]);
  });

  it('counts pieces by the piece and liquids by the 100 ml', () => {
    expect(ofLines([{ id: 'egg', qty: 2 }]).kcal).toBeCloseTo(144);
    expect(ofLines([{ id: 'salt', qty: 5 }]).sodium).toBeCloseTo(1938, 0);
    expect(ofLines([{ id: 'milk', qty: 250 }]).protein).toBeCloseTo(8);
  });

  it('gives every main a believable portion', () => {
    for (const r of RECIPES.filter((x) => !x.side)) {
      const n = perPortion(r);
      expect(n.kcal, r.id).toBeGreaterThan(200);
      expect(n.kcal, r.id).toBeLessThan(1400);
    }
  });

  it('counts only the oil a fried dish soaks up', () => {
    const banana = perPortion(RECIPE['banana-cue']);
    expect(banana.fat).toBeLessThan(30);
  });

  it("agrees with the recipes' own high-protein labels", () => {
    const avg = (rs: typeof RECIPES) => rs.reduce((s, r) => s + perPortion(r).protein, 0) / rs.length;
    const mains = RECIPES.filter((r) => !r.side);
    expect(avg(mains.filter((r) => r.labels?.includes('high_protein')))).toBeGreaterThan(avg(mains) + 3);
  });

  it('adds sides to a meal and averages a planned day', () => {
    expect(slotPortion('tinola', ['ensaladang-kamatis']).kcal).toBeGreaterThan(perPortion(RECIPE.tinola).kcal);
    const p = {
      shop: 'palengke' as const,
      area: '130000000',
      adults: 2,
      kids: 0,
      meals: ['breakfast' as const, 'lunch' as const, 'dinner' as const],
      days: [0, 1, 2, 3, 4, 5, 6],
      equipment: ['stove' as const, 'rice_cooker' as const],
      diets: [],
      cuisines: [],
      vibes: [],
      allergies: [],
      dislikes: [],
      have: [],
      budget: 9000,
    };
    const day = dailyAverage(makePlan(p, priceBook(null, 'palengke'), 2));
    expect(day.kcal).toBeGreaterThan(1200);
    expect(day.kcal).toBeLessThan(3200);
  });
});
