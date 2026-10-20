/**
 * Cloud sync. Gawain stays local-first: the store in useHome is what the app
 * reads and writes, and this only runs when someone is signed in. It notices
 * local edits as they happen, then pulls what other devices changed and pushes
 * what this one changed: on start, when the app comes to the front, every couple
 * of minutes while open, and shortly after each edit.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { useHome } from '../../store/useHome';
import { useMeals } from '../../store/useMeals';
import { NO_TANK } from '../meals/energy';
import { supabase } from '../supabase';
import { Json, RemoteRow, TableState, Version, acked, detect, emptyTable, mergeRemote, pullFrom, stableJson } from './merge';
import { MealsSynced, SLICE, Spec, Synced, TABLES, TableName } from './tables';

const KEY = 'gawain.sync.v1';
const PAGE = 1000;
const PUSH_CHUNK = 200;
const AFTER_EDIT_MS = 2_000;
const EVERY_MS = 2 * 60_000;
const EVENTS_PAGE = 200;
/** How far back a device looks for smart-home events the first time. */
const EVENTS_BACK_MS = 6 * 60 * 60_000;

type Data = {
  userId: string;
  householdId: string | null;
  /** False until this device's data and the account's have been put together once. */
  ready: boolean;
  tables: Record<TableName, TableState>;
  lastSyncedAt: number | null;
  /** The last smart-home event applied on this device. */
  eventsAfter?: number | null;
};

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'error' | 'choose';

type Ui = {
  /** This build has a Supabase project to sync with. */
  configured: boolean;
  email: string | null;
  status: SyncStatus;
  error: string | null;
  lastSyncedAt: number | null;
  /** Local edits not on the server yet. */
  pending: number;
};

export const useSync = create<Ui>(() => ({ configured: !!supabase, email: null, status: 'off', error: null, lastSyncedAt: null, pending: 0 }));

let data: Data | null = null;
let running: Promise<void> | null = null;
let again = false;
let choice: 'merge' | 'replace' | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let channel: RealtimeChannel | null = null;
let channelHid: string | null = null;

const fresh = (userId: string): Data => ({
  userId,
  householdId: null,
  ready: false,
  tables: Object.fromEntries(TABLES.map((t) => [t.name, emptyTable()])) as Data['tables'],
  lastSyncedAt: null,
});

function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (data) AsyncStorage.setItem(KEY, JSON.stringify(data)).catch(() => {});
  }, 400);
}

const pendingCount = () => (data ? TABLES.reduce((n, t) => n + Object.keys(data!.tables[t.name].dirty).length, 0) : 0);

function mealsNow(m = useMeals.getState()): MealsSynced {
  return { profile: m.profile, plan: m.plan, cooked: m.cooked, chores: m.chores, stock: m.stock, tank: m.tank, trips: m.trips, bagyoUntil: m.bagyoUntil };
}

function synced(): Synced {
  const { chores, history, items, blocks, triggers, settings } = useHome.getState();
  return { chores, history, items, blocks, triggers, settings, meals: mealsNow() };
}

function detectAll(now: number) {
  const s = synced();
  for (const spec of TABLES) data!.tables[spec.name] = detect(data!.tables[spec.name], spec.rows(s), now);
}

/** Writes pulled rows into the app's store. */
function applyAll(applies: Partial<Record<TableName, Record<string, Json>>>) {
  const specs = TABLES.filter((t) => Object.keys(applies[t.name] ?? {}).length);
  if (!specs.length) return;
  const meals = specs.find((t) => t.name === 'meals');
  if (meals) useMeals.setState(meals.write(synced(), applies.meals!).meals!);
  const home = specs.filter((t) => t !== meals);
  if (!home.length) return;
  useHome.setState((s) => {
    let cur: Synced = { chores: s.chores, history: s.history, items: s.items, blocks: s.blocks, triggers: s.triggers, settings: s.settings, meals: mealsNow() };
    for (const spec of home) cur = { ...cur, ...spec.write(cur, applies[spec.name]!) };
    // An undo snapshot from before the pull would bring back stale rows.
    const { meals: _m, ...rest } = cur;
    return { ...rest, settings: cur.settings as typeof s.settings, undo: null };
  });
}

