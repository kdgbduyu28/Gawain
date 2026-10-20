import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { onAppEvent } from '../lib/events';
import { meetingLoad } from '../lib/meals/context';
import { matchIngredient } from '../lib/meals/ingredients';
import { NO_TANK, Tank, swapTank } from '../lib/meals/energy';
import { Stock, addStock, consume, inKitchen, parseBuy, prune, goingOff } from '../lib/meals/kitchen';
import { Plan, Profile, makePlan, replan, slotLines, swapSlot } from '../lib/meals/planner';
import { Market, NCR, PriceBook, REGIONS, Shop, coverage, loadPresyo, priceBook } from '../lib/meals/prices';
import { Trip } from '../lib/meals/trip';
import { DayWeather, byWeekday, loadWeather } from '../lib/meals/weather';
import { HOUR } from '../lib/time';
import { allBusy, useHome } from './useHome';

/** When the prices were read and from which reports. */
export type PriceMeta = {
  area: string;
  shop: Shop;
  fetchedAt: number;
  psaPeriod: string | null;
  daDate: string | null;
  srpDate: string | null;
  /** Share of ingredients priced from government data (the rest are estimates). */
  coverage: number;
  marketDate: string | null;
  /** LPG ₱/kg and electricity ₱/kWh from Presyo, with their months. */
  lpg?: { perKg: number; period: string } | null;
  power?: { kwh: number; period: string } | null;
};

export type { Trip } from '../lib/meals/trip';

export const DEFAULT_PROFILE: Profile = {
  shop: 'palengke',
  area: NCR,
  adults: 2,
  kids: 0,
  meals: ['lunch', 'dinner'],
  days: [0, 1, 2, 3, 4, 5, 6],
  equipment: ['stove', 'rice_cooker'],
  diets: [],
  cuisines: ['filipino'],
  vibes: ['quick'],
  allergies: [],
  dislikes: [],
  have: [],
  budget: 3000,
};

type State = {
  profile: Profile | null;
  plan: Plan | null;
  book: PriceBook | null;
  meta: PriceMeta | null;
  /** Metro Manila markets' prices, for "where is this list cheapest". */
  markets: Market[];
  /** What's in the kitchen from plan shopping (see lib/meals/kitchen). */
  stock: Stock;
  /** Plan slots already cooked. */
  cooked: string[];
  /** Slot key → chore id, for dishes already added to Chores. */
  chores: Record<string, string>;
  /** The LPG tank in use (see lib/meals/energy). */
  tank: Tank;
  /** Grocery trips and who paid. */
  trips: Trip[];
  /** Bagyo mode is on until this time. */
  bagyoUntil: number | null;
  /** The week's forecast, and when it was read. */
  weather: DayWeather[];
  weatherAt: number;
  loading: boolean;
  priceError: string | null;
};

type Actions = {
  saveProfile(p: Profile): void;
  /** Read Presyo prices for the region (cached for 12 hours unless forced). */
  loadPrices(area: string, shop: Shop, force?: boolean): Promise<PriceBook>;
  generate(seed?: number): Promise<void>;
  swap(slotKey: string, recipeId: string): void;
  toggleSide(slotKey: string, sideId: string): void;
  linkChore(slotKey: string, choreId: string): void;
  clearPlan(): void;
  /** A grocery item was ticked off: if it's an ingredient, it's now in the kitchen. */
  recordBought(name: string, note: string, at: number): void;
  /** A planned dish was cooked: use up its ingredients. */
  markCooked(slotKey: string): void;
  /** Everything the planner should treat as already at home. */
  haveNow(): string[];
  /** Read the forecast for home (or the region's main city); cached for 3 hours. */
  loadWeather(force?: boolean): Promise<DayWeather[]>;
  setBagyo(on: boolean): void;
  newTank(at?: number): void;
  stopTank(): void;
  logTrip(t: Omit<Trip, 'id'>): void;
  removeTrip(id: string): void;
};

const WEATHER_FOR = 3 * HOUR;
const BAGYO_DAYS = 4;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const FRESH_FOR = 12 * HOUR;

