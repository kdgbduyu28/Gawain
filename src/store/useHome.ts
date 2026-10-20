import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Lang } from '../i18n';
import { emit } from '../lib/events';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { STARTER_CHORES, STARTER_ITEMS } from '../data/starters';
import { Chore, Done, withDone } from '../lib/chores';
import { Announce, DEFAULT_ANNOUNCE } from '../lib/announce';
import { Block, Busy, Schedule, blocksOn } from '../lib/gaps';
import { Item, Level, withBought, withLevel } from '../lib/pantry';
import { Timer } from '../lib/reminders';
import { HomeEvent, Trigger, applyEvents } from '../lib/smarthome';
import { Clock, MIN, addDays, startOfDay } from '../lib/time';

export type Place = { id: string; name: string; kind: 'home' | 'store'; lat: number; lng: number; radius: number };

export type Settings = {
  theme: 'system' | 'light' | 'dark';
  /** App language. Device only, like the theme. */
  lang: Lang;
  schedule: Schedule;
  /** Morning summary time, or null for none. */
  digest: Clock | null;
  gapNudges: boolean;
  notifications: boolean;
  /** Read busy times from the phone's calendars. */
  useCalendar: boolean;
  /** Calendar ids to read; null means every calendar on the phone. */
  calendarIds: string[] | null;
  /** Secret iCal links (Google, Outlook...), read on the web and on phones. */
  icsUrls: string[];
  awayReminders: boolean;
  /** The household's smart-home link token, if it was made on this device. Never synced. */
  hookToken: string | null;
  /** Say reminders on a speaker through Home Assistant. Never synced. */
  announce: Announce;
  welcomed: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  lang: 'en',
  schedule: {
    workDays: [1, 2, 3, 4, 5],
    workStart: '09:00',
    workEnd: '18:00',
    dayStart: '07:00',
    dayEnd: '22:00',
    maxWorkChore: 15,
    buffer: 5,
  },
  digest: '08:00',
  gapNudges: true,
  notifications: true,
  useCalendar: false,
  calendarIds: null,
  icsUrls: [],
  awayReminders: false,
  hookToken: null,
  announce: DEFAULT_ANNOUNCE,
  welcomed: false,
};

type Snapshot = { chores: Chore[]; history: Done[]; items: Item[] };
export type Undo = { message: string; snapshot: Snapshot; at: number };

type State = {
  chores: Chore[];
  history: Done[];
  items: Item[];
  timers: Timer[];
  blocks: Block[];
  places: Place[];
  /** Smart-home triggers (synced with the household). */
  triggers: Trigger[];
  settings: Settings;

  // Not persisted.
  /** Busy times read from the phone's calendars. */
  calendarBusy: Busy[];
  calendarReadAt: number | null;
  /** Why the last calendar read failed, if it did. */
  calendarError: string | null;
  undo: Undo | null;
};

type Actions = {
  welcome(choreNames: string[], itemNames: string[]): void;

  saveChore(c: Omit<Chore, 'id' | 'createdAt' | 'snoozedUntil' | 'lastDone'> & Partial<Chore>): string;
  removeChore(id: string): void;
  markDone(id: string, at?: number): void;
  snooze(id: string, days: number): void;

  saveItem(i: Omit<Item, 'id' | 'addedAt' | 'bought' | 'level' | 'onList'> & Partial<Item>): string;
  removeItem(id: string): void;
  setLevel(id: string, level: Level): void;
  /** Quick add from the list box: re-lists a pantry item with that name, or adds a one-off. */
  addToList(name: string): void;
  toggleList(id: string): void;
  buy(id: string): void;

  startTimer(label: string, icon: string, minutes: number): void;
  /** Switch a Home Assistant plug on at `at` (the rice cooker), while Gawain is open. */
  schedulePlug(label: string, at: number, plug: string): void;
  stopTimer(id: string): void;

  saveTrigger(t: Omit<Trigger, 'id' | 'createdAt' | 'reportsFinish'> & Partial<Trigger>): string;
  removeTrigger(id: string): void;
  /** Applies events from smart-home hubs; returns what happened, e.g. ["Washer finished"]. */
  applyHomeEvents(events: HomeEvent[], now?: number): string[];

  saveBlock(b: Omit<Block, 'id'> & { id?: string }): void;
  removeBlock(id: string): void;

  savePlace(p: Omit<Place, 'id'> & { id?: string }): void;
  removePlace(id: string): void;

  setSettings(s: Partial<Settings>): void;
  setSchedule(s: Partial<Schedule>): void;
  setCalendarBusy(busy: Busy[], error?: string | null): void;
  undoLast(): void;
  clearUndo(): void;
  /** Everything worth keeping, for a backup file. */
  backup(): Backup;
  /** Replace everything with a backup. Throws if it isn't one. */
  restore(data: unknown): void;
};

