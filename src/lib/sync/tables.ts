import type { Chore, Done } from '../chores';
import type { Block } from '../gaps';
import type { Tank } from '../meals/energy';
import type { Stock } from '../meals/kitchen';
import type { Plan, Profile } from '../meals/planner';
import type { Item } from '../pantry';
import type { Trigger } from '../smarthome';
import { Json, stableJson } from './merge';

/** The parts of the app's state that sync. Places, timers and calendar links stay on the device. */
export type Synced = {
  chores: Chore[];
  history: Done[];
  items: Item[];
  blocks: Block[];
  triggers: Trigger[];
  settings: SettingsLike;
  meals: MealsSynced;
};

/** The meal planner's shared state (prices stay on each device). */
export type MealsSynced = {
  profile: Profile | null;
  plan: Plan | null;
  cooked: string[];
  chores: Record<string, string>;
  stock: Stock;
  tank: Tank;
  trips: { id: string; at: number; by: string; amount: number; note: string }[];
  bagyoUntil: number | null;
};

type SettingsLike = { schedule: object; digest: string | null; gapNudges: boolean } & Record<string, unknown>;

export type TableName = 'chores' | 'done_history' | 'items' | 'blocks' | 'triggers' | 'settings' | 'meals';

export type Spec = {
  name: TableName;
  /** Shared with the household, or just yours (your meetings and work hours). */
  scope: 'household' | 'user';
  /** Every row on the device, as id → JSON of its synced fields. */
  rows(s: Synced): Record<string, string>;
  /** The state changes that write these pulled rows (null = remove) into `s`. */
  write(s: Synced, apply: Record<string, Json>): Partial<Synced>;
};

// Rows rarely change between store updates, so remember each object's JSON.
const cache = new WeakMap<object, string>();
function json(o: object, project?: (o: any) => object): string {
  let j = cache.get(o);
  if (j === undefined) {
    j = stableJson(project ? project(o) : o);
    cache.set(o, j);
  }
  return j;
}

