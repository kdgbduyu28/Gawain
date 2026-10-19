/** Common chores, pantry staples and appliance timers offered on first run and in the add screens. */

export const ROOMS = ['Kitchen', 'Living room', 'Bedroom', 'Bathroom', 'Laundry', 'Office', 'Outside', 'Errands'] as const;

export const ROOM_ICONS: Record<string, string> = {
  Kitchen: 'restaurant-outline',
  'Living room': 'tv-outline',
  Bedroom: 'bed-outline',
  Bathroom: 'water-outline',
  Laundry: 'shirt-outline',
  Office: 'laptop-outline',
  Outside: 'leaf-outline',
  Errands: 'car-outline',
};

export type StarterChore = { name: string; room: string; everyDays: number | null; minutes: number; where: 'home' | 'out' };

export const STARTER_CHORES: StarterChore[] = [
  { name: 'Wash the dishes', room: 'Kitchen', everyDays: 1, minutes: 15, where: 'home' },
  { name: 'Wipe kitchen counters', room: 'Kitchen', everyDays: 1, minutes: 5, where: 'home' },
  { name: 'Take out the trash', room: 'Kitchen', everyDays: 2, minutes: 5, where: 'home' },
  { name: 'Clean the stove', room: 'Kitchen', everyDays: 7, minutes: 15, where: 'home' },
  { name: 'Clean the fridge', room: 'Kitchen', everyDays: 14, minutes: 20, where: 'home' },
  { name: 'Do the laundry', room: 'Laundry', everyDays: 4, minutes: 20, where: 'home' },
  { name: 'Fold and put away clothes', room: 'Bedroom', everyDays: 4, minutes: 15, where: 'home' },
  { name: 'Change bedsheets', room: 'Bedroom', everyDays: 14, minutes: 15, where: 'home' },
  { name: 'Clean the aircon filter', room: 'Bedroom', everyDays: 30, minutes: 20, where: 'home' },
  { name: 'Sweep and mop', room: 'Living room', everyDays: 3, minutes: 25, where: 'home' },
  { name: 'Vacuum', room: 'Living room', everyDays: 7, minutes: 30, where: 'home' },
  { name: 'Dust the shelves', room: 'Living room', everyDays: 7, minutes: 10, where: 'home' },
  { name: 'Clean the bathroom', room: 'Bathroom', everyDays: 7, minutes: 45, where: 'home' },
  { name: 'Wipe desk and monitor', room: 'Office', everyDays: 7, minutes: 5, where: 'home' },
  { name: 'Water the plants', room: 'Outside', everyDays: 3, minutes: 5, where: 'home' },
  { name: 'Pay the bills', room: 'Errands', everyDays: 30, minutes: 20, where: 'out' },
];

export const AISLES = [
  'Produce',
  'Meat & fish',
  'Dairy & eggs',
  'Rice & grains',
  'Pantry',
  'Condiments',
  'Drinks',
  'Frozen',
  'Household',
  'Personal care',
  'Other',
] as const;

export type StarterItem = { name: string; aisle: string };

export const STARTER_ITEMS: StarterItem[] = [
  { name: 'Rice', aisle: 'Rice & grains' },
  { name: 'Eggs', aisle: 'Dairy & eggs' },
  { name: 'Milk', aisle: 'Dairy & eggs' },
  { name: 'Bread', aisle: 'Rice & grains' },
  { name: 'Cooking oil', aisle: 'Pantry' },
  { name: 'Coffee', aisle: 'Drinks' },
  { name: 'Sugar', aisle: 'Pantry' },
  { name: 'Canned goods', aisle: 'Pantry' },
  { name: 'Soy sauce', aisle: 'Condiments' },
  { name: 'Vinegar', aisle: 'Condiments' },
  { name: 'Garlic', aisle: 'Produce' },
  { name: 'Onions', aisle: 'Produce' },
  { name: 'Drinking water', aisle: 'Drinks' },
  { name: 'Dish soap', aisle: 'Household' },
  { name: 'Laundry detergent', aisle: 'Household' },
  { name: 'Fabric conditioner', aisle: 'Household' },
  { name: 'Toilet paper', aisle: 'Household' },
  { name: 'Trash bags', aisle: 'Household' },
  { name: 'Shampoo', aisle: 'Personal care' },
  { name: 'Toothpaste', aisle: 'Personal care' },
  { name: 'Bath soap', aisle: 'Personal care' },
];

export type TimerPreset = { label: string; icon: string; minutes: number };

export const TIMER_PRESETS: TimerPreset[] = [
  { label: 'Washer', icon: 'water-outline', minutes: 45 },
  { label: 'Dryer', icon: 'sunny-outline', minutes: 60 },
  { label: 'Rice cooker', icon: 'restaurant-outline', minutes: 30 },
  { label: 'Oven', icon: 'flame-outline', minutes: 25 },
  { label: 'Dishwasher', icon: 'sparkles-outline', minutes: 90 },
  { label: 'Defrosting', icon: 'snow-outline', minutes: 120 },
];
