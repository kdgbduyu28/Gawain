/**
 * Every ingredient a recipe can use, how it's bought, and where its price comes from.
 *
 * Amounts are in a base unit: grams, millilitres or pieces. Prices come from Presyo's
 * government data when there is a matching item (see prices.ts), else from `est`, a
 * rough 2026 Metro Manila price for one pack.
 */

export type Unit = 'g' | 'ml' | 'pc';

/** Things a person can be allergic to, avoid, or dislike. Recipes inherit these from their ingredients. */
export type Group =
  | 'pork'
  | 'beef'
  | 'chicken'
  | 'fish'
  | 'shellfish'
  | 'egg'
  | 'dairy'
  | 'soy'
  | 'peanut'
  | 'tree_nut'
  | 'gluten'
  | 'sesame'
  | 'tofu'
  | 'mushroom'
  | 'eggplant'
  | 'ampalaya'
  | 'coconut'
  | 'spicy'
  | 'cilantro'
  | 'olive'
  | 'kale'
  | 'liver'
  | 'beans'
  | 'honey';

export type Source =
  /** PSA monthly retail price by region (Presyo psa/<region>.json), item name as PSA writes it. */
  | { psa: string; f?: number }
  /** DA daily Metro Manila price (Presyo da/index-*.json), item name and optional spec match. */
  | { da: string; spec?: string; f?: number }
  /** DTI suggested retail price (Presyo grocery/srp.json), section name and optional product match. */
  | { srp: string; item?: string; f?: number };

export type Ingredient = {
  id: string;
  name: string;
  /** Gawain grocery aisle. */
  aisle: string;
  unit: Unit;
  /** How it's sold: e.g. 1000 g as "kg", 1 pack of 250 g. Used to word the shopping list. */
  pack: number;
  packLabel: string;
  /** Rough price of one pack, used when Presyo has nothing for it. */
  est: number;
  groups?: Group[];
  /** Salt, oil, soy sauce...: most kitchens have them, so they're listed separately and only a share is costed. */
  staple?: boolean;
  /** Presyo items in order of preference. */
  src?: Source[];
  /** Other names people type in "what's in your kitchen" (lowercase). */
  aka?: string[];
  /** Days it keeps in the fridge or cupboard once bought (see LIFE). */
  life: number;
  /** Sold loose at the palengke (eggs by the piece, onions by the kilo), so no need to buy a whole pack. */
  loose?: boolean;
  /** Item name in DA's per-market Metro Manila prices (Presyo da/latest.json), for comparing markets. */
  market?: string;
};

const I = (
  id: string,
  name: string,
  aisle: string,
  unit: Unit,
  pack: number,
  packLabel: string,
  est: number,
  extra: Partial<Pick<Ingredient, 'groups' | 'staple' | 'src' | 'aka' | 'life'>> = {},
): Ingredient => ({ id, name, aisle, unit, pack, packLabel, est, life: LIFE[id] ?? DEFAULT_LIFE[aisle] ?? 30, loose: LOOSE.has(id) || undefined, market: MARKET[id], ...extra });

const MEAT = 'Meat & fish';

