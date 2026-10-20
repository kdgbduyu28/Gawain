// A simulated device for end-to-end sync tests: the app's real store and sync
// engine, with in-memory storage, talking to PGlite through the fake client.
import type { PGlite } from '@electric-sql/pglite';
import { vi } from 'vitest';
import { fakeSupabase } from './fakeSupabase';

export const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

/** A fresh copy of the app's store and sync engine, with its own storage, signed in as `user`. */
export async function simulatedDevice(db: PGlite, user: { id: string; email: string }) {
  vi.resetModules();
  const storage = new Map<string, string>();
  vi.doMock('@react-native-async-storage/async-storage', () => ({
    default: {
      getItem: async (k: string) => storage.get(k) ?? null,
      setItem: async (k: string, v: string) => void storage.set(k, v),
      removeItem: async (k: string) => void storage.delete(k),
    },
  }));
  vi.doMock('react-native', () => ({ AppState: { addEventListener: () => ({ remove() {} }), currentState: 'background' }, Platform: { OS: 'web' } }));
  vi.doMock('../../src/lib/supabase', () => ({ supabase: fakeSupabase(db, user) }));
  const { useHome } = await import('../../src/store/useHome');
  const { useMeals } = await import('../../src/store/useMeals');
  const sync = await import('../../src/lib/sync/engine');
  sync.startSync();
  while (!useHome.persist.hasHydrated() || !useMeals.persist.hasHydrated()) await tick();
  await tick(20);
  const home = () => useHome.getState();
  return {
    home,
    meals: () => useMeals.getState(),
    useMeals,
    sync,
    useSync: sync.useSync,
    /** Sync and wait until nothing more is queued. */
    run: async () => {
      await sync.syncNow();
      await tick();
      await sync.syncNow();
    },
    choreNames: () => home().chores.map((c) => c.name).sort(),
  };
}