export type Backup = {
  app: 'gawain';
  version: 1;
  savedAt: number;
} & Pick<State, 'chores' | 'history' | 'items' | 'blocks' | 'places' | 'settings'> &
  Partial<Pick<State, 'triggers'>>;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const MAX_HISTORY = 1000;

export const useHome = create<State & Actions>()(
  persist(
    (set, get) => {
      const remember = (message: string) => {
        const { chores, history, items } = get();
        set({ undo: { message, snapshot: { chores, history, items }, at: Date.now() } });
      };

      return {
        chores: [],
        history: [],
        items: [],
        timers: [],
        blocks: [],
        places: [],
        triggers: [],
        settings: DEFAULT_SETTINGS,
        calendarBusy: [],
        calendarReadAt: null,
        calendarError: null,
        undo: null,

        welcome(choreNames, itemNames) {
          const now = Date.now();
          const chores: Chore[] = STARTER_CHORES.filter((c) => choreNames.includes(c.name)).map((c) => ({
            ...c,
            id: uid(),
            createdAt: now,
            lastDone: null,
            snoozedUntil: null,
          }));
          const items: Item[] = STARTER_ITEMS.filter((i) => itemNames.includes(i.name)).map((i) => ({
            ...i,
            id: uid(),
            store: null,
            note: '',
            level: 'full',
            onList: false,
            tracked: true,
            lastsDays: null,
            bought: [],
            addedAt: now,
          }));
          set((s) => ({ chores: [...s.chores, ...chores], items: [...s.items, ...items], settings: { ...s.settings, welcomed: true } }));
        },

        saveChore(c) {
          const id = c.id ?? uid();
          set((s) => {
            const old = s.chores.find((x) => x.id === id);
            const next: Chore = {
              lastDone: null,
              snoozedUntil: null,
              createdAt: Date.now(),
              ...old,
              ...c,
              id,
            };
            return { chores: old ? s.chores.map((x) => (x.id === id ? next : x)) : [...s.chores, next] };
          });
          return id;
        },

        removeChore(id) {
          const c = get().chores.find((x) => x.id === id);
          remember(`Deleted ${c?.name ?? 'chore'}`);
          set((s) => ({ chores: s.chores.filter((x) => x.id !== id) }));
        },

        markDone(id, at = Date.now()) {
          const c = get().chores.find((x) => x.id === id);
          if (!c) return;
          remember(`${c.name} done`);
          set((s) => withDone(s.chores, s.history, id, at, MAX_HISTORY) ?? {});
          emit({ type: 'done', choreId: id, at });
        },

        snooze(id, days) {
          set((s) => ({
            chores: s.chores.map((x) => (x.id === id ? { ...x, snoozedUntil: startOfDay(addDays(Date.now(), days)) } : x)),
          }));
        },

        saveItem(i) {
          const id = i.id ?? uid();
          set((s) => {
            const old = s.items.find((x) => x.id === id);
            const next: Item = { level: 'full', onList: false, bought: [], addedAt: Date.now(), ...old, ...i, id };
            return { items: old ? s.items.map((x) => (x.id === id ? next : x)) : [...s.items, next] };
          });
          return id;
        },

        removeItem(id) {
          const i = get().items.find((x) => x.id === id);
          remember(`Removed ${i?.name ?? 'item'}`);
          set((s) => ({ items: s.items.filter((x) => x.id !== id) }));
        },

        setLevel(id, level) {
          set((s) => ({ items: s.items.map((x) => (x.id === id ? withLevel(x, level) : x)) }));
        },

        addToList(name) {
          const n = name.trim();
          if (!n) return;
          const existing = get().items.find((x) => x.name.toLowerCase() === n.toLowerCase());
          if (existing) {
            set((s) => ({ items: s.items.map((x) => (x.id === existing.id ? { ...x, onList: true } : x)) }));
            return;
          }
          get().saveItem({ name: n, aisle: 'Other', store: null, note: '', tracked: false, lastsDays: null, onList: true });
        },

        toggleList(id) {
          set((s) => ({ items: s.items.map((x) => (x.id === id ? { ...x, onList: !x.onList } : x)) }));
        },

        buy(id) {
          const i = get().items.find((x) => x.id === id);
          if (!i) return;
          remember(`Bought ${i.name}`);
          const now = Date.now();
          emit({ type: 'bought', name: i.name, note: i.note, at: now });
          set((s) => ({
            items: i.tracked ? s.items.map((x) => (x.id === id ? withBought(x, now) : x)) : s.items.filter((x) => x.id !== id),
          }));
        },

        startTimer(label, icon, minutes) {
          const now = Date.now();
          set((s) => ({ timers: [...s.timers, { id: uid(), label, icon, startedAt: now, endsAt: now + minutes * MIN }] }));
        },

        schedulePlug(label, at, plug) {
          const now = Date.now();
          set((s) => ({ timers: [...s.timers.filter((t) => !(t.plug === plug && t.label === label)), { id: uid(), label, icon: 'power-outline', startedAt: now, endsAt: at, plug }] }));
        },

        stopTimer(id) {
          set((s) => ({ timers: s.timers.filter((t) => t.id !== id) }));
        },

        saveTrigger(t) {
          const id = t.id ?? uid();
          set((s) => {
            const old = s.triggers.find((x) => x.id === id);
            const next: Trigger = { reportsFinish: false, createdAt: Date.now(), ...old, ...t, id };
            return { triggers: old ? s.triggers.map((x) => (x.id === id ? next : x)) : [...s.triggers, next] };
          });
          return id;
        },

        removeTrigger(id) {
          set((s) => ({ triggers: s.triggers.filter((x) => x.id !== id), timers: s.timers.filter((x) => x.id !== `hook:${id}`) }));
        },

        applyHomeEvents(events, now = Date.now()) {
          const { chores, history, timers, triggers } = get();
          const r = applyEvents({ chores, history, timers, triggers }, events, now, MAX_HISTORY);
          if (r.log.length || r.triggers !== triggers) set({ chores: r.chores, history: r.history, timers: r.timers, triggers: r.triggers });
          return r.log;
        },

        saveBlock(b) {
          const id = b.id ?? uid();
          set((s) => ({
            blocks: s.blocks.some((x) => x.id === id) ? s.blocks.map((x) => (x.id === id ? { ...b, id } : x)) : [...s.blocks, { ...b, id }],
          }));
        },

        removeBlock(id) {
          set((s) => ({ blocks: s.blocks.filter((x) => x.id !== id) }));
        },

        savePlace(p) {
          const id = p.id ?? (p.kind === 'home' ? 'home' : uid());
          set((s) => ({
            places: s.places.some((x) => x.id === id) ? s.places.map((x) => (x.id === id ? { ...p, id } : x)) : [...s.places, { ...p, id }],
          }));
        },

        removePlace(id) {
          set((s) => ({
            places: s.places.filter((x) => x.id !== id),
            items: s.items.map((x) => (x.store === id ? { ...x, store: null } : x)),
          }));
        },

        setSettings(p) {
          set((s) => ({ settings: { ...s.settings, ...p } }));
        },

        setSchedule(p) {
          set((s) => ({ settings: { ...s.settings, schedule: { ...s.settings.schedule, ...p } } }));
        },

        setCalendarBusy(busy, error = null) {
          set({ calendarBusy: busy, calendarReadAt: Date.now(), calendarError: error });
        },

        undoLast() {
          const u = get().undo;
          if (u) set({ ...u.snapshot, undo: null });
        },

        clearUndo() {
          set({ undo: null });
        },

        backup() {
          const { chores, history, items, blocks, places, triggers, settings } = get();
          // The Home Assistant token unlocks the whole house: keep it out of files.
          const safe = { ...settings, announce: { ...settings.announce, token: '' } };
          return { app: 'gawain', version: 1, savedAt: Date.now(), chores, history, items, blocks, places, triggers, settings: safe };
        },

        restore(data) {
          const d = data as Partial<Backup> | null;
          if (!d || d.app !== 'gawain' || !Array.isArray(d.chores) || !Array.isArray(d.items)) {
            throw new Error("That file isn't a Gawain backup.");
          }
          set({
            chores: d.chores,
            history: Array.isArray(d.history) ? d.history : [],
            items: d.items,
            blocks: Array.isArray(d.blocks) ? d.blocks : [],
            places: Array.isArray(d.places) ? d.places : [],
            triggers: Array.isArray(d.triggers) ? d.triggers : [],
            timers: [],
            undo: null,
            settings: {
              ...DEFAULT_SETTINGS,
              ...d.settings,
              schedule: { ...DEFAULT_SETTINGS.schedule, ...d.settings?.schedule },
              // Backups don't carry the token, so keep the one already here.
              announce: { ...DEFAULT_ANNOUNCE, ...d.settings?.announce, token: get().settings.announce.token },
              welcomed: true,
            },
          });
        },
      };
    },
    {
      name: 'gawain.v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ calendarBusy, calendarReadAt, calendarError, undo, ...rest }) => rest,
      merge: (saved, current) => {
        const s = (saved ?? {}) as Partial<State>;
        // New settings fields get their defaults on older saves.
        return {
          ...current,
          ...s,
          settings: {
            ...DEFAULT_SETTINGS,
            ...s.settings,
            schedule: { ...DEFAULT_SETTINGS.schedule, ...s.settings?.schedule },
            announce: { ...DEFAULT_ANNOUNCE, ...s.settings?.announce },
          },
        };
      },
    },
  ),
);

/** Calendar events plus your weekly meeting blocks, for the next `days` days. */
export function allBusy(s: Pick<State, 'calendarBusy' | 'blocks'>, now: number, days = 7): Busy[] {
  const out = [...s.calendarBusy];
  for (let d = 0; d < days; d++) out.push(...blocksOn(startOfDay(addDays(now, d)), s.blocks));
  return out;
}

export const home = (s: State) => s.places.find((p) => p.kind === 'home') ?? null;
