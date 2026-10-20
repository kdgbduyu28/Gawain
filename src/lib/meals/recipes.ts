import { Group, INGREDIENT } from './ingredients';

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type Cuisine = 'filipino' | 'asian' | 'mexican' | 'italian' | 'mediterranean' | 'american' | 'indian';
export type Equipment = 'stove' | 'rice_cooker' | 'oven' | 'air_fryer' | 'microwave' | 'pressure_cooker' | 'slow_cooker' | 'grill';
export type Vibe = 'quick' | 'one_pan' | 'batch' | 'budget' | 'kid_friendly' | 'comfort' | 'healthy' | 'no_cook';
export type Diet = 'vegetarian' | 'vegan' | 'pescatarian' | 'no_pork' | 'no_beef' | 'high_protein' | 'low_carb' | 'glp1';

/** `left`: comes from an earlier dish's leftovers when the plan chains them (see Recipe.leftover). */
export type Line = { id: string; qty: number; left?: boolean };

export type Recipe = {
  id: string;
  name: string;
  /** One line under the name. */
  blurb: string;
  cuisine: Cuisine;
  meals: Meal[];
  /** Sides are only added next to a main ("Goes well with"), never planned on their own. */
  side?: boolean;
  serves: number;
  minutes: number;
  /** Each entry is needed; "air_fryer|oven" means either one works. */
  equipment: string[];
  tags: Vibe[];
  /** Nutrition-style labels that aren't derived from ingredients. */
  labels?: ('high_protein' | 'low_carb' | 'glp1')[];
  /** Served with rice: the plan adds 80 g of uncooked rice per serving. */
  rice?: boolean;
  /** Days it keeps in the fridge, for cooking once and eating twice. */
  keeps: number;
  /** Variations of one dish (chicken / pork / tofu adobo) share a family, so a week doesn't repeat it. */
  family?: string;
  ingredients: Line[];
  steps: string[];
  pairs?: string[];
  /**
   * Made from yesterday's leftovers: `from` lists the dishes (or "rice", any dinner
   * served with rice) it reuses. When chained, the earlier dish is cooked bigger by
   * `share` of a meal's portions and this one's `left` lines aren't bought again.
   */
  leftover?: { from: string[] | 'rice'; share: number };
};

const RICE_PER_SERVING = 80;
export { RICE_PER_SERVING };

function lines(s: string): Line[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const [id, qty, flag] = x.split(/\s+/);
      return flag === 'left' ? { id, qty: Number(qty), left: true } : { id, qty: Number(qty) };
    });
}

type Def = Omit<Recipe, 'ingredients' | 'tags'> & { ing: string; tags?: Vibe[] };
const R = ({ ing, tags = [], ...r }: Def): Recipe => ({ ...r, tags, ingredients: lines(ing) });

const LD: Meal[] = ['lunch', 'dinner'];

