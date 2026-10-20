import { INGREDIENT } from './ingredients';
import { Plan, linesFor } from './planner';
import { RECIPE, Recipe } from './recipes';

/**
 * Rough nutrition for dishes and the week, from approximate food composition values
 * (the kind in FNRI's Philippine Food Composition Tables and USDA FoodData Central).
 * Good for "is this a heavy or salty week", not for medical diets.
 */
export type Nutrients = { kcal: number; protein: number; carbs: number; fat: number; fiber: number; sodium: number };

/**
 * Per 100 g (or 100 ml for liquids, or one piece for things counted in pieces), as
 * bought: bone-in meat and whole fish count only the part you eat.
 * [kcal, protein g, carbs g, fat g, fiber g, sodium mg]
 */
const PER: Record<string, [number, number, number, number, number, number]> = {
  pork_liempo: [518, 9.3, 0, 53, 0, 32],
  pork_kasim: [240, 17, 0, 19, 0, 60],
  pork_ground: [263, 17, 0, 21, 0, 56],
  pork_chop: [185, 15, 0, 13, 0, 50],
  longganisa: [300, 13, 15, 21, 0, 900],
  luncheon_meat: [315, 13, 3, 27, 0, 1300],
  beef_cubes: [225, 17, 0, 17, 0, 60],
  beef_lean: [160, 21, 0, 8, 0, 55],
  beef_ground: [254, 17, 0, 20, 0, 66],
  corned_beef: [215, 25, 1, 12, 0, 900],
  chicken_whole: [150, 13, 0, 11, 0, 50],
  chicken_thigh: [170, 13, 0, 13, 0, 70],
  chicken_breast: [120, 22.5, 0, 2.6, 0, 45],
  chicken_drumstick: [135, 13, 0, 9, 0, 65],
  chicken_wings: [135, 11, 0, 10, 0, 50],
  chicken_liver: [120, 17, 0.7, 4.8, 0, 70],
  bangus: [90, 12.5, 0, 4.5, 0, 45],
  tilapia: [55, 11, 0, 1, 0, 30],
  galunggong: [72, 13, 0, 2, 0, 50],
  salmon_belly: [290, 15, 0, 25, 0, 50],
  shrimp: [50, 11, 0.5, 0.5, 0, 70],
  squid: [92, 15.6, 3, 1.4, 0, 44],
  tahong: [30, 4, 1.3, 0.8, 0, 100],
  sardines: [160, 16, 3, 9, 0, 400],
  tuna_can: [190, 26, 0, 9, 0, 350],
  egg: [72, 6.3, 0.4, 4.8, 0, 70],
  milk: [61, 3.2, 4.8, 3.3, 0, 43],
  evap_milk: [134, 6.8, 10, 7.6, 0, 106],
  cheese: [330, 18, 7, 25, 0, 1300],
  butter: [717, 0.9, 0.1, 81, 0, 640],
  yogurt: [61, 3.5, 4.7, 3.3, 0, 46],
  tofu: [144, 15.8, 2.8, 8.7, 2.3, 14],
  monggo: [347, 24, 63, 1.2, 16, 15],
  black_beans: [91, 6, 16, 0.3, 7, 380],
  chickpeas: [139, 7, 23, 2.6, 6, 250],
  lentils: [352, 25, 63, 1, 11, 6],
  peanuts: [567, 26, 16, 49, 8.5, 18],
  peanut_butter: [590, 22, 22, 50, 6, 430],
  tomato: [18, 0.9, 3.9, 0.2, 1.2, 5],
  onion: [40, 1.1, 9.3, 0.1, 1.7, 4],
  garlic: [149, 6.4, 33, 0.5, 2.1, 17],
  ginger: [80, 1.8, 18, 0.8, 2, 13],
  cabbage: [25, 1.3, 5.8, 0.1, 2.5, 18],
  carrot: [41, 0.9, 9.6, 0.2, 2.8, 69],
  potato: [77, 2, 17, 0.1, 2.2, 6],
  ampalaya: [17, 1, 3.7, 0.2, 2.8, 5],
  pechay: [13, 1.5, 2.2, 0.2, 1, 65],
  kangkong: [19, 2.6, 3.1, 0.2, 2.1, 113],
  sitaw: [47, 2.8, 8.4, 0.4, 3.5, 4],
  baguio_beans: [31, 1.8, 7, 0.2, 2.7, 6],
  eggplant: [25, 1, 5.9, 0.2, 3, 2],
  squash: [40, 1, 10, 0.1, 1.5, 4],
  sayote: [19, 0.8, 4.5, 0.1, 1.7, 2],
  upo: [14, 0.6, 3.4, 0, 0.5, 2],
  okra: [33, 1.9, 7.5, 0.2, 3.2, 7],
  labanos: [18, 0.6, 4.1, 0.1, 1.6, 21],
  gabi: [112, 1.5, 26, 0.2, 4.1, 11],
  malunggay: [64, 9.4, 8.3, 1.4, 2, 9],
  spring_onion: [32, 1.8, 7.3, 0.2, 2.6, 16],
  cilantro: [23, 2.1, 3.7, 0.5, 2.8, 46],
  bell_pepper: [26, 1, 6, 0.3, 2.1, 4],
  chili_green: [40, 2, 9, 0.2, 1.5, 7],
  chili_red: [40, 1.9, 8.8, 0.4, 1.5, 9],
  lettuce: [15, 1.4, 2.9, 0.2, 1.3, 28],
  cucumber: [15, 0.7, 3.6, 0.1, 0.5, 2],
  broccoli: [34, 2.8, 6.6, 0.4, 2.6, 33],
  corn: [86, 3.3, 19, 1.4, 2, 15],
  camote: [86, 1.6, 20, 0.1, 3, 55],
  mushroom: [22, 3.1, 3.3, 0.3, 1, 5],
  kale: [49, 4.3, 8.8, 0.9, 3.6, 38],
  calamansi: [30, 0.6, 7, 0.2, 1.5, 2],
  banana_saba: [120, 1.3, 31, 0.4, 2.3, 4],
  banana: [89, 1.1, 23, 0.3, 2.6, 1],
  mango: [60, 0.8, 15, 0.4, 1.6, 1],
  papaya: [39, 0.6, 9.8, 0.1, 1.8, 3],
  avocado: [160, 2, 8.5, 14.7, 6.7, 7],
  coconut_milk: [230, 2.3, 5.5, 24, 2.2, 15],
  rice: [360, 6.6, 79, 0.6, 1.3, 5],
  pasta: [371, 13, 75, 1.5, 3.2, 6],
  bihon: [364, 6, 83, 0.6, 1.6, 180],
  canton: [370, 11, 72, 4, 2, 700],
  misua: [350, 10, 74, 1, 2, 1000],
  instant_noodles: [450, 9, 62, 18, 2.5, 1800],
  pandesal: [85, 2.7, 15, 1.5, 0.6, 110],
  bread: [265, 9, 49, 3.2, 2.7, 490],
  tortilla: [140, 3.7, 23, 3.5, 1.4, 330],
  oats: [379, 13, 68, 6.5, 10, 6],
  flour: [364, 10, 76, 1, 2.7, 2],
  glutinous_rice: [370, 6.8, 81, 0.6, 2.8, 7],
  lumpia_wrapper: [29, 1, 6, 0.1, 0.2, 55],
  oil: [828, 0, 0, 92, 0, 0],
  olive_oil: [820, 0, 0, 91, 0, 2],
  soy_sauce: [60, 9, 6, 0, 0.8, 6400],
  vinegar: [18, 0, 0.9, 0, 0, 2],
  patis: [40, 6, 4, 0, 0, 9000],
  oyster_sauce: [60, 1.6, 13, 0.3, 0.3, 3200],
  bagoong: [140, 15, 6, 6, 0, 5000],
  salt: [0, 0, 0, 0, 0, 38758],
  sugar: [387, 0, 100, 0, 0, 1],
  brown_sugar: [380, 0.1, 98, 0, 0, 28],
  pepper: [251, 10, 64, 3.3, 25, 20],
  peppercorn: [251, 10, 64, 3.3, 25, 20],
  bay_leaf: [1, 0, 0.2, 0, 0.1, 0],
  cornstarch: [381, 0.3, 91, 0.1, 0.9, 9],
  tomato_sauce: [30, 1.3, 7, 0.2, 1.5, 470],
  spaghetti_sauce: [90, 1.5, 19, 1, 1.5, 450],
  liver_spread: [260, 10, 8, 21, 0, 750],
  sinigang_mix: [280, 3, 60, 4, 2, 16000],
  curry_powder: [325, 14, 58, 14, 33, 52],
  chili_powder: [282, 13, 50, 14, 35, 1000],
  cumin: [375, 18, 44, 22, 10.5, 168],
  paprika: [282, 14, 54, 13, 35, 68],
  sesame_oil: [820, 0, 0, 91, 0, 0],
  honey: [432, 0.4, 117, 0, 0.3, 6],
  mayonnaise: [620, 1, 1, 68, 0, 580],
  ketchup: [120, 0.3, 29, 0.1, 0.5, 900],
  olives: [115, 0.8, 6, 10.7, 3.2, 1300],
  tablea: [590, 13, 30, 52, 17, 20],
  salsa: [36, 1.5, 7, 0.2, 1.9, 600],
  green_peas: [69, 4.4, 12.6, 0.4, 4.1, 310],
  raisins: [299, 3.1, 79, 0.5, 3.7, 11],
};