export const useMeals = create<State & Actions>()(
  persist(
    (set, get) => ({
      profile: null,
      plan: null,
      book: null,
      meta: null,
      markets: [],
      stock: {},
      cooked: [],
      chores: {},
      tank: NO_TANK,
      trips: [],
      bagyoUntil: null,
      weather: [],
      weatherAt: 0,
      loading: false,
      priceError: null,

      saveProfile(profile) {
        set({ profile });
      },

      async loadPrices(area, shop, force = false) {
        const { book, meta } = get();
        // Prices saved before market data existed have no marketDate: read them again.
        const complete = area !== NCR || meta?.marketDate !== undefined;
        if (!force && book && meta && complete && meta.area === area && meta.shop === shop && Date.now() - meta.fetchedAt < FRESH_FOR) return book;
        set({ loading: true, priceError: null });
        try {
          const data = await loadPresyo(area);
          const next = priceBook(data, shop);
          const fromGov = coverage(next);
          set({
            book: next,
            meta: {
              area,
              shop,
              fetchedAt: Date.now(),
              psaPeriod: data.psaPeriod,
              daDate: data.daDate,
              srpDate: data.srpDate,
              coverage: fromGov,
              marketDate: data.marketDate,
              lpg: data.lpg ?? null,
              power: data.power ?? null,
            },
            markets: data.markets,
            loading: false,
            priceError: fromGov === 0 ? "Couldn't reach Presyo, so these are estimated prices." : null,
          });
          return next;
        } catch {
          const fallback = priceBook(null, shop);
          set({ book: fallback, loading: false, priceError: "Couldn't reach Presyo, so these are estimated prices." });
          return fallback;
        }
      },

      async generate(seed = Date.now()) {
        const p = get().profile;
        if (!p) return;
        const [book, weather] = await Promise.all([get().loadPrices(p.area, p.shop), get().loadWeather()]);
        const now = Date.now();
        const home = useHome.getState();
        const stock = prune(get().stock, now);
        const until = get().bagyoUntil;
        set({
          stock,
          plan: makePlan({ ...p, have: get().haveNow() }, book, {
            seed,
            start: new Date(now).getDay(),
            from: now,
            weather: byWeekday(weather, now),
            bagyo: !!until && until > now,
            // Busy meeting days get quick dishes.
            load: meetingLoad(allBusy(home, now, 8), home.settings.schedule, now),
            // Cook what's about to go off first.
            useSoon: goingOff(stock, now, 3),
          }),
          chores: {},
          cooked: [],
        });
      },

      haveNow() {
        const p = get().profile;
        const now = Date.now();
        // Pantry items marked Plenty, plus what plan shopping put in the kitchen.
        const pantry = useHome
          .getState()
          .items.filter((i) => i.tracked && i.level === 'full')
          .map((i) => matchIngredient(i.name)?.id)
          .filter((x): x is string => !!x);
        return [...new Set([...(p?.have ?? []), ...pantry, ...inKitchen(get().stock, now)])];
      },

      recordBought(name, note, at) {
        const ing = matchIngredient(name);
        if (!ing) return;
        set((s) => ({ stock: addStock(prune(s.stock, at), ing.id, parseBuy(note, ing), at) }));
      },

      markCooked(slotKey) {
        const { plan, cooked } = get();
        const slot = plan?.slots.find((s) => s.key === slotKey);
        if (!slot || !slot.cook || cooked.includes(slotKey)) return;
        set((s) => ({ stock: consume(s.stock, slotLines(slot)), cooked: [...s.cooked, slotKey] }));
      },

      swap(slotKey, recipeId) {
        const { plan, profile, book } = get();
        if (plan && profile && book) set({ plan: swapSlot(plan, slotKey, recipeId, profile, book) });
      },

      toggleSide(slotKey, sideId) {
        const { plan, profile, book } = get();
        if (!plan || !profile || !book) return;
        const slots = plan.slots.map((s) =>
          s.key === slotKey ? { ...s, sides: s.sides.includes(sideId) ? s.sides.filter((x) => x !== sideId) : [...s.sides, sideId] } : s,
        );
        set({ plan: replan({ ...plan, slots }, profile, book) });
      },

      linkChore(slotKey, choreId) {
        set((s) => ({ chores: { ...s.chores, [slotKey]: choreId } }));
      },

      clearPlan() {
        set({ plan: null, chores: {} });
      },

      async loadWeather(force = false) {
        const { weather, weatherAt, profile } = get();
        if (!force && weather.length && Date.now() - weatherAt < WEATHER_FOR) return weather;
        const home = useHome.getState().places.find((x) => x.kind === 'home');
        const region = REGIONS.find((r) => r.code === (profile?.area ?? NCR)) ?? REGIONS[0];
        const next = await loadWeather(home?.lat ?? region.lat, home?.lng ?? region.lng);
        if (next.length) set({ weather: next, weatherAt: Date.now() });
        return next.length ? next : weather;
      },

      setBagyo(on) {
        set({ bagyoUntil: on ? Date.now() + BAGYO_DAYS * 24 * HOUR : null });
      },

      newTank(at = Date.now()) {
        set((s) => ({ tank: swapTank(s.tank, at) }));
      },

      stopTank() {
        set((s) => ({ tank: { ...s.tank, since: null } }));
      },

      logTrip(t) {
        set((s) => ({ trips: [...s.trips, { ...t, id: uid() }].slice(-200) }));
      },

      removeTrip(id) {
        set((s) => ({ trips: s.trips.filter((t) => t.id !== id) }));
      },
    }),
    {
      name: 'gawain.meals.v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ loading, priceError, ...rest }) => rest,
    },
  ),
);

/** The date a plan slot falls on: the next `day` (weekday) on or after the plan's first day. */
export function slotDate(plan: Plan, day: number): number {
  const d = new Date(plan.createdAt);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((day - plan.start + 7) % 7));
  return d.getTime();
}

// Hear about shopping and cooking from the rest of the app.
onAppEvent((e) => {
  const s = useMeals.getState();
  if (e.type === 'bought') s.recordBought(e.name, e.note, e.at);
  else {
    const key = Object.entries(s.chores).find(([, id]) => id === e.choreId)?.[0];
    if (key) s.markCooked(key);
  }
});