export const RECIPES: Recipe[] = [
  // ── Filipino mains ───────────────────────────────────────────────────────
  R({
    id: 'chicken-adobo', family: 'adobo', name: 'Chicken adobo', blurb: 'Chicken braised in soy, vinegar and garlic.', cuisine: 'filipino', meals: LD,
    serves: 4, minutes: 45, equipment: ['stove'], tags: ['one_pan', 'batch', 'comfort', 'kid_friendly'], labels: ['high_protein'], rice: true, keeps: 4,
    ing: 'chicken_thigh 900, soy_sauce 100, vinegar 100, garlic 40, bay_leaf 3, peppercorn 3, sugar 10, oil 15',
    steps: ['Brown the chicken in oil, skin side down.', 'Add garlic, soy sauce, vinegar, bay leaves, peppercorns and 1 cup water. Don\'t stir until it boils.', 'Simmer covered for 30 minutes, then uncover and reduce the sauce.', 'Taste and add the sugar if it\'s too sharp.'],
    pairs: ['ginisang-kangkong', 'ensaladang-kamatis'],
  }),
  R({
    id: 'pork-adobo', family: 'adobo', name: 'Pork adobo', blurb: 'The classic, with pork kasim.', cuisine: 'filipino', meals: LD,
    serves: 4, minutes: 60, equipment: ['stove'], tags: ['one_pan', 'batch', 'comfort'], rice: true, keeps: 5,
    ing: 'pork_kasim 900, soy_sauce 100, vinegar 100, garlic 40, bay_leaf 3, peppercorn 3, oil 15',
    steps: ['Sear the pork until browned.', 'Add garlic, soy sauce, vinegar, bay leaves, peppercorns and 1.5 cups water.', 'Simmer covered for 45 minutes until tender.', 'Uncover and cook until the sauce is glossy.'],
    pairs: ['ginisang-kangkong', 'ensaladang-kamatis'],
  }),
  R({
    id: 'tofu-adobo', family: 'adobo', name: 'Tofu adobo', blurb: 'Crispy tofu in adobo sauce. Vegan if you skip the egg.', cuisine: 'filipino', meals: LD,
    serves: 4, minutes: 30, equipment: ['stove'], tags: ['one_pan', 'quick', 'budget', 'healthy'], rice: true, keeps: 3,
    ing: 'tofu 750, soy_sauce 80, vinegar 80, garlic 30, bay_leaf 2, peppercorn 2, brown_sugar 10, oil 60',
    steps: ['Cube the tofu and fry until golden on all sides.', 'In the same pan, fry the garlic, then add soy sauce, vinegar, bay leaves, pepper, sugar and ½ cup water.', 'Return the tofu and simmer 8 minutes until the sauce coats it.'],
    pairs: ['ginisang-kangkong'],
  }),
  R({
    id: 'sinigang-baboy', family: 'sinigang', name: 'Sinigang na baboy', blurb: 'Sour tamarind soup with pork and vegetables.', cuisine: 'filipino', meals: LD,
    serves: 5, minutes: 75, equipment: ['stove'], tags: ['comfort', 'batch'], rice: true, keeps: 3,
    ing: 'pork_kasim 700, sinigang_mix 40, tomato 200, onion 100, labanos 200, sitaw 150, kangkong 200, eggplant 150, chili_green 30, patis 20',
    steps: ['Boil the pork with tomatoes and onion in 2 L water, skimming, for 45 minutes.', 'Add radish and cook 5 minutes, then string beans and eggplant for 3 minutes.', 'Stir in the sinigang mix and fish sauce to taste.', 'Add kangkong and green chili, turn off the heat.'],
  }),
  R({
    id: 'sinigang-hipon', family: 'sinigang', name: 'Sinigang na hipon', blurb: 'Quick sour soup with shrimp.', cuisine: 'filipino', meals: LD,
    serves: 4, minutes: 30, equipment: ['stove'], tags: ['quick', 'healthy'], labels: ['high_protein', 'glp1'], rice: true, keeps: 2,
    ing: 'shrimp 500, sinigang_mix 40, tomato 200, onion 100, labanos 150, kangkong 200, okra 100, chili_green 30, patis 15',
    steps: ['Boil tomatoes and onion in 1.5 L water for 10 minutes.', 'Add radish and okra, cook 5 minutes.', 'Add the sinigang mix, then the shrimp; cook just until pink.', 'Add kangkong and chili, season with fish sauce.'],
  }),
  R({
    id: 'tinola', name: 'Chicken tinola', blurb: 'Ginger chicken soup with sayote and malunggay.', cuisine: 'filipino', meals: LD,
    serves: 4, minutes: 45, equipment: ['stove'], tags: ['comfort', 'healthy', 'kid_friendly', 'one_pan'], labels: ['high_protein', 'glp1'], rice: true, keeps: 3,
    ing: 'chicken_whole 900, ginger 40, garlic 15, onion 100, sayote 400, malunggay 50, patis 30, oil 15',
    steps: ['Sauté ginger, garlic and onion in oil.', 'Add the chicken and fish sauce, cook 5 minutes.', 'Add 1.5 L water and simmer 25 minutes.', 'Add sayote for 7 minutes, then malunggay at the end.'],
  }),
  R({
    id: 'nilagang-baka', name: 'Nilagang baka', blurb: 'Clear beef soup with corn, potato and cabbage.', cuisine: 'filipino', meals: LD,
    serves: 5, minutes: 120, equipment: ['stove|pressure_cooker'], tags: ['comfort', 'batch'], labels: ['high_protein'], rice: true, keeps: 3,
    ing: 'beef_cubes 900, onion 100, peppercorn 3, corn 2, potato 300, cabbage 400, pechay 200, patis 30',
    steps: ['Simmer the beef with onion and peppercorns in 2.5 L water for 90 minutes (30 in a pressure cooker).', 'Add corn and potatoes for 15 minutes.', 'Add cabbage and pechay for 3 minutes. Season with fish sauce.'],
  }),
  R({
    id: 'beef-caldereta', name: 'Beef caldereta', blurb: 'Rich tomato beef stew with liver spread.', cuisine: 'filipino', meals: LD,
    serves: 5, minutes: 120, equipment: ['stove|pressure_cooker'], tags: ['comfort', 'batch'], rice: true, keeps: 4,
    ing: 'beef_cubes 900, tomato_sauce 250, liver_spread 85, potato 300, carrot 200, bell_pepper 150, onion 100, garlic 20, cheese 50, green_peas 155, oil 20',
    steps: ['Brown the beef, then sauté garlic and onion.', 'Add tomato sauce and 3 cups water; simmer 90 minutes until tender.', 'Add potatoes and carrots for 15 minutes.', 'Stir in liver spread, bell pepper, peas and grated cheese; cook 5 minutes.'],
  }),
  R({
    id: 'pork-menudo', name: 'Pork menudo', blurb: 'Pork and vegetables in tomato sauce.', cuisine: 'filipino', meals: LD,
    serves: 5, minutes: 60, equipment: ['stove'], tags: ['batch', 'kid_friendly', 'comfort'], rice: true, keeps: 4,
    ing: 'pork_kasim 700, chicken_liver 100, tomato_sauce 250, potato 250, carrot 200, bell_pepper 100, raisins 50, onion 100, garlic 20, soy_sauce 30, oil 20',
    steps: ['Sauté garlic and onion, add pork and brown it.', 'Add soy sauce, tomato sauce and 2 cups water; simmer 35 minutes.', 'Add potatoes and carrots for 15 minutes, then liver, raisins and bell pepper for 5.'],
  }),
  R({
    id: 'giniling', name: 'Pork giniling', blurb: 'Ground pork with potatoes and carrots.', cuisine: 'filipino', meals: LD,
    serves: 4, minutes: 30, equipment: ['stove'], tags: ['quick', 'one_pan', 'budget', 'kid_friendly', 'batch'], rice: true, keeps: 4,
    ing: 'pork_ground 500, potato 200, carrot 150, green_peas 155, tomato_sauce 250, onion 100, garlic 15, soy_sauce 20, raisins 30, oil 15',
    steps: ['Sauté garlic and onion, add the pork and cook until no longer pink.', 'Add diced potatoes and carrots, soy sauce, tomato sauce and ½ cup water.', 'Simmer 15 minutes, then add peas and raisins.'],
    pairs: ['ensaladang-kamatis'],
  }),
  R({
    id: 'bistek', name: 'Bistek Tagalog', blurb: 'Beef in soy and calamansi with onion rings.', cuisine: 'filipino', meals: LD,
    serves: 4, minutes: 40, equipment: ['stove'], tags: ['comfort'], labels: ['high_protein', 'low_carb'], rice: true, keeps: 3,
    ing: 'beef_lean 600, soy_sauce 80, calamansi 100, onion 200, garlic 15, pepper 2, oil 30',
    steps: ['Marinate thin beef slices in soy sauce, calamansi juice, garlic and pepper for 20 minutes.', 'Fry the onion rings briefly and set aside.', 'Sear the beef in batches, add the marinade and ½ cup water and simmer 10 minutes.', 'Top with the onions.'],
  }),
  R({
    id: 'tortang-talong', name: 'Tortang talong', blurb: 'Grilled eggplant omelette.', cuisine: 'filipino', meals: ['breakfast', 'lunch', 'dinner'],
    serves: 3, minutes: 30, equipment: ['stove'], tags: ['budget', 'kid_friendly'], labels: ['low_carb'], rice: true, keeps: 1,
    ing: 'eggplant 450, egg 4, onion 50, salt 3, pepper 1, oil 45',
    steps: ['Char the eggplants over the flame or in a pan until soft, then peel and flatten with a fork.', 'Dip each in beaten egg seasoned with salt, pepper and onion.', 'Fry until set on both sides.'],
    pairs: ['ensaladang-kamatis'],
  }),
  R({
    id: 'ginisang-monggo', family: 'monggo', name: 'Ginisang monggo', blurb: 'Mung bean stew with malunggay.', cuisine: 'filipino', meals: LD,
    serves: 5, minutes: 60, equipment: ['stove'], tags: ['budget', 'batch', 'healthy', 'comfort'], labels: ['high_protein'], rice: true, keeps: 4,
    ing: 'monggo 400, tomato 150, onion 100, garlic 15, malunggay 50, pork_kasim 150, patis 20, oil 15',
    steps: ['Boil the monggo in 1.5 L water for 40 minutes until soft.', 'Sauté garlic, onion, tomato and the pork until cooked.', 'Add the monggo and simmer 10 minutes; season with fish sauce.', 'Add malunggay at the end. (Skip the pork and use salt for a vegan version.)'],
  }),
  R({
    id: 'monggo-vegan', family: 'monggo', name: 'Vegan ginisang monggo', blurb: 'Mung beans with squash and malunggay.', cuisine: 'filipino', meals: LD,
    serves: 5, minutes: 55, equipment: ['stove'], tags: ['budget', 'batch', 'healthy'], labels: ['high_protein'], rice: true, keeps: 4,
    ing: 'monggo 400, squash 300, tomato 150, onion 100, garlic 15, malunggay 50, salt 8, oil 15',
    steps: ['Boil the monggo in 1.5 L water for 40 minutes.', 'Sauté garlic, onion and tomato.', 'Add the monggo and cubed squash; simmer 10 minutes. Season with salt.', 'Add malunggay at the end.'],
  }),
  R({
    id: 'pinakbet', name: 'Pinakbet', blurb: 'Ilocano vegetable stew with bagoong.', cuisine: 'filipino', meals: LD,
    serves: 4, minutes: 35, equipment: ['stove'], tags: ['healthy', 'one_pan', 'budget'], labels: ['glp1', 'low_carb'], rice: true, keeps: 3,
    ing: 'pork_liempo 200, squash 250, eggplant 200, okra 100, ampalaya 150, sitaw 150, tomato 150, onion 80, garlic 15, bagoong 40, oil 10',
    steps: ['Render the pork in a pan until crisp.', 'Sauté garlic, onion and tomato, then the bagoong.', 'Add squash and ½ cup water, cook 5 minutes.', 'Add the remaining vegetables and cook covered 8 minutes without stirring too much.'],
  }),
  R({
    id: 'ginataang-kalabasa', name: 'Ginataang kalabasa at sitaw', blurb: 'Squash and string beans in coconut milk.', cuisine: 'filipino', meals: LD,
    serves: 4, minutes: 30, equipment: ['stove'], tags: ['budget', 'one_pan', 'comfort'], rice: true, keeps: 3,
    ing: 'squash 500, sitaw 200, coconut_milk 400, shrimp 150, onion 80, garlic 15, patis 15, oil 10',
    steps: ['Sauté garlic and onion.', 'Add squash and coconut milk; simmer 10 minutes.', 'Add string beans and shrimp, cook 5 minutes. Season with fish sauce.'],
  }),
  R({
    id: 'chopsuey', name: 'Chopsuey', blurb: 'Stir-fried mixed vegetables with chicken.', cuisine: 'filipino', meals: LD,
    serves: 4, minutes: 25, equipment: ['stove'], tags: ['quick', 'healthy', 'one_pan', 'kid_friendly'], labels: ['glp1'], rice: true, keeps: 2,
    ing: 'chicken_breast 250, cabbage 300, carrot 150, baguio_beans 100, broccoli 200, bell_pepper 100, onion 80, garlic 15, oyster_sauce 40, cornstarch 10, oil 20',
    steps: ['Stir-fry garlic, onion and sliced chicken until cooked.', 'Add carrots and beans, then broccoli, cabbage and bell pepper.', 'Add oyster sauce and ½ cup water thickened with cornstarch; toss until glossy.'],
  }),
  R({
    id: 'ginisang-repolyo', name: 'Ginisang repolyo', blurb: 'Sautéed cabbage with ground pork.', cuisine: 'filipino', meals: LD,
    serves: 4, minutes: 20, equipment: ['stove'], tags: ['quick', 'budget', 'one_pan'], labels: ['low_carb'], rice: true, keeps: 2,
    ing: 'cabbage 600, pork_ground 200, carrot 100, onion 80, garlic 15, patis 15, oil 15',
    steps: ['Sauté garlic, onion and pork until browned.', 'Add carrots and ¼ cup water, cook 3 minutes.', 'Add cabbage and fish sauce; toss until just wilted.'],
  }),
  R({
    id: 'ampalaya-itlog', name: 'Ampalaya con itlog', blurb: 'Bitter gourd scrambled with egg and tomato.', cuisine: 'filipino', meals: LD,
    serves: 3, minutes: 20, equipment: ['stove'], tags: ['quick', 'budget', 'healthy'], labels: ['low_carb', 'glp1'], rice: true, keeps: 1,
    ing: 'ampalaya 400, egg 3, tomato 150, onion 80, garlic 10, salt 5, oil 15',
    steps: ['Slice ampalaya thinly, rub with salt, rest 10 minutes and squeeze dry.', 'Sauté garlic, onion and tomato, then the ampalaya for 3 minutes.', 'Pour in beaten eggs and fold until set.'],
  }),
  R({
    id: 'paksiw-bangus', name: 'Paksiw na bangus', blurb: 'Milkfish poached in vinegar, ginger and eggplant.', cuisine: 'filipino', meals: LD,
    serves: 4, minutes: 30, equipment: ['stove'], tags: ['one_pan', 'healthy'], labels: ['high_protein', 'low_carb', 'glp1'], rice: true, keeps: 3,
    ing: 'bangus 800, vinegar 120, ginger 30, garlic 15, eggplant 200, ampalaya 150, chili_green 30, salt 5, peppercorn 2',
    steps: ['Arrange ginger, garlic and vegetables in a pan, put the fish on top.', 'Add vinegar, ½ cup water, salt, peppercorns and chili.', 'Bring to a boil without stirring, then simmer 15 minutes.'],
  }),
  R({
    id: 'fried-tilapia', name: 'Fried tilapia with ensalada', blurb: 'Crispy whole tilapia with tomato salad.', cuisine: 'filipino', meals: LD,
    serves: 4, minutes: 30, equipment: ['stove|air_fryer'], tags: ['budget', 'quick'], labels: ['high_protein', 'low_carb'], rice: true, keeps: 1,
    ing: 'tilapia 1000, salt 8, oil 120, tomato 200, onion 60, calamansi 40, patis 10',
    steps: ['Score and salt the fish; pat very dry.', 'Fry in hot oil 6–7 minutes a side (or air-fry at 200°C for 20 minutes, turning once).', 'Toss diced tomato and onion with calamansi and fish sauce on the side.'],
  }),
  R({
    id: 'daing-bangus', name: 'Daing na bangus', blurb: 'Vinegar-garlic marinated milkfish, fried or air-fried.', cuisine: 'filipino', meals: ['breakfast', 'lunch', 'dinner'],
    serves: 3, minutes: 25, equipment: ['stove|air_fryer'], tags: ['quick'], labels: ['high_protein', 'low_carb'], rice: true, keeps: 1,
    ing: 'bangus 700, vinegar 100, garlic 30, peppercorn 2, salt 5, oil 60',
    steps: ['Marinate butterflied bangus in vinegar, crushed garlic, pepper and salt overnight (or 1 hour).', 'Pat dry, then fry skin-side down until crisp (air fryer: 200°C, 15 minutes).'],
    pairs: ['ensaladang-kamatis', 'atchara-cucumber'],
  }),
  R({
    id: 'lechon-kawali', name: 'Air fryer lechon kawali', blurb: 'Crackling pork belly without the splatter.', cuisine: 'filipino', meals: LD,
    serves: 4, minutes: 90, equipment: ['air_fryer|oven', 'stove'], tags: ['comfort'], labels: ['low_carb'], rice: true, keeps: 2,
    ing: 'pork_liempo 800, garlic 20, bay_leaf 3, peppercorn 3, salt 15, vinegar 60, soy_sauce 30, onion 40, chili_red 5',
    steps: ['Boil the pork with garlic, bay leaves, peppercorns and salt for 40 minutes; dry it well.', 'Air-fry at 200°C for 25–30 minutes (or roast at 220°C for 40) until the skin blisters.', 'Dip: vinegar, soy sauce, chopped onion and chili.'],
  }),
  R({
    id: 'inihaw-liempo', family: 'grilled', name: 'Inihaw na liempo', blurb: 'Grilled marinated pork belly.', cuisine: 'filipino', meals: LD,
    serves: 4, minutes: 50, equipment: ['grill|air_fryer|oven'], tags: ['comfort'], rice: true, keeps: 2,
    ing: 'pork_liempo 800, soy_sauce 60, calamansi 60, garlic 20, ketchup 60, brown_sugar 30, pepper 2',
    steps: ['Marinate the pork in soy sauce, calamansi, garlic, ketchup, sugar and pepper for at least 1 hour.', 'Grill or air-fry at 200°C for 20–25 minutes, basting with the marinade.'],
    pairs: ['atchara-cucumber', 'ensaladang-kamatis'],
  }),
  R({
    id: 'chicken-inasal', family: 'grilled', name: 'Chicken inasal', blurb: 'Bacolod-style grilled chicken.', cuisine: 'filipino', meals: LD,
    serves: 4, minutes: 50, equipment: ['grill|air_fryer|oven'], tags: ['kid_friendly'], labels: ['high_protein', 'low_carb'], rice: true, keeps: 2,
    ing: 'chicken_drumstick 1000, calamansi 80, vinegar 60, ginger 20, garlic 30, brown_sugar 20, salt 8, pepper 2, oil 30',
    steps: ['Marinate chicken in calamansi, vinegar, ginger, garlic, sugar, salt and pepper for 1 hour or overnight.', 'Grill or air-fry at 190°C for 25 minutes, brushing with oil.'],
    pairs: ['atchara-cucumber'],
  }),
  R({
    id: 'chicken-curry-ph', family: 'curry', name: 'Filipino chicken curry', blurb: 'Mild coconut curry with potatoes and carrots.', cuisine: 'filipino', meals: LD,
    serves: 5, minutes: 45, equipment: ['stove'], tags: ['comfort', 'batch', 'kid_friendly', 'one_pan'], rice: true, keeps: 4,
    ing: 'chicken_whole 1000, coconut_milk 400, potato 300, carrot 200, bell_pepper 100, onion 100, garlic 15, curry_powder 15, patis 20, oil 20',
    steps: ['Sauté garlic, onion and the chicken until browned.', 'Add curry powder, fish sauce and 1 cup water; simmer 15 minutes.', 'Add potatoes, carrots and coconut milk; simmer 15 minutes.', 'Add bell pepper for the last 3 minutes.'],
  }),
  R({
    id: 'sardinas-misua', name: 'Sardinas with misua', blurb: 'The fastest comforting soup in the pantry.', cuisine: 'filipino', meals: LD,
    serves: 3, minutes: 15, equipment: ['stove'], tags: ['quick', 'budget', 'one_pan', 'comfort'], rice: true, keeps: 1,
    ing: 'sardines 310, misua 50, onion 60, garlic 10, egg 1, oil 10',
    steps: ['Sauté garlic and onion, add the sardines with their sauce and 3 cups water.', 'Boil, add misua and cook 2 minutes.', 'Swirl in a beaten egg.'],
  }),
  R({
    id: 'corned-beef-guisado', name: 'Corned beef guisado', blurb: 'Corned beef with potatoes and cabbage.', cuisine: 'filipino', meals: ['breakfast', 'lunch', 'dinner'],
    serves: 3, minutes: 15, equipment: ['stove'], tags: ['quick', 'budget', 'one_pan', 'kid_friendly'], rice: true, keeps: 2,
    ing: 'corned_beef 300, potato 200, cabbage 150, onion 60, garlic 10, oil 15',
    steps: ['Fry diced potatoes until tender.', 'Add garlic and onion, then the corned beef; break it up.', 'Add shredded cabbage and cook 2 minutes.'],
  }),
  R({
    id: 'pancit-bihon', name: 'Pancit bihon', blurb: 'Rice noodles with chicken and vegetables.', cuisine: 'filipino', meals: ['lunch', 'dinner', 'snack'],
    serves: 5, minutes: 35, equipment: ['stove'], tags: ['kid_friendly', 'batch'], keeps: 2,
    ing: 'bihon 250, chicken_breast 250, cabbage 250, carrot 120, baguio_beans 100, onion 80, garlic 15, soy_sauce 60, calamansi 40, oil 20',
    steps: ['Soak the bihon in water for 10 minutes.', 'Sauté garlic, onion and sliced chicken, then the carrots and beans.', 'Add soy sauce and 2 cups water, boil, then add the noodles and toss until absorbed.', 'Add cabbage and serve with calamansi.'],
  }),
  R({
    id: 'lumpiang-shanghai', name: 'Lumpiang shanghai', blurb: 'Pork spring rolls; freeze half for later.', cuisine: 'filipino', meals: ['lunch', 'dinner', 'snack'],
    serves: 5, minutes: 60, equipment: ['stove|air_fryer'], tags: ['kid_friendly', 'batch'], rice: true, keeps: 30,
    ing: 'pork_ground 500, carrot 100, onion 80, garlic 15, egg 1, lumpia_wrapper 25, salt 5, pepper 2, oil 300, ketchup 80',
    steps: ['Mix pork, minced carrot, onion, garlic, egg, salt and pepper.', 'Roll a tablespoon in each wrapper, sealing with water.', 'Deep-fry 4–5 minutes (or air-fry at 200°C, 12 minutes, brushed with oil). Freeze the extras raw.'],
  }),
  R({
    id: 'tofu-sisig', name: 'Tofu sisig', blurb: 'Crispy tofu with onions, chili and calamansi.', cuisine: 'filipino', meals: LD,
    serves: 3, minutes: 25, equipment: ['stove|air_fryer'], tags: ['quick', 'budget'], labels: ['high_protein'], rice: true, keeps: 2,
    ing: 'tofu 500, onion 120, chili_red 10, calamansi 50, soy_sauce 30, mayonnaise 40, oil 40',
    steps: ['Cube tofu and fry or air-fry until crisp.', 'Sauté onion and chili, add the tofu, soy sauce and calamansi.', 'Stir through the mayonnaise off the heat.'],
  }),

  // ── Filipino breakfast and merienda ─────────────────────────────────────
  R({
    id: 'tapsilog', family: 'silog', name: 'Tapsilog', blurb: 'Beef tapa, garlic rice and a fried egg.', cuisine: 'filipino', meals: ['breakfast'],
    serves: 3, minutes: 30, equipment: ['stove'], tags: ['comfort'], labels: ['high_protein'], keeps: 3,
    ing: 'beef_lean 400, soy_sauce 50, calamansi 30, garlic 30, brown_sugar 20, pepper 2, rice 240, egg 3, oil 40',
    steps: ['Marinate thin beef in soy sauce, calamansi, half the garlic, sugar and pepper overnight.', 'Fry leftover rice with the rest of the garlic.', 'Pan-fry the beef until caramelised; fry the eggs.'],
  }),
  R({
    id: 'longsilog', family: 'silog', name: 'Longsilog', blurb: 'Longganisa, garlic rice and egg.', cuisine: 'filipino', meals: ['breakfast'],
    serves: 3, minutes: 20, equipment: ['stove|air_fryer'], tags: ['quick', 'kid_friendly', 'comfort'], keeps: 1,
    ing: 'longganisa 400, rice 240, garlic 20, egg 3, oil 30, vinegar 30',
    steps: ['Simmer longganisa in ½ cup water until dry, then fry until browned (or air-fry 12 minutes).', 'Fry leftover rice with garlic.', 'Fry the eggs. Serve with spiced vinegar.'],
  }),
  R({
    id: 'scrambled-eggs-tomato', name: 'Scrambled eggs with tomato', blurb: 'Eggs, tomato and onion with pandesal.', cuisine: 'filipino', meals: ['breakfast'],
    serves: 3, minutes: 10, equipment: ['stove'], tags: ['quick', 'budget', 'kid_friendly'], labels: ['high_protein'], keeps: 1,
    ing: 'egg 6, tomato 150, onion 60, salt 3, oil 15, pandesal 6',
    steps: ['Sauté onion and tomato until soft.', 'Add beaten eggs with salt and fold gently until just set.', 'Serve with warm pandesal.'],
  }),
  R({
    id: 'arroz-caldo', name: 'Arroz caldo', blurb: 'Ginger chicken rice porridge.', cuisine: 'filipino', meals: ['breakfast', 'dinner'],
    serves: 5, minutes: 50, equipment: ['stove'], tags: ['comfort', 'budget', 'one_pan', 'kid_friendly'], keeps: 3,
    ing: 'chicken_whole 500, glutinous_rice 200, rice 100, ginger 40, garlic 30, onion 80, patis 30, egg 3, spring_onion 30, calamansi 30, oil 30',
    steps: ['Sauté ginger, onion and half the garlic, then the chicken and fish sauce.', 'Add both rices and 2 L water; simmer 30 minutes, stirring often.', 'Top with boiled egg, fried garlic, spring onion and calamansi.'],
  }),
  R({
    id: 'champorado', name: 'Champorado', blurb: 'Chocolate rice porridge with milk.', cuisine: 'filipino', meals: ['breakfast', 'snack'],
    serves: 4, minutes: 30, equipment: ['stove'], tags: ['comfort', 'kid_friendly', 'budget'], keeps: 2,
    ing: 'glutinous_rice 200, tablea 100, sugar 80, evap_milk 150',
    steps: ['Simmer the rice in 1.2 L water for 15 minutes, stirring.', 'Add tablea and sugar; cook until thick.', 'Serve with evaporated milk.'],
  }),
  R({
    id: 'turon', family: 'saba', name: 'Turon', blurb: 'Caramelised saba banana spring rolls.', cuisine: 'filipino', meals: ['snack'],
    serves: 4, minutes: 25, equipment: ['stove|air_fryer'], tags: ['kid_friendly', 'budget'], keeps: 1,
    ing: 'banana_saba 600, brown_sugar 80, lumpia_wrapper 8, oil 200',
    steps: ['Halve the saba lengthwise and roll each in sugar and a wrapper.', 'Fry until golden, sprinkling more sugar to caramelise (air fryer: 200°C, 10 minutes).'],
  }),
  R({
    id: 'banana-cue', family: 'saba', name: 'Banana cue', blurb: 'Saba fried in caramelised brown sugar.', cuisine: 'filipino', meals: ['snack'],
    serves: 4, minutes: 20, equipment: ['stove'], tags: ['kid_friendly', 'budget', 'quick'], keeps: 1,
    ing: 'banana_saba 800, brown_sugar 120, oil 250',
    steps: ['Fry whole peeled saba in oil until golden.', 'Add the sugar and keep turning until coated in caramel.'],
  }),
  R({
    id: 'ginataang-mais', name: 'Ginataang mais', blurb: 'Sweet corn and coconut porridge.', cuisine: 'filipino', meals: ['snack', 'breakfast'],
    serves: 4, minutes: 30, equipment: ['stove'], tags: ['comfort', 'budget'], keeps: 2,
    ing: 'glutinous_rice 150, corn 2, coconut_milk 400, sugar 100',
    steps: ['Simmer the rice in 1 L water for 15 minutes.', 'Add corn kernels, coconut milk and sugar; cook until thick.'],
  }),

  // ── Asian ────────────────────────────────────────────────────────────────
  R({
    id: 'chicken-teriyaki', name: 'Chicken teriyaki', blurb: 'Glazed thighs, done in one pan.', cuisine: 'asian', meals: LD,
    serves: 4, minutes: 25, equipment: ['stove|air_fryer'], tags: ['quick', 'one_pan', 'kid_friendly'], labels: ['high_protein'], rice: true, keeps: 3,
    ing: 'chicken_thigh 800, soy_sauce 70, honey 40, garlic 10, ginger 10, cornstarch 8, spring_onion 20, oil 15',
    steps: ['Sear the chicken skin-side down until crisp, then flip.', 'Add soy sauce, honey, garlic, ginger and ¼ cup water; simmer until sticky (thicken with cornstarch if needed).', 'Slice and top with spring onion.'],
    pairs: ['stir-fried-broccoli', 'cucumber-salad'],
  }),
  R({
    id: 'beef-broccoli', name: 'Beef and broccoli', blurb: 'Takeout-style stir-fry.', cuisine: 'asian', meals: LD,
    serves: 4, minutes: 25, equipment: ['stove'], tags: ['quick', 'one_pan'], labels: ['high_protein', 'low_carb'], rice: true, keeps: 2,
    ing: 'beef_lean 500, broccoli 400, oyster_sauce 50, soy_sauce 30, garlic 15, ginger 10, cornstarch 15, sugar 8, oil 30',
    steps: ['Toss sliced beef with half the cornstarch and soy sauce.', 'Blanch broccoli 2 minutes.', 'Sear the beef in a hot pan, add garlic and ginger, then broccoli, oyster sauce, sugar and ½ cup water mixed with cornstarch.'],
  }),
  R({
    id: 'mapo-tofu', name: 'Mapo tofu', blurb: 'Silky tofu in spicy pork sauce.', cuisine: 'asian', meals: LD,
    serves: 4, minutes: 25, equipment: ['stove'], tags: ['quick', 'one_pan', 'budget'], rice: true, keeps: 2,
    ing: 'tofu 600, pork_ground 200, garlic 15, ginger 10, chili_red 10, chili_powder 5, soy_sauce 40, cornstarch 10, spring_onion 20, sesame_oil 10, oil 15',
    steps: ['Fry the pork until crisp with garlic, ginger and chili.', 'Add soy sauce, chili powder and 1 cup water; slide in cubed tofu and simmer 5 minutes.', 'Thicken with cornstarch slurry; finish with sesame oil and spring onion.'],
  }),
  R({
    id: 'tofu-veg-stirfry', name: 'Tofu and vegetable stir-fry', blurb: 'Vegan, fast, and good for using up vegetables.', cuisine: 'asian', meals: LD,
    serves: 3, minutes: 20, equipment: ['stove'], tags: ['quick', 'one_pan', 'healthy', 'budget'], labels: ['glp1'], rice: true, keeps: 2,
    ing: 'tofu 500, broccoli 200, carrot 100, bell_pepper 100, cabbage 200, garlic 15, ginger 10, soy_sauce 40, cornstarch 8, oil 30',
    steps: ['Pan-fry tofu cubes until golden; set aside.', 'Stir-fry garlic, ginger and the vegetables, hardest first.', 'Return the tofu with soy sauce and a cornstarch slurry; toss until glossy.'],
  }),
  R({
    id: 'egg-fried-rice', name: 'Egg fried rice', blurb: 'Leftover rice night.', cuisine: 'asian', meals: ['breakfast', 'lunch', 'dinner'],
    serves: 3, minutes: 15, equipment: ['stove'], tags: ['quick', 'budget', 'one_pan', 'kid_friendly'], keeps: 1,
    ing: 'rice 300, egg 4, carrot 80, green_peas 155, spring_onion 30, garlic 10, soy_sauce 30, oil 30',
    steps: ['Scramble the eggs and set aside.', 'Fry garlic, carrots and peas, then the cold cooked rice until hot.', 'Add soy sauce, the eggs and spring onion.'],
  }),
  R({
    id: 'pork-bulgogi', name: 'Pork bulgogi', blurb: 'Sweet-spicy Korean pork with lettuce wraps.', cuisine: 'asian', meals: LD,
    serves: 4, minutes: 30, equipment: ['stove|grill'], tags: ['quick'], rice: true, keeps: 2,
    ing: 'pork_kasim 600, soy_sauce 50, brown_sugar 30, garlic 20, ginger 10, chili_powder 10, sesame_oil 15, onion 100, lettuce 200',
    steps: ['Marinate thin pork in soy sauce, sugar, garlic, ginger, chili powder and sesame oil for 20 minutes.', 'Stir-fry with sliced onion over high heat until caramelised.', 'Serve with lettuce leaves for wrapping.'],
  }),
  R({
    id: 'ramen-upgrade', name: 'Upgraded instant noodles', blurb: 'Instant mami with egg and greens.', cuisine: 'asian', meals: ['lunch', 'dinner', 'snack'],
    serves: 2, minutes: 10, equipment: ['stove'], tags: ['quick', 'budget', 'one_pan'], keeps: 0,
    ing: 'instant_noodles 110, egg 2, pechay 150, spring_onion 15',
    steps: ['Boil the noodles with the seasoning.', 'Add pechay for the last minute and crack in the eggs.', 'Top with spring onion.'],
  }),
  R({
    id: 'salmon-rice-bowl', name: 'Salmon rice bowl', blurb: 'Pan-seared salmon belly, cucumber and egg.', cuisine: 'asian', meals: LD,
    serves: 3, minutes: 20, equipment: ['stove|air_fryer'], tags: ['quick', 'healthy'], labels: ['high_protein', 'glp1'], rice: true, keeps: 1,
    ing: 'salmon_belly 450, soy_sauce 30, honey 15, cucumber 200, egg 3, spring_onion 15, sesame_oil 5',
    steps: ['Sear the salmon until crisp; glaze with soy sauce and honey.', 'Soft-boil the eggs for 7 minutes.', 'Serve over rice with sliced cucumber and spring onion.'],
  }),

  // ── Mexican ─────────────────────────────────────────────────────────────
  R({
    id: 'chicken-tacos', family: 'tacos', name: 'Chicken tinga tacos', blurb: 'Smoky shredded chicken in tortillas.', cuisine: 'mexican', meals: LD,
    serves: 4, minutes: 35, equipment: ['stove'], tags: ['kid_friendly', 'batch'], labels: ['high_protein'], keeps: 3,
    ing: 'chicken_breast 600, tomato 300, onion 120, garlic 15, chili_powder 10, paprika 5, cumin 3, tortilla 8, lettuce 100, cilantro 15, calamansi 30, oil 15',
    steps: ['Poach the chicken 15 minutes, then shred.', 'Sauté onion and garlic, add chopped tomato and the spices; cook 8 minutes.', 'Stir in the chicken. Fill warm tortillas with lettuce, cilantro and calamansi.'],
  }),
  R({
    id: 'beef-burrito-bowl', name: 'Beef burrito bowl', blurb: 'Spiced beef, beans, rice and salsa.', cuisine: 'mexican', meals: LD,
    serves: 4, minutes: 30, equipment: ['stove'], tags: ['one_pan', 'batch'], labels: ['high_protein'], rice: true, keeps: 3,
    ing: 'beef_ground 500, black_beans 400, corn 2, tomato 200, onion 100, lettuce 150, avocado 300, cumin 5, chili_powder 10, salsa 150, oil 15',
    steps: ['Brown the beef with onion, cumin and chili powder.', 'Warm the beans and corn kernels.', 'Build bowls: rice, beef, beans, corn, chopped tomato, lettuce, avocado and salsa.'],
  }),
  R({
    id: 'bean-quesadilla', name: 'Black bean quesadillas', blurb: 'Crispy, cheesy, vegetarian.', cuisine: 'mexican', meals: ['lunch', 'dinner', 'snack'],
    serves: 3, minutes: 15, equipment: ['stove|air_fryer'], tags: ['quick', 'budget', 'kid_friendly'], keeps: 1,
    ing: 'tortilla 6, black_beans 400, cheese 165, onion 60, cumin 3, salsa 120',
    steps: ['Mash the beans with cumin and chopped onion.', 'Spread on half of each tortilla, add cheese and fold.', 'Toast in a dry pan until crisp on both sides. Serve with salsa.'],
  }),
  R({
    id: 'huevos-rancheros', name: 'Huevos rancheros', blurb: 'Eggs in tomato-chili sauce on tortillas.', cuisine: 'mexican', meals: ['breakfast', 'lunch'],
    serves: 2, minutes: 20, equipment: ['stove'], tags: ['quick', 'one_pan'], labels: ['high_protein'], keeps: 0,
    ing: 'egg 4, tortilla 4, tomato 300, onion 80, garlic 10, chili_green 20, black_beans 200, cilantro 10, oil 15',
    steps: ['Simmer chopped tomato, onion, garlic and chili into a sauce, 8 minutes.', 'Make wells and crack in the eggs; cover until set.', 'Serve on warm tortillas with beans and cilantro.'],
  }),
  R({
    id: 'chili-con-carne', name: 'Chili con carne', blurb: 'Big pot, better the next day.', cuisine: 'mexican', meals: LD,
    serves: 6, minutes: 60, equipment: ['stove|slow_cooker|pressure_cooker'], tags: ['batch', 'comfort', 'one_pan'], labels: ['high_protein'], rice: true, keeps: 5,
    ing: 'beef_ground 700, black_beans 800, tomato_sauce 500, tomato 300, onion 150, garlic 20, bell_pepper 150, chili_powder 15, cumin 8, paprika 5, oil 20',
    steps: ['Brown the beef with onion, garlic and bell pepper.', 'Add the spices, tomato sauce, chopped tomato and beans.', 'Simmer 40 minutes (slow cooker: 6 hours on low).'],
  }),
  R({
    id: 'veggie-tacos', family: 'tacos', name: 'Spiced vegetable tacos', blurb: 'Roasted camote and beans, vegan.', cuisine: 'mexican', meals: LD,
    serves: 4, minutes: 35, equipment: ['oven|air_fryer', 'stove'], tags: ['healthy', 'budget'], keeps: 2,
    ing: 'camote 600, black_beans 400, tortilla 8, cabbage 150, avocado 300, cumin 5, paprika 5, chili_powder 5, calamansi 40, olive_oil 30',
    steps: ['Toss cubed camote with oil and spices; roast at 210°C for 25 minutes (air fryer: 15).', 'Warm the beans.', 'Fill tortillas with camote, beans, shredded cabbage and avocado; squeeze over calamansi.'],
  }),

  // ── Italian, Mediterranean, American, Indian ─────────────────────────────
  R({
    id: 'pinoy-spaghetti', family: 'spaghetti', name: 'Filipino-style spaghetti', blurb: 'Sweet sauce, hotdog-free version with ground pork.', cuisine: 'filipino', meals: LD,
    serves: 5, minutes: 35, equipment: ['stove'], tags: ['kid_friendly', 'batch', 'comfort'], keeps: 3,
    ing: 'pasta 500, pork_ground 400, spaghetti_sauce 500, onion 100, garlic 15, cheese 80, oil 15',
    steps: ['Cook the pasta.', 'Sauté garlic, onion and pork, add the spaghetti sauce and ½ cup water; simmer 15 minutes.', 'Toss or top the pasta and finish with grated cheese.'],
  }),
  R({
    id: 'spaghetti-bolognese', family: 'spaghetti', name: 'Spaghetti bolognese', blurb: 'Classic meat sauce.', cuisine: 'italian', meals: LD,
    serves: 5, minutes: 50, equipment: ['stove'], tags: ['batch', 'comfort', 'kid_friendly'], keeps: 4,
    ing: 'pasta 500, beef_ground 500, tomato_sauce 500, tomato 300, onion 120, carrot 100, garlic 15, cheese 60, olive_oil 30',
    steps: ['Soften diced onion, carrot and garlic in oil.', 'Add the beef and brown it, then tomato sauce and chopped tomato.', 'Simmer 30 minutes. Serve over pasta with cheese.'],
  }),
  R({
    id: 'tuna-aglio-olio', name: 'Tuna aglio olio', blurb: 'Garlic and olive oil pasta with tuna.', cuisine: 'italian', meals: LD,
    serves: 3, minutes: 15, equipment: ['stove'], tags: ['quick', 'budget', 'one_pan'], keeps: 1,
    ing: 'pasta 300, tuna_can 310, garlic 30, chili_red 5, olive_oil 60, spring_onion 15, salt 5',
    steps: ['Cook the pasta; keep a cup of the water.', 'Gently fry sliced garlic and chili in olive oil.', 'Add tuna, pasta and splashes of pasta water; toss until glossy.'],
  }),
  R({
    id: 'sheet-pan-chicken', name: 'Sheet-pan chicken and potatoes', blurb: 'Everything roasts together.', cuisine: 'american', meals: LD,
    serves: 4, minutes: 50, equipment: ['oven|air_fryer'], tags: ['one_pan', 'kid_friendly'], labels: ['high_protein'], keeps: 3,
    ing: 'chicken_drumstick 1000, potato 600, carrot 200, garlic 20, paprika 8, salt 8, pepper 2, olive_oil 40',
    steps: ['Toss chicken, potato wedges, carrots and garlic with oil, paprika, salt and pepper.', 'Roast at 210°C for 40 minutes (air fryer: 200°C, 25 minutes in batches).'],
  }),
  R({
    id: 'air-fryer-wings', name: 'Air fryer garlic wings', blurb: 'Crisp wings without deep-frying.', cuisine: 'american', meals: ['dinner', 'snack'],
    serves: 3, minutes: 30, equipment: ['air_fryer|oven'], tags: ['kid_friendly'], labels: ['high_protein', 'low_carb'], keeps: 2,
    ing: 'chicken_wings 900, garlic 30, butter 40, salt 8, pepper 2, cornstarch 15',
    steps: ['Pat wings dry and toss with cornstarch, salt and pepper.', 'Air-fry at 200°C for 22 minutes, shaking halfway.', 'Toss in garlic sautéed in butter.'],
  }),
  R({
    id: 'chicken-salad-bowl', family: 'salad', name: 'Grilled chicken salad', blurb: 'High protein, light, and quick.', cuisine: 'mediterranean', meals: LD,
    serves: 2, minutes: 20, equipment: ['stove|air_fryer|grill'], tags: ['quick', 'healthy', 'no_cook'], labels: ['high_protein', 'low_carb', 'glp1'], keeps: 1,
    ing: 'chicken_breast 400, lettuce 200, cucumber 150, tomato 150, onion 40, olive_oil 30, calamansi 30, salt 4, pepper 1',
    steps: ['Season and sear the chicken 5 minutes a side; rest and slice.', 'Toss the vegetables with olive oil, calamansi, salt and pepper.', 'Top with the chicken.'],
  }),
  R({
    id: 'greek-chicken', family: 'salad', name: 'Greek lemon chicken', blurb: 'With cucumber-yogurt sauce.', cuisine: 'mediterranean', meals: LD,
    serves: 4, minutes: 40, equipment: ['oven|air_fryer|grill'], tags: ['healthy'], labels: ['high_protein', 'low_carb', 'glp1'], keeps: 3,
    ing: 'chicken_thigh 800, yogurt 250, cucumber 200, garlic 20, calamansi 60, olive_oil 30, paprika 5, salt 6, tomato 200, olives 80',
    steps: ['Marinate chicken in half the yogurt, calamansi, garlic, paprika and oil for 20 minutes.', 'Roast at 210°C for 25 minutes.', 'Mix grated cucumber into the rest of the yogurt; serve with tomato and olives.'],
  }),
  R({
    id: 'lentil-soup', name: 'Lentil and vegetable soup', blurb: 'Hearty, vegan, freezes well.', cuisine: 'mediterranean', meals: LD,
    serves: 6, minutes: 45, equipment: ['stove|pressure_cooker|slow_cooker'], tags: ['batch', 'healthy', 'budget', 'one_pan'], labels: ['high_protein', 'glp1'], keeps: 5,
    ing: 'lentils 400, carrot 200, onion 150, garlic 15, tomato 300, potato 300, cumin 5, kale 100, olive_oil 30, salt 10',
    steps: ['Soften onion, carrot and garlic in oil with cumin.', 'Add lentils, chopped tomato, potato and 2 L water; simmer 30 minutes.', 'Stir in kale for the last 5 minutes; season with salt.'],
  }),
  R({
    id: 'chickpea-curry', family: 'curry', name: 'Chickpea and kangkong curry', blurb: 'Coconut chickpea curry, vegan.', cuisine: 'indian', meals: LD,
    serves: 4, minutes: 30, equipment: ['stove'], tags: ['one_pan', 'healthy', 'batch'], rice: true, keeps: 4,
    ing: 'chickpeas 800, coconut_milk 400, tomato 300, onion 120, garlic 15, ginger 15, curry_powder 15, kangkong 200, oil 20, salt 8',
    steps: ['Sauté onion, garlic and ginger, then the curry powder for 1 minute.', 'Add chopped tomato and cook down 5 minutes.', 'Add chickpeas and coconut milk; simmer 15 minutes. Stir in the greens.'],
  }),
  R({
    id: 'butter-chicken', family: 'curry', name: 'Easy butter chicken', blurb: 'Creamy tomato curry.', cuisine: 'indian', meals: LD,
    serves: 4, minutes: 40, equipment: ['stove'], tags: ['comfort', 'kid_friendly', 'batch'], labels: ['high_protein'], rice: true, keeps: 3,
    ing: 'chicken_thigh 800, yogurt 150, butter 50, tomato_sauce 400, onion 120, garlic 20, ginger 15, curry_powder 15, evap_milk 150, salt 6',
    steps: ['Marinate chicken in yogurt and half the curry powder.', 'Brown it in butter; set aside.', 'Cook onion, garlic and ginger, add the rest of the spice and tomato sauce; simmer 10 minutes.', 'Add the chicken and evaporated milk; simmer 10 minutes.'],
  }),
  R({
    id: 'overnight-oats', name: 'Overnight oats with banana', blurb: 'Make five jars on Sunday.', cuisine: 'american', meals: ['breakfast'],
    serves: 2, minutes: 5, equipment: [], tags: ['quick', 'no_cook', 'batch', 'healthy', 'budget'], labels: ['glp1'], keeps: 4,
    ing: 'oats 100, milk 300, banana 200, honey 20, peanut_butter 30',
    steps: ['Mix oats and milk in jars with honey.', 'Refrigerate overnight; top with sliced banana and peanut butter.'],
  }),
  R({
    id: 'egg-muffins', name: 'Vegetable egg muffins', blurb: 'Grab-and-go protein for the week.', cuisine: 'american', meals: ['breakfast', 'snack'],
    serves: 4, minutes: 30, equipment: ['oven|air_fryer'], tags: ['batch', 'healthy', 'kid_friendly'], labels: ['high_protein', 'low_carb', 'glp1'], keeps: 4,
    ing: 'egg 8, bell_pepper 100, spring_onion 20, tomato 100, cheese 60, salt 3, pepper 1, oil 10',
    steps: ['Whisk eggs with salt and pepper; fold in chopped vegetables and cheese.', 'Pour into an oiled muffin tray.', 'Bake at 180°C for 20 minutes (air fryer: 160°C, 12 minutes).'],
  }),
  R({
    id: 'pb-banana-toast', name: 'Peanut butter banana toast', blurb: 'Two minutes, no stove.', cuisine: 'american', meals: ['breakfast', 'snack'],
    serves: 2, minutes: 5, equipment: [], tags: ['quick', 'no_cook', 'kid_friendly', 'budget'], keeps: 0,
    ing: 'bread 120, peanut_butter 40, banana 200',
    steps: ['Toast the bread.', 'Spread peanut butter and top with sliced banana.'],
  }),
  R({
    id: 'mango-yogurt', name: 'Mango yogurt bowl', blurb: 'Fresh mango, yogurt and oats.', cuisine: 'american', meals: ['breakfast', 'snack'],
    serves: 2, minutes: 5, equipment: [], tags: ['quick', 'no_cook', 'healthy'], labels: ['glp1', 'high_protein'], keeps: 0,
    ing: 'yogurt 300, mango 300, oats 40, honey 15',
    steps: ['Spoon yogurt into bowls.', 'Top with cubed mango, oats and a drizzle of honey.'],
  }),

  // ── Sides ───────────────────────────────────────────────────────────────
  R({
    id: 'ensaladang-kamatis', name: 'Ensaladang kamatis', blurb: 'Tomato and onion salad.', cuisine: 'filipino', meals: LD, side: true,
    serves: 4, minutes: 5, equipment: [], tags: ['quick', 'no_cook', 'healthy', 'budget'], keeps: 1,
    ing: 'tomato 300, onion 80, calamansi 30, patis 10',
    steps: ['Dice tomato and onion.', 'Toss with calamansi juice and a little fish sauce.'],
  }),
  R({
    id: 'ginisang-kangkong', name: 'Garlic kangkong', blurb: 'Water spinach with lots of garlic.', cuisine: 'filipino', meals: LD, side: true,
    serves: 4, minutes: 10, equipment: ['stove'], tags: ['quick', 'healthy', 'budget'], keeps: 1,
    ing: 'kangkong 400, garlic 20, oyster_sauce 20, oil 15',
    steps: ['Fry plenty of garlic in oil until golden.', 'Add kangkong and oyster sauce; toss 1–2 minutes.'],
  }),
  R({
    id: 'atchara-cucumber', name: 'Quick cucumber atchara', blurb: 'Sweet-sour pickled cucumber and carrot.', cuisine: 'filipino', meals: LD, side: true,
    serves: 4, minutes: 10, equipment: [], tags: ['quick', 'no_cook', 'budget'], keeps: 5,
    ing: 'cucumber 300, carrot 80, vinegar 100, sugar 40, salt 3',
    steps: ['Thinly slice cucumber and carrot.', 'Cover with vinegar, sugar and salt; chill 30 minutes.'],
  }),
  R({
    id: 'stir-fried-broccoli', name: 'Garlic broccoli', blurb: 'Bright green and crunchy.', cuisine: 'asian', meals: LD, side: true,
    serves: 3, minutes: 10, equipment: ['stove'], tags: ['quick', 'healthy'], keeps: 2,
    ing: 'broccoli 400, garlic 15, oyster_sauce 20, oil 15',
    steps: ['Blanch broccoli 1 minute.', 'Stir-fry with garlic and oyster sauce.'],
  }),
  R({
    id: 'cucumber-salad', name: 'Sesame cucumber salad', blurb: 'Cool and crunchy.', cuisine: 'asian', meals: LD, side: true,
    serves: 3, minutes: 5, equipment: [], tags: ['quick', 'no_cook', 'healthy'], keeps: 1,
    ing: 'cucumber 300, vinegar 30, soy_sauce 15, sugar 5, sesame_oil 5',
    steps: ['Smash and slice the cucumber.', 'Toss with vinegar, soy sauce, sugar and sesame oil.'],
  }),

  // Made from leftovers ---------------------------------------------------------
  R({
    id: 'sinangag-itlog', name: 'Sinangag at itlog', blurb: "Garlic fried rice from last night's rice, with fried eggs.", cuisine: 'filipino', meals: ['breakfast'],
    serves: 4, minutes: 15, equipment: ['stove'], tags: ['quick', 'budget', 'one_pan', 'kid_friendly'], keeps: 0,
    leftover: { from: 'rice', share: 1 },
    ing: 'rice 320 left, garlic 25, oil 25, egg 4, salt 2',
    steps: ['Break up the cold rice with your hands.', 'Fry the garlic in oil until golden; take half out for topping.', 'Add the rice and salt; stir-fry 5 minutes until hot and a little toasted.', 'Fry the eggs sunny side up and serve on the rice with the garlic.'],
  }),
  R({
    id: 'adobo-flakes', name: 'Adobo flakes', blurb: 'Yesterday\'s adobo shredded and fried crisp.', cuisine: 'filipino', meals: ['breakfast', 'lunch'],
    serves: 4, minutes: 20, equipment: ['stove'], tags: ['quick', 'budget', 'kid_friendly'], labels: ['high_protein'], rice: true, keeps: 3,
    leftover: { from: ['chicken-adobo', 'pork-adobo'], share: 0.6 },
    ing: 'chicken_thigh 500 left, soy_sauce 40 left, vinegar 40 left, garlic 20, oil 30, egg 4',
    steps: ['Take the meat off the bones and shred it with two forks.', 'Fry the garlic in oil, add the meat and fry until crisp at the edges, 10 minutes.', 'Splash in a little of the adobo sauce and let it dry out again.', 'Serve with rice and fried eggs.'],
  }),
  R({
    id: 'paksiw-na-lechon', name: 'Paksiw na lechon', blurb: 'Leftover lechon kawali simmered sweet and sour.', cuisine: 'filipino', meals: LD,
    serves: 4, minutes: 30, equipment: ['stove'], tags: ['comfort', 'one_pan'], rice: true, keeps: 4,
    leftover: { from: ['lechon-kawali'], share: 0.8 },
    ing: 'pork_liempo 600 left, vinegar 80, soy_sauce 40, liver_spread 85, brown_sugar 40, garlic 20, onion 60, bay_leaf 2, peppercorn 2',
    steps: ['Cut the leftover lechon into bite-size pieces.', 'Simmer vinegar, soy sauce, 1 cup water, garlic, onion, bay leaves and peppercorns 5 minutes without stirring.', 'Add the lechon, liver spread and sugar; simmer 15 minutes until the sauce thickens.'],
  }),
  R({
    id: 'sarciadong-isda', name: 'Sarciadong isda', blurb: 'Leftover fried fish in tomato and egg sauce.', cuisine: 'filipino', meals: LD,
    serves: 4, minutes: 20, equipment: ['stove'], tags: ['quick', 'budget', 'one_pan'], labels: ['high_protein'], rice: true, keeps: 1,
    leftover: { from: ['fried-tilapia'], share: 0.8 },
    ing: 'tilapia 600 left, oil 15, tomato 300, onion 80, garlic 15, egg 2, patis 15',
    steps: ['Sauté garlic, onion and tomatoes until the tomatoes break down.', 'Add 1 cup water and the patis; simmer 3 minutes.', 'Add the fried fish and heat through.', 'Pour in beaten eggs and stir gently until just set.'],
  }),
];