function parse(j: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(j);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** Replaces, adds or removes rows by id, keeping the existing order. */
function upsertById<T extends { id: string }>(list: T[], apply: Record<string, Json>, build: (data: Record<string, unknown>, old: T | undefined) => T | null): T[] {
  const byId = new Map(list.map((x) => [x.id, x]));
  for (const id in apply) {
    const j = apply[id];
    const data = j === null ? null : parse(j);
    const next = data ? build({ ...data, id }, byId.get(id)) : null;
    if (next) byId.set(id, next);
    else byId.delete(id);
  }
  return [...byId.values()];
}

export const historyId = (h: Done) => `${h.choreId}@${h.at}`;

/** Each item's store is one of this device's saved places, so it isn't synced. */
const itemFields = ({ store, ...rest }: Item) => rest;

const settingsFields = (s: SettingsLike) => ({ schedule: s.schedule, digest: s.digest, gapNudges: s.gapNudges });

export const SETTINGS_ID = 'settings';

const COOKED = '{}';

/** Meal rows by id: profile, plan, tank, bagyo, cook:<slot>, link:<slot>, stock:<ingredient>, trip:<id>. */
function mealRows(m: MealsSynced): Record<string, string> {
  const out: Record<string, string> = {};
  if (m.profile) out.profile = json(m.profile);
  if (m.plan) out.plan = json(m.plan);
  for (const k of m.cooked) out[`cook:${k}`] = COOKED;
  for (const k in m.chores) out[`link:${k}`] = stableJson({ chore: m.chores[k] });
  for (const id in m.stock) out[`stock:${id}`] = json(m.stock[id]);
  if (m.tank.since !== null || m.tank.lasted.length) out.tank = json(m.tank);
  if (m.bagyoUntil) out.bagyo = stableJson({ until: m.bagyoUntil });
  for (const t of m.trips) out[`trip:${t.id}`] = json(t, ({ id: _id, ...rest }) => rest);
  return out;
}

function writeMeals(m: MealsSynced, apply: Record<string, Json>): MealsSynced {
  let { profile, plan, tank, bagyoUntil } = m;
  const trips = new Map(m.trips.map((t) => [t.id, t]));
  const cooked = new Set(m.cooked);
  const chores = { ...m.chores };
  const stock = { ...m.stock };
  for (const id in apply) {
    const j = apply[id];
    const d = j === null ? null : parse(j);
    const [kind, ...rest] = id.split(':');
    const key = rest.join(':');
    if (id === 'profile') profile = d ? (d as unknown as Profile) : null;
    else if (id === 'tank') tank = d && typeof d.size === 'number' && Array.isArray(d.lasted) ? (d as unknown as Tank) : { ...tank, since: null, lasted: [] };
    else if (id === 'bagyo') bagyoUntil = d && typeof d.until === 'number' ? d.until : null;
    else if (kind === 'trip') {
      if (d && typeof d.amount === 'number' && typeof d.by === 'string') trips.set(key, { id: key, at: Number(d.at) || 0, by: d.by, amount: d.amount, note: String(d.note ?? '') });
      else trips.delete(key);
    }
    else if (id === 'plan') plan = d && Array.isArray(d.slots) ? (d as unknown as Plan) : null;
    else if (kind === 'cook') {
      if (d) cooked.add(key);
      else cooked.delete(key);
    }
    else if (kind === 'link') {
      if (d && typeof d.chore === 'string') chores[key] = d.chore;
      else delete chores[key];
    } else if (kind === 'stock') {
      if (d && typeof d.qty === 'number' && typeof d.at === 'number') stock[key] = { qty: d.qty, at: d.at };
      else delete stock[key];
    }
  }
  return { profile, plan, cooked: [...cooked], chores, stock, tank, bagyoUntil, trips: [...trips.values()].sort((a, b) => a.at - b.at) };
}

export const MAX_HISTORY = 1000;

export const TABLES: Spec[] = [
  {
    name: 'chores',
    scope: 'household',
    rows: (s) => Object.fromEntries(s.chores.map((c) => [c.id, json(c)])),
    write: (s, apply) => ({ chores: upsertById(s.chores, apply, (d) => d as Chore) }),
  },
  {
    name: 'done_history',
    scope: 'household',
    rows: (s) => Object.fromEntries(s.history.map((h) => [historyId(h), json(h)])),
    write: (s, apply) => {
      const byId = new Map(s.history.map((h) => [historyId(h), h]));
      for (const id in apply) {
        const d = apply[id] === null ? null : parse(apply[id]!);
        if (d && typeof d.choreId === 'string' && typeof d.at === 'number') byId.set(id, { choreId: d.choreId, at: d.at, late: Number(d.late) || 0 });
        else byId.delete(id);
      }
      return { history: [...byId.values()].sort((a, b) => a.at - b.at).slice(-MAX_HISTORY) };
    },
  },
  {
    name: 'items',
    scope: 'household',
    rows: (s) => Object.fromEntries(s.items.map((i) => [i.id, json(i, itemFields)])),
    write: (s, apply) => ({ items: upsertById(s.items, apply, (d, old) => ({ ...(d as Item), store: old?.store ?? null })) }),
  },
  {
    name: 'blocks',
    scope: 'user',
    rows: (s) => Object.fromEntries(s.blocks.map((b) => [b.id, json(b)])),
    write: (s, apply) => ({ blocks: upsertById(s.blocks, apply, (d) => d as Block) }),
  },
  {
    name: 'triggers',
    scope: 'household',
    rows: (s) => Object.fromEntries(s.triggers.map((t) => [t.id, json(t)])),
    write: (s, apply) => ({ triggers: upsertById(s.triggers, apply, (d) => d as Trigger) }),
  },
  {
    name: 'settings',
    scope: 'user',
    rows: (s) => ({ [SETTINGS_ID]: json(s.settings, settingsFields) }),
    write: (s, apply) => {
      const j = apply[SETTINGS_ID];
      const d = j ? parse(j) : null;
      if (!d) return {};
      const next = { ...s.settings };
      if (d.schedule && typeof d.schedule === 'object') next.schedule = { ...s.settings.schedule, ...d.schedule };
      if (typeof d.digest === 'string' || d.digest === null) next.digest = d.digest;
      if (typeof d.gapNudges === 'boolean') next.gapNudges = d.gapNudges;
      return { settings: next };
    },
  },
  {
    name: 'meals',
    scope: 'household',
    rows: (s) => mealRows(s.meals),
    write: (s, apply) => ({ meals: writeMeals(s.meals, apply) }),
  },
];

/** The store slice each table reads, to skip work when an unrelated part of the state changed. */
export const SLICE: Record<Exclude<TableName, 'meals'>, Exclude<keyof Synced, 'meals'>> = {
  chores: 'chores',
  done_history: 'history',
  items: 'items',
  blocks: 'blocks',
  triggers: 'triggers',
  settings: 'settings',
};
