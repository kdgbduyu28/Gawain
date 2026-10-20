import type { Group } from './ingredients';
import type { BudgetLevel } from './planner';
import type { Shop } from './prices';
import type { Cuisine, Diet, Equipment, Meal, Vibe } from './recipes';

/** Words and icons for every questionnaire option. */

export const SHOPS: { key: Shop; label: string; hint: string; icon: string }[] = [
  { key: 'palengke', label: 'Palengke', hint: 'Wet market prices', icon: 'basket-outline' },
  { key: 'supermarket', label: 'Supermarket', hint: 'About 12% more for fresh food', icon: 'cart-outline' },
  { key: 'mixed', label: 'Both', hint: 'Fresh at the palengke, packs at the grocery', icon: 'swap-horizontal-outline' },
];

export const MEALS: { key: Meal; label: string; icon: string }[] = [
  { key: 'breakfast', label: 'Breakfast', icon: 'cafe-outline' },
  { key: 'lunch', label: 'Lunch', icon: 'sunny-outline' },
  { key: 'dinner', label: 'Dinner', icon: 'moon-outline' },
  { key: 'snack', label: 'Merienda', icon: 'ice-cream-outline' },
];

export const EQUIPMENT: { key: Equipment; label: string; icon: string }[] = [
  { key: 'stove', label: 'Stove', icon: 'flame-outline' },
  { key: 'rice_cooker', label: 'Rice cooker', icon: 'restaurant-outline' },
  { key: 'air_fryer', label: 'Air fryer', icon: 'thunderstorm-outline' },
  { key: 'oven', label: 'Oven', icon: 'cube-outline' },
  { key: 'microwave', label: 'Microwave', icon: 'radio-outline' },
  { key: 'pressure_cooker', label: 'Pressure cooker', icon: 'timer-outline' },
  { key: 'slow_cooker', label: 'Slow cooker', icon: 'hourglass-outline' },
  { key: 'grill', label: 'Grill / ihawan', icon: 'bonfire-outline' },
];

export const RESTRICTIONS: { key: Diet; label: string }[] = [
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'pescatarian', label: 'Pescatarian' },
  { key: 'no_pork', label: 'No pork' },
  { key: 'no_beef', label: 'No beef' },
];

export const GOALS: { key: Diet; label: string; hint: string }[] = [
  { key: 'high_protein', label: 'High protein', hint: 'More dishes built around protein' },
  { key: 'low_carb', label: 'Low carb', hint: 'Fewer rice and noodle dishes' },
  { key: 'glp1', label: 'GLP-1 friendly', hint: 'Smaller portions, protein and vegetables first' },
];

export const CUISINES: { key: Cuisine; label: string }[] = [
  { key: 'filipino', label: 'Filipino' },
  { key: 'asian', label: 'Asian' },
  { key: 'mexican', label: 'Mexican' },
  { key: 'italian', label: 'Italian' },
  { key: 'mediterranean', label: 'Mediterranean' },
  { key: 'indian', label: 'Indian' },
  { key: 'american', label: 'American' },
];

export const VIBES: { key: Vibe; label: string; hint: string; icon: string }[] = [
  { key: 'quick', label: 'Quick and easy', hint: '25 minutes or less', icon: 'flash-outline' },
  { key: 'one_pan', label: 'One pan', hint: 'Fewer dishes to wash', icon: 'ellipse-outline' },
  { key: 'batch', label: 'Batch cook', hint: "Tonight's dinner is tomorrow's lunch", icon: 'layers-outline' },
  { key: 'budget', label: 'Tipid', hint: 'Cheapest dishes first', icon: 'wallet-outline' },
  { key: 'kid_friendly', label: 'Kid friendly', hint: 'Mild and familiar', icon: 'happy-outline' },
  { key: 'comfort', label: 'Comfort food', hint: 'Sabaw and ulam like home', icon: 'heart-outline' },
  { key: 'healthy', label: 'Healthy', hint: 'More vegetables, lighter cooking', icon: 'leaf-outline' },
  { key: 'no_cook', label: 'No cook', hint: 'Salads, toast, overnight oats', icon: 'snow-outline' },
];

export const ALLERGIES: { key: Group; label: string }[] = [
  { key: 'peanut', label: 'Peanuts' },
  { key: 'tree_nut', label: 'Tree nuts' },
  { key: 'shellfish', label: 'Shellfish' },
  { key: 'fish', label: 'Fish' },
  { key: 'egg', label: 'Eggs' },
  { key: 'dairy', label: 'Dairy' },
  { key: 'gluten', label: 'Gluten' },
  { key: 'soy', label: 'Soy' },
  { key: 'sesame', label: 'Sesame' },
];

export const DISLIKES: { key: Group; label: string }[] = [
  { key: 'fish', label: 'Fish' },
  { key: 'shellfish', label: 'Shrimp and squid' },
  { key: 'beef', label: 'Beef' },
  { key: 'pork', label: 'Pork' },
  { key: 'chicken', label: 'Chicken' },
  { key: 'tofu', label: 'Tofu' },
  { key: 'liver', label: 'Liver' },
  { key: 'mushroom', label: 'Mushrooms' },
  { key: 'eggplant', label: 'Eggplant' },
  { key: 'ampalaya', label: 'Ampalaya' },
  { key: 'coconut', label: 'Coconut / gata' },
  { key: 'beans', label: 'Beans and monggo' },
  { key: 'olive', label: 'Olives' },
  { key: 'kale', label: 'Kale' },
  { key: 'cilantro', label: 'Cilantro' },
  { key: 'spicy', label: 'Spicy food' },
  { key: 'peanut', label: 'Peanuts' },
];

/** Things most kitchens have, offered as one-tap chips on "What do you already have?". */
export const COMMON_HAVES = ['rice', 'egg', 'garlic', 'onion', 'tomato', 'banana', 'potato', 'soy_sauce', 'vinegar', 'oil', 'salt', 'sugar', 'patis', 'pasta', 'sardines', 'corned_beef', 'bread', 'oats', 'calamansi', 'ginger'];

export const BUDGET_LEVEL: Record<BudgetLevel, { label: string; hint: string; tone: 'danger' | 'warn' | 'ok' | 'good' }> = {
  very_tight: { label: 'Very tight', hint: 'Below what even the cheapest dishes cost. Expect a lot of monggo, eggs and sardinas.', tone: 'danger' },
  tight: { label: 'Tight', hint: 'Doable with budget dishes and few meats.', tone: 'warn' },
  on_budget: { label: 'On budget', hint: 'Room for a good mix of ulam.', tone: 'ok' },
  comfortable: { label: 'Comfortable', hint: 'Plenty of room. Beef, seafood and new recipes fit.', tone: 'good' },
};

export const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Merienda' };

export const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`;