/** How many days things keep once bought, fridge where it applies. Rough home-kitchen numbers. */
const DEFAULT_LIFE: Record<string, number> = {
  'Meat & fish': 3,
  Produce: 7,
  'Dairy & eggs': 10,
  'Rice & grains': 180,
  Pantry: 365,
  Condiments: 365,
};
const LIFE: Record<string, number> = {
  bangus: 2, tilapia: 2, galunggong: 2, salmon_belly: 2, shrimp: 2, squid: 2, tahong: 1, chicken_liver: 2,
  kangkong: 3, pechay: 4, malunggay: 2, spring_onion: 5, cilantro: 4, lettuce: 4, kale: 5, sitaw: 4, baguio_beans: 5, okra: 4,
  tomato: 6, eggplant: 5, ampalaya: 5, cucumber: 6, broccoli: 5, mushroom: 4, bell_pepper: 7, chili_green: 7, chili_red: 10,
  cabbage: 12, carrot: 18, potato: 25, onion: 30, garlic: 60, ginger: 21, squash: 14, sayote: 12, upo: 7, labanos: 10, gabi: 14, camote: 14,
  calamansi: 14, banana: 4, banana_saba: 5, mango: 4, papaya: 5, avocado: 4, corn: 3,
  egg: 21, milk: 7, tofu: 4, cheese: 21, yogurt: 10, butter: 30, coconut_milk: 2,
  pandesal: 2, bread: 5, tortilla: 10, lumpia_wrapper: 30, longganisa: 7,
};
const LOOSE = new Set(['egg', 'onion', 'garlic', 'tomato', 'calamansi', 'potato', 'carrot', 'ginger', 'banana', 'banana_saba', 'mango']);
/** Our ingredient → DA's per-market item. */
const MARKET: Record<string, string> = {
  pork_liempo: 'Pork Liempo', pork_kasim: 'Pork (Kasim)', chicken_whole: 'Whole Chicken', egg: 'Egg (Medium)',
  rice: 'Well-milled Rice', bangus: 'Bangus', galunggong: 'Galunggong', tilapia: 'Tilapia', ampalaya: 'Ampalaya',
  cabbage: 'Cabbage', carrot: 'Carrots', sayote: 'Chayote', chili_green: 'Chili (Green)', eggplant: 'Eggplant',
  pechay: 'Pechay Baguio', chili_red: 'Red Chili', onion: 'Red Onion', tomato: 'Tomato', potato: 'White Potato',
  calamansi: 'Calamansi', sugar: 'Sugar (Refined)',
};
const VEG = 'Produce';
const DAIRY = 'Dairy & eggs';
const GRAIN = 'Rice & grains';
const PANTRY = 'Pantry';
const COND = 'Condiments';