const scopeOf = (spec: Spec) => (spec.scope === 'household' ? { col: 'household_id', id: data!.householdId! } : { col: 'user_id', id: data!.userId });

type Row = { id: string; data: unknown; updated_at: string; deleted: boolean; server_at: string };

const toRemote = (r: Row): RemoteRow => ({
  id: r.id,
  json: r.deleted ? null : stableJson(r.data),
  at: new Date(r.updated_at).getTime(),
  serverAt: new Date(r.server_at).toISOString(),
});

async function pull(spec: Spec): Promise<RemoteRow[]> {
  const db = supabase!;
  const { col, id } = scopeOf(spec);
  const out: RemoteRow[] = [];
  let from = pullFrom(data!.tables[spec.name].cursor);
  for (;;) {
    let q = db.from(spec.name).select('id, data, updated_at, deleted, server_at').eq(col, id).order('server_at').order('id').limit(PAGE);
    if (from) q = q.gte('server_at', from);
    const { data: rows, error } = await q;
    if (error) throw error;
    out.push(...(rows as Row[]).map(toRemote));
    if (rows.length < PAGE) return out;
    const last = new Date(rows[rows.length - 1].server_at).toISOString();
    if (last === from) return out; // a whole page in one instant; the next pull carries on
    from = last;
  }
}

async function push(spec: Spec) {
  const db = supabase!;
  const { col, id: scopeId } = scopeOf(spec);
  const sent: Record<string, Version> = { ...data!.tables[spec.name].dirty };
  const ids = Object.keys(sent);
  if (!ids.length) return;
  const accepted: Record<string, number> = {};
  for (let i = 0; i < ids.length; i += PUSH_CHUNK) {
    const rows = ids.slice(i, i + PUSH_CHUNK).map((id) => {
      const v = sent[id];
      // Deleted rows keep nothing but the fact they're gone.
      return { [col]: scopeId, id, data: v.json === null ? {} : JSON.parse(v.json), updated_at: new Date(v.at).toISOString(), deleted: v.json === null };
    });
    const { data: res, error } = await db.from(spec.name).upsert(rows, { onConflict: `${col},id` }).select('id, updated_at');
    if (error) throw error;
    for (const r of res as { id: string; updated_at: string }[]) accepted[r.id] = new Date(r.updated_at).getTime();
  }
  const { table, rejected } = acked(data!.tables[spec.name], sent, accepted);
  data!.tables[spec.name] = table;
  if (!rejected.length) return;
  // The server already had newer copies of these: fetch them so they win here too.
  const { data: rows, error } = await db.from(spec.name).select('id, data, updated_at, deleted, server_at').eq(col, scopeId).in('id', rejected);
  if (error) throw error;
  const m = mergeRemote(data!.tables[spec.name], (rows as Row[]).map((r) => ({ ...toRemote(r), serverAt: '' })));
  data!.tables[spec.name] = { ...m.table, cursor: data!.tables[spec.name].cursor };
  applyAll({ [spec.name]: m.apply });
}

async function pullAll() {
  const applies: Partial<Record<TableName, Record<string, Json>>> = {};
  for (const spec of TABLES) {
    const rows = await pull(spec);
    const m = mergeRemote(data!.tables[spec.name], rows);
    data!.tables[spec.name] = m.table;
    applies[spec.name] = m.apply;
  }
  applyAll(applies);
}

/**
 * The first sync for this account on this device. If both sides already have
 * chores or groceries, waits for the person to say whether to combine them or
 * to take the account's (status 'choose'). Returns false while waiting.
 */