export const RECIPE: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

/** Soups and sabaw, for rainy days. */
export const SABAW = new Set(['sinigang-baboy', 'sinigang-hipon', 'tinola', 'nilagang-baka', 'arroz-caldo', 'champorado', 'sardinas-misua', 'ginataang-mais', 'ramen-upgrade', 'lentil-soup', 'ginisang-monggo', 'monggo-vegan']);

/** Handaan dishes: holidays, Noche Buena, Media Noche. */
export const FESTIVE = new Set(['lumpiang-shanghai', 'pancit-bihon', 'pinoy-spaghetti', 'lechon-kawali', 'beef-caldereta', 'pork-menudo', 'chicken-curry-ph', 'inihaw-liempo', 'chicken-inasal']);

/** Allergy, diet and dislike groups a recipe contains, from its ingredients. */
export function groupsOf(r: Recipe): Set<Group> {
  const out = new Set<Group>();
  for (const l of r.ingredients) for (const g of INGREDIENT[l.id]?.groups ?? []) out.add(g);
  return out;
}

const MEATS: Group[] = ['pork', 'beef', 'chicken', 'liver'];
const SEA: Group[] = ['fish', 'shellfish'];

/** Whether a recipe fits a diet restriction. */
export function fitsDiet(r: Recipe, d: Diet): boolean {
  const g = groupsOf(r);
  const has = (xs: Group[]) => xs.some((x) => g.has(x));
  switch (d) {
    case 'vegan':
      return !has([...MEATS, ...SEA, 'egg', 'dairy', 'honey']);
    case 'vegetarian':
      return !has([...MEATS, ...SEA]);
    case 'pescatarian':
      return !has(MEATS);
    case 'no_pork':
      return !g.has('pork');
    case 'no_beef':
      return !g.has('beef');
    case 'high_protein':
    case 'low_carb':
    case 'glp1':
      return (r.labels ?? []).includes(d);
  }
}

/** Whether `have` (a set of equipment) can cook this. */
export function canCook(r: Recipe, have: Set<string>): boolean {
  return r.equipment.every((need) => need.split('|').some((e) => have.has(e)));
}