/** Reference amounts for one adult's day (FDA Philippines label values; WHO's sodium limit). */
export const DAILY: Nutrients = { kcal: 2000, protein: 50, carbs: 300, fat: 65, fiber: 25, sodium: 2000 };

/** A portion with more than this much sodium is flagged as salty (40% of a day's limit). */
export const SALTY = 800;

const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0 };

export function hasNutrition(id: string): boolean {
  return id in PER;
}

export function add(a: Nutrients, b: Nutrients): Nutrients {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat, fiber: a.fiber + b.fiber, sodium: a.sodium + b.sodium };
}

export function scale(a: Nutrients, k: number): Nutrients {
  return { kcal: a.kcal * k, protein: a.protein * k, carbs: a.carbs * k, fat: a.fat * k, fiber: a.fiber * k, sodium: a.sodium * k };
}

/** Nutrition of these ingredient amounts. */
export function ofLines(lines: { id: string; qty: number }[]): Nutrients {
  let out = ZERO;
  for (const l of lines) {
    const v = PER[l.id];
    if (!v) continue;
    const k = INGREDIENT[l.id]?.unit === 'pc' ? l.qty : l.qty / 100;
    out = add(out, { kcal: v[0] * k, protein: v[1] * k, carbs: v[2] * k, fat: v[3] * k, fiber: v[4] * k, sodium: v[5] * k });
  }
  return out;
}

/** Oil past this much per portion is for frying: most of it stays in the pan. */
const COOKING_OIL = 15;
const ABSORBED = 0.25;

/** One adult portion of a dish, with its rice if it's served with rice. */
export function perPortion(r: Recipe): Nutrients {
  return ofLines(
    linesFor(r, 1).map((l) =>
      (l.id === 'oil' || l.id === 'olive_oil') && l.qty > COOKING_OIL ? { ...l, qty: COOKING_OIL + (l.qty - COOKING_OIL) * ABSORBED } : l,
    ),
  );
}

/** One adult portion of a planned meal, sides included. */
export function slotPortion(recipeId: string, sides: string[] = []): Nutrients {
  return [recipeId, ...sides].reduce((sum, id) => (RECIPE[id] ? add(sum, perPortion(RECIPE[id])) : sum), ZERO);
}

/**
 * What one adult eats from the plan on an average planned day: every meal in the
 * plan, cooked or leftovers, divided by the days in it.
 */
export function dailyAverage(plan: Plan): Nutrients {
  const days = new Set(plan.slots.map((s) => s.day)).size || 1;
  const total = plan.slots.reduce((sum, s) => add(sum, slotPortion(s.recipeId, s.sides)), ZERO);
  return scale(total, 1 / days);
}