async function firstSync(): Promise<boolean> {
  const db = supabase!;
  let remoteHas = false;
  for (const spec of TABLES.filter((t) => t.name !== 'settings')) {
    const { col, id } = scopeOf(spec);
    const { data: rows, error } = await db.from(spec.name).select('id').eq(col, id).eq('deleted', false).limit(1);
    if (error) throw error;
    if (rows.length) remoteHas = true;
  }
  const s = synced();
  const localHas = s.chores.length + s.items.length + s.history.length + s.blocks.length + s.triggers.length > 0 || !!s.meals.plan;
  if (remoteHas && localHas && !choice) {
    useSync.setState({ status: 'choose' });
    return false;
  }
  if (remoteHas && (choice === 'replace' || !localHas)) {
    // Take the account's data. Pull before noting local rows, so nothing here
    // looks newer than it (this device's settings included).
    useHome.setState({ chores: [], history: [], items: [], blocks: [], triggers: [], undo: null });
    useMeals.setState({ profile: null, plan: null, cooked: [], chores: {}, stock: {}, tank: NO_TANK, trips: [], bagyoUntil: null });
    await pullAll();
    data!.ready = true;
    detectAll(Date.now());
  } else {
    // Combine (or a brand-new account): everything here goes up. Where the same
    // row is on both sides (work hours, or chores from before signing out), the
    // account's copy wins, since we can't tell when this device's was edited.
    detectAll(Date.now());
    if (remoteHas) {
      for (const spec of TABLES) {
        const t = data!.tables[spec.name];
        t.dirty = Object.fromEntries(Object.entries(t.dirty).map(([id, v]) => [id, { ...v, at: 0 }]));
      }
    }
    data!.ready = true;
  }
  choice = null;
  const after = useHome.getState();
  if (!after.settings.welcomed && (after.chores.length || after.items.length)) after.setSettings({ welcomed: true });
  return true;
}

type EventRow = { id: number | string; trigger_key: string; event: string; at: string };

/**
 * Applies what smart-home hubs sent to the household's link since the last
 * pull. Only while there are triggers to apply them to; until then nothing is
 * fetched, and the first pull after looks back a few hours.
 */
async function pullEvents() {
  if (!useHome.getState().triggers.length) {
    data!.eventsAfter = null;
    return;
  }
  const db = supabase!;
  for (;;) {
    const after = data!.eventsAfter;
    let q = db.from('home_events').select('id, trigger_key, event, at').eq('household_id', data!.householdId!);
    q = after != null ? q.gt('id', after) : q.gte('at', new Date(Date.now() - EVENTS_BACK_MS).toISOString());
    const { data: rows, error } = await q.order('id').limit(EVENTS_PAGE);
    if (error) throw error;
    const evs = rows as EventRow[];
    if (!evs.length) return;
    useHome.getState().applyHomeEvents(evs.map((r) => ({ id: Number(r.id), key: r.trigger_key, event: r.event, at: new Date(r.at).getTime() })));
    data!.eventsAfter = Number(evs[evs.length - 1].id);
    if (evs.length < EVENTS_PAGE) return;
  }
}