export const INGREDIENTS: Ingredient[] = [
  // Pork
  I('pork_liempo', 'Pork liempo', MEAT, 'g', 1000, 'kg', 360, { groups: ['pork'], src: [{ da: 'Pork Belly (Liempo)' }, { psa: 'Pork, Liempo' }], aka: ['liempo', 'pork belly'] }),
  I('pork_kasim', 'Pork kasim', MEAT, 'g', 1000, 'kg', 330, { groups: ['pork'], src: [{ psa: 'Pork, Kasim' }, { da: 'Pork Boston Shoulder' }], aka: ['kasim', 'pork shoulder', 'pork'] }),
  I('pork_ground', 'Ground pork', MEAT, 'g', 1000, 'kg', 320, { groups: ['pork'], src: [{ psa: 'Pork, Kasim', f: 0.95 }], aka: ['giniling', 'ground pork'] }),
  I('pork_chop', 'Pork chop', MEAT, 'g', 1000, 'kg', 300, { groups: ['pork'], src: [{ da: 'Pork Chop' }, { psa: 'Pork, Meat with Bones' }], aka: ['pork chop'] }),
  I('longganisa', 'Longganisa', MEAT, 'g', 500, '500 g pack', 180, { groups: ['pork'], aka: ['longganisa', 'sausage'] }),
  I('luncheon_meat', 'Luncheon meat', PANTRY, 'g', 165, '165 g can', 41, { groups: ['pork'], src: [{ srp: 'Luncheon Meat' }], aka: ['spam', 'luncheon meat'] }),

  // Beef
  I('beef_cubes', 'Beef (stewing cubes)', MEAT, 'g', 1000, 'kg', 480, { groups: ['beef'], src: [{ psa: 'Beef, Meat with Bones' }, { da: 'Beef Brisket' }], aka: ['beef', 'beef brisket'] }),
  I('beef_lean', 'Beef sirloin', MEAT, 'g', 1000, 'kg', 560, { groups: ['beef'], src: [{ psa: 'Beef, Pure Meat' }, { da: 'Beef Sirloin' }], aka: ['sirloin', 'beef steak'] }),
  I('beef_ground', 'Ground beef', MEAT, 'g', 1000, 'kg', 470, { groups: ['beef'], src: [{ psa: 'Beef, Pure Meat', f: 0.85 }], aka: ['ground beef'] }),
  I('corned_beef', 'Corned beef', PANTRY, 'g', 150, '150 g can', 34, { groups: ['beef'], src: [{ srp: 'Corned Beef' }], aka: ['corned beef'] }),

  // Chicken
  I('chicken_whole', 'Whole chicken, cut up', MEAT, 'g', 1000, 'kg', 215, { groups: ['chicken'], src: [{ da: 'Whole Chicken' }, { psa: 'Chicken, Fully Dressed, Broiler' }], aka: ['chicken', 'whole chicken'] }),
  I('chicken_thigh', 'Chicken thighs', MEAT, 'g', 1000, 'kg', 230, { groups: ['chicken'], src: [{ da: 'Chicken Thigh' }, { psa: 'Chicken, Fully Dressed, Broiler', f: 1.1 }], aka: ['chicken thigh', 'thighs'] }),
  I('chicken_breast', 'Chicken breast', MEAT, 'g', 1000, 'kg', 225, { groups: ['chicken'], src: [{ da: 'Chicken Breast' }, { psa: 'Chicken, Breast' }], aka: ['chicken breast'] }),
  I('chicken_drumstick', 'Chicken drumsticks', MEAT, 'g', 1000, 'kg', 225, { groups: ['chicken'], src: [{ da: 'Chicken Drumstick' }, { psa: 'Chicken, Fully Dressed, Broiler', f: 1.05 }], aka: ['drumstick', 'chicken legs'] }),
  I('chicken_wings', 'Chicken wings', MEAT, 'g', 1000, 'kg', 230, { groups: ['chicken'], src: [{ da: 'Chicken Wing' }, { psa: 'Chicken, Fully Dressed, Broiler', f: 1.1 }], aka: ['wings'] }),
  I('chicken_liver', 'Chicken liver', MEAT, 'g', 1000, 'kg', 230, { groups: ['chicken', 'liver'], src: [{ psa: 'Edible Offal, Liver, Chicken, Fresh' }, { da: 'Chicken Liver' }] }),

  // Fish and seafood
  I('bangus', 'Bangus (milkfish)', MEAT, 'g', 1000, 'kg', 250, { groups: ['fish'], src: [{ psa: 'Fish, Milkfish, Bangus, Medium' }, { da: 'Bangus, Medium' }], aka: ['bangus', 'milkfish'] }),
  I('tilapia', 'Tilapia', MEAT, 'g', 1000, 'kg', 160, { groups: ['fish'], src: [{ psa: 'Fish, Tilapia, Medium' }, { da: 'Tilapia' }], aka: ['tilapia'] }),
  I('galunggong', 'Galunggong', MEAT, 'g', 1000, 'kg', 290, { groups: ['fish'], src: [{ psa: 'Fish, Round Scad, Galunggong, Medium' }, { da: 'Galunggong' }], aka: ['galunggong', 'gg'] }),
  I('salmon_belly', 'Salmon belly', MEAT, 'g', 1000, 'kg', 430, { groups: ['fish'], src: [{ da: 'Salmon Belly' }], aka: ['salmon'] }),
  I('shrimp', 'Shrimp', MEAT, 'g', 1000, 'kg', 500, { groups: ['shellfish'], src: [{ psa: 'Shrimp, Suaje, Medium' }], aka: ['shrimp', 'hipon'] }),
  I('squid', 'Squid', MEAT, 'g', 1000, 'kg', 450, { groups: ['shellfish'], src: [{ psa: 'Squid, Medium' }, { da: 'Squid' }], aka: ['squid', 'pusit'] }),
  I('tahong', 'Tahong (mussels)', MEAT, 'g', 1000, 'kg', 125, { groups: ['shellfish'], src: [{ psa: 'Shells, Tahong' }], aka: ['mussels', 'tahong'] }),
  I('sardines', 'Canned sardines', PANTRY, 'g', 155, '155 g can', 22, { groups: ['fish'], src: [{ srp: 'Canned Sardines In Tomato Sauce' }], aka: ['sardines', 'sardinas'] }),
  I('tuna_can', 'Canned tuna', PANTRY, 'g', 155, '155 g can', 38, { groups: ['fish'], aka: ['tuna', 'canned tuna'] }),

  // Eggs, dairy, tofu, legumes
  I('egg', 'Eggs', DAIRY, 'pc', 30, 'tray of 30', 255, { groups: ['egg'], src: [{ da: 'Chicken Egg (White, Medium)' }, { psa: 'Egg, Chicken, Medium' }], aka: ['egg', 'eggs', 'itlog'] }),
  I('milk', 'Fresh milk', DAIRY, 'ml', 1000, '1 L carton', 105, { groups: ['dairy'], aka: ['milk', 'fresh milk'] }),
  I('evap_milk', 'Evaporated milk', DAIRY, 'ml', 370, '370 ml can', 48, { groups: ['dairy'], src: [{ srp: 'Evaporated Milk' }], aka: ['evaporada', 'evaporated milk'] }),
  I('cheese', 'Cheese', DAIRY, 'g', 165, '165 g block', 75, { groups: ['dairy'], aka: ['cheese', 'eden'] }),
  I('butter', 'Butter', DAIRY, 'g', 225, '225 g bar', 135, { groups: ['dairy'], aka: ['butter'] }),
  I('yogurt', 'Plain yogurt', DAIRY, 'g', 500, '500 g tub', 140, { groups: ['dairy'], aka: ['yogurt'] }),
  I('tofu', 'Firm tofu', DAIRY, 'g', 250, '250 g block', 38, { groups: ['soy', 'tofu'], aka: ['tofu', 'tokwa'] }),
  I('monggo', 'Mung beans (monggo)', PANTRY, 'g', 500, '500 g', 76, { groups: ['beans'], src: [{ psa: 'Monggo, Green' }, { da: 'Mungbean' }], aka: ['monggo', 'mung beans'] }),
  I('black_beans', 'Black beans (canned)', PANTRY, 'g', 400, '400 g can', 85, { groups: ['beans'], aka: ['black beans', 'beans'] }),
  I('chickpeas', 'Chickpeas (canned)', PANTRY, 'g', 400, '400 g can', 95, { groups: ['beans'], aka: ['chickpeas', 'garbanzos'] }),
  I('lentils', 'Lentils', PANTRY, 'g', 500, '500 g pack', 130, { groups: ['beans'], aka: ['lentils'] }),
  I('peanuts', 'Peanuts', PANTRY, 'g', 250, '250 g', 35, { groups: ['peanut'], src: [{ psa: 'Raw Peanut, Shelled' }], aka: ['peanuts', 'mani'] }),
  I('peanut_butter', 'Peanut butter', PANTRY, 'g', 340, '340 g jar', 110, { groups: ['peanut'], aka: ['peanut butter'] }),

  // Vegetables
  I('tomato', 'Tomatoes', VEG, 'g', 1000, 'kg', 105, { src: [{ da: 'Tomato' }, { psa: 'Tomato' }], aka: ['tomato', 'tomatoes', 'kamatis'] }),
  I('onion', 'Red onions', VEG, 'g', 1000, 'kg', 125, { src: [{ da: 'Red Onion' }, { psa: 'Onion Red Creole (bermuda Red)' }], aka: ['onion', 'onions', 'sibuyas'] }),
  I('garlic', 'Garlic', VEG, 'g', 1000, 'kg', 160, { src: [{ da: 'Garlic' }, { psa: 'Garlic, Imported' }], aka: ['garlic', 'bawang'] }),
  I('ginger', 'Ginger', VEG, 'g', 1000, 'kg', 170, { src: [{ psa: 'Ginger, Loose' }, { da: 'Ginger' }], aka: ['ginger', 'luya'] }),
  I('cabbage', 'Cabbage', VEG, 'g', 1000, 'kg', 145, { src: [{ da: 'Cabbage (Wonder Ball)' }, { psa: 'Cabbage' }], aka: ['cabbage', 'repolyo'] }),
  I('carrot', 'Carrots', VEG, 'g', 1000, 'kg', 120, { src: [{ da: 'Carrots' }, { psa: 'Carrot' }], aka: ['carrot', 'carrots'] }),
  I('potato', 'Potatoes', VEG, 'g', 1000, 'kg', 150, { src: [{ da: 'White Potato' }, { psa: 'Potato' }], aka: ['potato', 'potatoes', 'patatas'] }),
  I('ampalaya', 'Ampalaya', VEG, 'g', 1000, 'kg', 150, { groups: ['ampalaya'], src: [{ da: 'Ampalaya' }, { psa: 'Bitter Gourd (ampalaya), Fruit' }], aka: ['ampalaya', 'bitter gourd'] }),
  I('pechay', 'Pechay', VEG, 'g', 1000, 'kg', 120, { src: [{ da: 'Native Pechay' }, { psa: 'Pechay, Native' }], aka: ['pechay', 'bok choy'] }),
  I('kangkong', 'Kangkong', VEG, 'g', 1000, 'kg', 95, { src: [{ psa: 'Kangkong' }], aka: ['kangkong', 'water spinach'] }),
  I('sitaw', 'Sitaw (string beans)', VEG, 'g', 1000, 'kg', 130, { src: [{ da: 'Pole Sitao' }], aka: ['sitaw', 'string beans'] }),
  I('baguio_beans', 'Baguio beans', VEG, 'g', 1000, 'kg', 180, { src: [{ psa: 'Baguio Beans' }, { da: 'Habichuelas/Baguio Beans' }], aka: ['green beans', 'baguio beans'] }),
  I('eggplant', 'Eggplant', VEG, 'g', 1000, 'kg', 120, { groups: ['eggplant'], src: [{ da: 'Eggplant' }, { psa: 'Eggplant, Long, Purple' }], aka: ['eggplant', 'talong'] }),
  I('squash', 'Squash (kalabasa)', VEG, 'g', 1000, 'kg', 62, { src: [{ da: 'Squash' }, { psa: 'Squash' }], aka: ['squash', 'kalabasa', 'pumpkin'] }),
  I('sayote', 'Sayote', VEG, 'g', 1000, 'kg', 70, { src: [{ da: 'Chayote' }, { psa: 'Chayote' }], aka: ['sayote', 'chayote'] }),
  I('upo', 'Upo', VEG, 'g', 1000, 'kg', 66, { src: [{ psa: 'Common Gourd (upo)' }], aka: ['upo', 'bottle gourd'] }),
  I('okra', 'Okra', VEG, 'g', 1000, 'kg', 120, { aka: ['okra'] }),
  I('labanos', 'Labanos (radish)', VEG, 'g', 1000, 'kg', 200, { src: [{ psa: 'Raddish (labanos)' }], aka: ['radish', 'labanos'] }),
  I('gabi', 'Gabi (taro)', VEG, 'g', 1000, 'kg', 115, { src: [{ psa: 'Gabi Tubers, Tagalog' }], aka: ['gabi', 'taro'] }),
  I('malunggay', 'Malunggay leaves', VEG, 'g', 50, 'bundle', 15, { aka: ['malunggay', 'moringa'] }),
  I('spring_onion', 'Spring onions', VEG, 'g', 50, 'bundle', 15, { aka: ['spring onion', 'scallion', 'dahon ng sibuyas'] }),
  I('cilantro', 'Cilantro (wansoy)', VEG, 'g', 30, 'bundle', 20, { groups: ['cilantro'], aka: ['cilantro', 'wansoy', 'coriander'] }),
  I('bell_pepper', 'Bell peppers', VEG, 'g', 1000, 'kg', 290, { src: [{ da: 'Bell Pepper (Red)' }, { da: 'Bell Pepper (Green)' }], aka: ['bell pepper', 'capsicum'] }),
  I('chili_green', 'Green chilies (siling haba)', VEG, 'g', 1000, 'kg', 190, { groups: ['spicy'], src: [{ da: 'Chilli (Green)' }], aka: ['siling haba', 'green chili'] }),
  I('chili_red', 'Red chilies (labuyo)', VEG, 'g', 1000, 'kg', 330, { groups: ['spicy'], src: [{ da: 'Chilli (Red)' }], aka: ['labuyo', 'chili', 'sili'] }),
  I('lettuce', 'Lettuce', VEG, 'g', 1000, 'kg', 190, { src: [{ da: 'Lettuce (Romaine)' }, { da: 'Lettuce (Green Ice)' }], aka: ['lettuce'] }),
  I('cucumber', 'Cucumber', VEG, 'g', 1000, 'kg', 130, { src: [{ psa: 'Cucumber (pipino)' }], aka: ['cucumber', 'pipino'] }),
  I('broccoli', 'Broccoli', VEG, 'g', 1000, 'kg', 280, { src: [{ da: 'Broccoli' }], aka: ['broccoli'] }),
  I('corn', 'Sweet corn', VEG, 'pc', 1, 'cob', 30, { src: [{ psa: 'Whole Corn On The Cob, Yellow', f: 0.35 }], aka: ['corn', 'mais'] }),
  I('camote', 'Camote (sweet potato)', VEG, 'g', 1000, 'kg', 100, { src: [{ psa: 'Sweet Potato (camote)' }], aka: ['camote', 'sweet potato'] }),
  I('mushroom', 'Mushrooms', VEG, 'g', 200, '200 g pack', 70, { groups: ['mushroom'], aka: ['mushroom', 'mushrooms'] }),
  I('kale', 'Kale', VEG, 'g', 200, '200 g pack', 90, { groups: ['kale'], aka: ['kale'] }),
  I('calamansi', 'Calamansi', VEG, 'g', 1000, 'kg', 95, { src: [{ da: 'Calamansi' }, { psa: 'Calamansi, Loose' }], aka: ['calamansi', 'kalamansi'] }),
  I('banana_saba', 'Saba bananas', VEG, 'g', 1000, 'kg', 67, { src: [{ da: 'Banana (Saba)' }], aka: ['saba', 'saba banana'] }),
  I('banana', 'Bananas (lakatan)', VEG, 'g', 1000, 'kg', 98, { src: [{ da: 'Banana (Lakatan)' }, { psa: 'Banana, Lakatan, Medium' }], aka: ['banana', 'bananas', 'saging'] }),
  I('mango', 'Ripe mango', VEG, 'g', 1000, 'kg', 240, { src: [{ da: 'Mango (Carabao)' }, { psa: 'Mango, Kalabaw, Ripe, Medium' }], aka: ['mango', 'mangga'] }),
  I('papaya', 'Green papaya', VEG, 'g', 1000, 'kg', 80, { src: [{ da: 'Papaya' }], aka: ['papaya'] }),
  I('avocado', 'Avocado', VEG, 'g', 1000, 'kg', 300, { src: [{ psa: 'Avocado' }, { da: 'Avocado' }], aka: ['avocado'] }),
  I('coconut_milk', 'Coconut milk (gata)', PANTRY, 'ml', 400, 'from 1 coconut', 45, { groups: ['coconut'], src: [{ psa: 'Matured Coconut, Medium', f: 1 / 400 }], aka: ['gata', 'coconut milk', 'coconut cream'] }),

  // Rice, noodles, bread
  I('rice', 'Rice', GRAIN, 'g', 1000, 'kg', 50, { src: [{ da: 'Well Milled Rice' }, { psa: 'Rice, Well-milled' }], aka: ['rice', 'bigas'] }),
  I('pasta', 'Spaghetti pasta', GRAIN, 'g', 500, '500 g pack', 70, { groups: ['gluten'], aka: ['spaghetti', 'pasta'] }),
  I('bihon', 'Bihon (rice noodles)', GRAIN, 'g', 250, '250 g pack', 45, { aka: ['bihon', 'rice noodles'] }),
  I('canton', 'Pancit canton noodles', GRAIN, 'g', 250, '250 g pack', 55, { groups: ['gluten', 'egg'], aka: ['canton', 'egg noodles'] }),
  I('misua', 'Misua', GRAIN, 'g', 100, '100 g pack', 22, { groups: ['gluten'], aka: ['misua', 'miswa'] }),
  I('instant_noodles', 'Instant mami noodles', GRAIN, 'g', 55, '55 g pack', 9, { groups: ['gluten'], src: [{ srp: 'Instant Mami Noodles Chicken & Beef Flavor' }], aka: ['instant noodles', 'mami', 'lucky me'] }),
  I('pandesal', 'Pandesal', GRAIN, 'pc', 10, 'pack of 10', 28, { groups: ['gluten'], aka: ['pandesal', 'bread rolls'] }),
  I('bread', 'Sliced bread', GRAIN, 'g', 450, '450 g loaf', 44, { groups: ['gluten'], src: [{ srp: 'Bread', item: 'Tasty' }], aka: ['bread', 'tasty', 'loaf'] }),
  I('tortilla', 'Flour tortillas', GRAIN, 'pc', 8, 'pack of 8', 120, { groups: ['gluten'], aka: ['tortilla', 'tortillas', 'wraps'] }),
  I('oats', 'Rolled oats', GRAIN, 'g', 400, '400 g pack', 95, { groups: ['gluten'], aka: ['oats', 'oatmeal'] }),
  I('flour', 'Flour', PANTRY, 'g', 1000, 'kg', 60, { groups: ['gluten'], staple: true, aka: ['flour', 'harina'] }),
  I('glutinous_rice', 'Glutinous rice (malagkit)', GRAIN, 'g', 1000, 'kg', 75, { src: [{ da: 'Glutinous Rice' }], aka: ['malagkit', 'glutinous rice'] }),
  I('lumpia_wrapper', 'Lumpia wrappers', GRAIN, 'pc', 25, 'pack of 25', 45, { groups: ['gluten'], aka: ['lumpia wrapper', 'spring roll wrapper'] }),

  // Sauces and pantry
  I('oil', 'Cooking oil', COND, 'ml', 1000, '1 L bottle', 102, { staple: true, src: [{ da: 'Cooking Oil (Palm)', spec: '1 Liter' }], aka: ['oil', 'cooking oil', 'mantika'] }),
  I('olive_oil', 'Olive oil', COND, 'ml', 500, '500 ml bottle', 320, { staple: true, aka: ['olive oil'] }),
  I('soy_sauce', 'Soy sauce', COND, 'ml', 350, '350 ml bottle', 22, { staple: true, groups: ['soy', 'gluten'], src: [{ srp: 'Soy Sauce – Gin / Pet Bottle' }], aka: ['soy sauce', 'toyo'] }),
  I('vinegar', 'Vinegar', COND, 'ml', 350, '350 ml bottle', 19, { staple: true, src: [{ srp: 'Vinegar – Gin And Pet Bottle' }], aka: ['vinegar', 'suka'] }),
  I('patis', 'Fish sauce (patis)', COND, 'ml', 350, '350 ml bottle', 28, { staple: true, groups: ['fish'], src: [{ srp: 'Patis – Gin / Pet Bottle' }], aka: ['patis', 'fish sauce'] }),
  I('oyster_sauce', 'Oyster sauce', COND, 'ml', 150, '150 ml bottle', 45, { groups: ['shellfish'], aka: ['oyster sauce'] }),
  I('bagoong', 'Bagoong alamang', COND, 'g', 250, '250 g jar', 65, { groups: ['shellfish'], aka: ['bagoong', 'shrimp paste'] }),
  I('salt', 'Salt', COND, 'g', 250, '250 g', 12, { staple: true, src: [{ srp: 'Iodized Salt' }], aka: ['salt', 'asin'] }),
  I('sugar', 'Sugar', COND, 'g', 1000, 'kg', 82, { staple: true, src: [{ da: 'Sugar (Refined)' }], aka: ['sugar', 'asukal'] }),
  I('brown_sugar', 'Brown sugar', COND, 'g', 1000, 'kg', 73, { staple: true, src: [{ da: 'Sugar (Brown)' }], aka: ['brown sugar'] }),
  I('pepper', 'Ground black pepper', COND, 'g', 30, '30 g', 25, { staple: true, aka: ['pepper', 'paminta'] }),
  I('peppercorn', 'Whole peppercorns', COND, 'g', 30, '30 g', 25, { staple: true, aka: ['peppercorns'] }),
  I('bay_leaf', 'Bay leaves (laurel)', COND, 'pc', 20, 'pack', 15, { staple: true, aka: ['bay leaf', 'laurel'] }),
  I('cornstarch', 'Cornstarch', COND, 'g', 250, '250 g', 30, { staple: true, aka: ['cornstarch', 'gawgaw'] }),
  I('tomato_sauce', 'Tomato sauce', PANTRY, 'g', 250, '250 g pack', 25, { aka: ['tomato sauce'] }),
  I('spaghetti_sauce', 'Spaghetti sauce (sweet)', PANTRY, 'g', 500, '500 g pack', 65, { aka: ['spaghetti sauce'] }),
  I('liver_spread', 'Liver spread', PANTRY, 'g', 85, '85 g can', 35, { groups: ['liver'], aka: ['liver spread', 'reno'] }),
  I('sinigang_mix', 'Sinigang mix (sampalok)', PANTRY, 'g', 40, '40 g pack', 25, { aka: ['sinigang mix', 'sampalok'] }),
  I('curry_powder', 'Curry powder', COND, 'g', 25, '25 g pack', 25, { staple: true, aka: ['curry powder'] }),
  I('chili_powder', 'Chili powder', COND, 'g', 30, '30 g', 30, { staple: true, groups: ['spicy'], aka: ['chili powder'] }),
  I('cumin', 'Ground cumin', COND, 'g', 30, '30 g', 35, { staple: true, aka: ['cumin'] }),
  I('paprika', 'Paprika', COND, 'g', 30, '30 g', 35, { staple: true, aka: ['paprika'] }),
  I('sesame_oil', 'Sesame oil', COND, 'ml', 115, '115 ml bottle', 95, { staple: true, groups: ['sesame'], aka: ['sesame oil'] }),
  I('honey', 'Honey', COND, 'ml', 250, '250 ml bottle', 150, { groups: ['honey'], aka: ['honey'] }),
  I('mayonnaise', 'Mayonnaise', COND, 'ml', 220, '220 ml jar', 75, { groups: ['egg'], aka: ['mayo', 'mayonnaise'] }),
  I('ketchup', 'Banana ketchup', COND, 'g', 320, '320 g bottle', 38, { aka: ['ketchup', 'catsup'] }),
  I('olives', 'Olives', PANTRY, 'g', 200, '200 g jar', 160, { groups: ['olive'], aka: ['olives'] }),
  I('tablea', 'Tablea (cocoa tablets)', PANTRY, 'g', 200, '200 g pack', 90, { aka: ['tablea', 'cocoa'] }),
  I('salsa', 'Salsa', PANTRY, 'g', 300, '300 g jar', 120, { groups: ['spicy'], aka: ['salsa'] }),
  I('green_peas', 'Green peas (canned)', PANTRY, 'g', 155, '155 g can', 30, { aka: ['green peas', 'peas'] }),
  I('raisins', 'Raisins', PANTRY, 'g', 100, '100 g pack', 45, { aka: ['raisins', 'pasas'] }),
];

export const INGREDIENT: Record<string, Ingredient> = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));

/** Find ingredients by what someone types ("eggs", "kamatis"). */
export function matchIngredient(text: string): Ingredient | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  return (
    INGREDIENTS.find((i) => i.name.toLowerCase() === t || i.aka?.includes(t)) ??
    INGREDIENTS.find((i) => i.aka?.some((a) => a.includes(t) || t.includes(a))) ??
    null
  );
}