/** While there are triggers, hear about new events right away instead of on the next pull. */
function listen() {
  const db = supabase!;
  const hid = data?.householdId;
  const want = !!hid && useHome.getState().triggers.length > 0 && typeof db.channel === 'function';
  if (channel && (!want || channelHid !== hid)) {
    db.removeChannel(channel);
    channel = null;
  }
  if (!want || channel) return;
  channelHid = hid;
  channel = db
    .channel(`home-events:${hid}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'home_events', filter: `household_id=eq.${hid}` }, () => later(300))
    .subscribe();
}

async function cycle() {
  const db = supabase!;
  const { data: auth } = await db.auth.getSession();
  const user = auth.session?.user;
  if (!user) {
    useSync.setState({ status: 'off', email: null, pending: 0 });
    return;
  }
  useSync.setState({ email: user.email ?? null, status: 'syncing', error: null });
  if (!data || data.userId !== user.id) data = fresh(user.id);
  if (!data.householdId) {
    const { data: hid, error } = await db.rpc('ensure_household');
    if (error) throw error;
    data.householdId = hid as string;
  }
  if (!data.ready && !(await firstSync())) return;
  detectAll(Date.now());
  await pullAll();
  // Before pushing, so chores a button marked done go up in this same sync.
  await pullEvents();
  for (const spec of TABLES) await push(spec);
  listen();
  data.lastSyncedAt = Date.now();
  save();
  useSync.setState({ status: 'idle', lastSyncedAt: data.lastSyncedAt, pending: pendingCount() });
}

function failed(e: unknown) {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  const offline = /network|fetch|load failed|timed? ?out/i.test(msg);
  if (data) save();
  useSync.setState({ status: offline ? 'offline' : 'error', error: offline ? null : msg, pending: pendingCount() });
}

/** Syncs now (or right after the sync already running). */
export function syncNow(): Promise<void> {
  if (!supabase) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await cycle();
      } while (again);
    } catch (e) {
      failed(e);
    } finally {
      running = null;
    }
  })();
  return running;
}

function later(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    syncNow();
  }, ms);
}

/** After the first sign-in, when both this device and the account have data. */
export function chooseFirstSync(mode: 'merge' | 'replace') {
  choice = mode;
  return syncNow();
}

/** Signs out on this device only. Everything stays here; it just stops syncing. */
export async function signOut() {
  await supabase?.auth.signOut({ scope: 'local' });
  forget();
}

function forget() {
  if (channel) supabase?.removeChannel(channel);
  channel = null;
  data = null;
  choice = null;
  AsyncStorage.removeItem(KEY).catch(() => {});
  useSync.setState({ status: 'off', email: null, error: null, lastSyncedAt: null, pending: 0 });
}

const hydratedStore = (store: typeof useHome | typeof useMeals) =>
  new Promise<void>((resolve) => {
    if (store.persist.hasHydrated()) resolve();
    else {
      const off = store.persist.onFinishHydration(() => {
        off();
        resolve();
      });
    }
  });
const hydrated = () => Promise.all([hydratedStore(useHome), hydratedStore(useMeals)]);

let started = false;

/** Called once at app start. Does nothing in builds without Supabase. */
export function startSync() {
  if (!supabase || started) return;
  started = true;
  const db = supabase;
  (async () => {
    try {
      const saved = await AsyncStorage.getItem(KEY);
      if (saved) data = JSON.parse(saved) as Data;
    } catch {
      data = null;
    }
    useSync.setState({ lastSyncedAt: data?.lastSyncedAt ?? null });
    // Never compare against an empty store that just hasn't loaded yet.
    await hydrated();

    const noted = (spec: Spec, rows: Record<string, string>, now: number) => {
      const t = detect(data!.tables[spec.name], rows, now);
      if (t === data!.tables[spec.name]) return false;
      data!.tables[spec.name] = t;
      return true;
    };
    const edited = () => {
      save();
      useSync.setState({ pending: pendingCount() });
      later(AFTER_EDIT_MS);
    };
    useHome.subscribe((s, prev) => {
      if (!data?.ready) return;
      const now = Date.now();
      let changed = false;
      for (const spec of TABLES) {
        if (spec.name === 'meals') continue;
        const k = SLICE[spec.name];
        if (s[k] === prev[k]) continue;
        if (noted(spec, spec.rows({ ...s, meals: mealsNow() }), now)) changed = true;
      }
      if (changed) edited();
    });
    const mealsSpec = TABLES.find((t) => t.name === 'meals')!;
    useMeals.subscribe((s, prev) => {
      if (!data?.ready) return;
      const keys = ['profile', 'plan', 'cooked', 'chores', 'stock', 'tank', 'trips', 'bagyoUntil'] as const;
      if (keys.every((k) => s[k] === prev[k])) return;
      if (noted(mealsSpec, mealsSpec.rows({ ...synced(), meals: mealsNow(s) }), Date.now())) edited();
    });

    // Don't call Supabase from inside this callback (it can deadlock); schedule instead.
    db.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') forget();
      else if (session && event !== 'TOKEN_REFRESHED') {
        useSync.setState({ email: session.user.email ?? null });
        later(0);
      } else if (!session) useSync.setState({ status: 'off' });
    });

    AppState.addEventListener('change', (state) => {
      if (state === 'active') later(300);
    });
    setInterval(() => {
      if (AppState.currentState === 'active' && useSync.getState().status !== 'off') later(0);
    }, EVERY_MS);
  })();
}
