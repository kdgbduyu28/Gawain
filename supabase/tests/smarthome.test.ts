// Smart home: the household link, events posted to it without signing in, who
// can see what, and the whole trip from a button press to every device.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { simulatedDevice } from './device';
import { asUser, createDb } from './pg';

const A = { id: '00000000-0000-0000-0000-0000000000a1', email: 'a@example.com' };
const B = { id: '00000000-0000-0000-0000-0000000000b2', email: 'b@example.com' };

let db: PGlite;
const as = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) => asUser<T>(db, user, sql, params);
const one = async <T,>(user: string | null, sql: string, params: unknown[] = []) => (await as<{ r: T }>(user, sql, params))[0].r;

const newHook = (user: string) => one<string>(user, 'select public.new_home_hook() as r');
const post = (token: string, trigger: string, event = '') => one<string>(null, 'select public.post_home_event($1, $2, $3) as r', [token, trigger, event]);

beforeAll(async () => {
  db = await createDb([A.id, B.id]);
}, 60_000);
afterAll(() => db?.close());

describe('home link and events', () => {
  let token: string;

  it('makes a secret link for the household, readable once', async () => {
    expect(await one(A.id, 'select public.home_hook_made_at() as r')).toBeNull();
    token = await newHook(A.id);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await one(A.id, 'select public.home_hook_made_at() as r')).toBeInstanceOf(Date);
    // Only a hash is stored, and nobody can read the table through the API.
    const stored = await db.query<{ token_hash: Uint8Array }>('select token_hash from public.home_hooks');
    expect(Buffer.from(stored.rows[0].token_hash).toString('utf8')).not.toContain(token);
    await expect(as(A.id, 'select * from public.home_hooks')).rejects.toThrow(/permission denied/);
    await expect(as(null, 'select * from public.home_hooks')).rejects.toThrow(/permission denied/);
    await expect(as(null, 'select public.new_home_hook()')).rejects.toThrow(/permission denied/);
  });

  it('takes events from anyone holding the link', async () => {
    expect(await post(token, ' Washer ', 'Finished')).toBe('ok');
    const rows = await as<{ trigger_key: string; event: string }>(A.id, 'select trigger_key, event from public.home_events');
    expect(rows).toEqual([{ trigger_key: 'washer', event: 'finished' }]);
  });

  it('turns away wrong links and odd trigger names', async () => {
    expect(await post('f'.repeat(64), 'washer')).toBe('unknown-link');
    expect(await post('not a token', 'washer')).toBe('unknown-link');
    expect(await post(token, 'washer; drop table')).toBe('bad-trigger');
    expect(await post(token, '')).toBe('bad-trigger');
    expect(await post(token, 'washer', 'x'.repeat(40))).toBe('bad-trigger');
  });

  it('keeps events inside the household', async () => {
    expect(await as(B.id, 'select * from public.home_events')).toEqual([]);
    await expect(as(null, 'select * from public.home_events')).rejects.toThrow(/permission denied/);
    await expect(as(A.id, `insert into public.home_events (household_id, trigger_key) select household_id, 'x' from public.household_members limit 1`)).rejects.toThrow(
      /permission denied/,
    );
    expect(await one(B.id, 'select public.home_hook_made_at() as r')).toBeNull();
    // B turning off "their" link leaves A's alone.
    await as(B.id, 'select public.remove_home_hook()');
    expect(await post(token, 'washer')).toBe('ok');
  });

  it('stops the old link when a new one is made, and when turned off', async () => {
    const fresh = await newHook(A.id);
    expect(fresh).not.toBe(token);
    expect(await post(token, 'washer')).toBe('unknown-link');
    expect(await post(fresh, 'washer')).toBe('ok');
    await as(A.id, 'select public.remove_home_hook()');
    expect(await post(fresh, 'washer')).toBe('unknown-link');
    expect(await one(A.id, 'select public.home_hook_made_at() as r')).toBeNull();
  });

  it('limits a runaway automation and forgets events after two weeks', async () => {
    const t = await newHook(A.id);
    await db.exec(`insert into public.home_events (household_id, trigger_key, at) select household_id, 'old', now() - interval '15 days' from public.household_members where user_id = '${A.id}'`);
    await db.exec('delete from public.home_events where trigger_key = \'washer\'');
    for (let i = 0; i < 120; i++) await post(t, 'loop');
    expect(await post(t, 'loop')).toBe('too-many');
    const old = await db.query(`select 1 from public.home_events where trigger_key = 'old'`);
    expect(old.rows).toEqual([]);
    await db.exec('delete from public.home_events');
  });

  it('syncs triggers within the household only', async () => {
    const [{ h }] = await as<{ h: string }>(A.id, 'select public.ensure_household() as h');
    await as(A.id, `insert into public.triggers (household_id, id, data, updated_at) values ($1, 't1', '{"key":"washer"}', now())`, [h]);
    expect(await as(B.id, 'select * from public.triggers')).toEqual([]);
    await expect(as(B.id, `insert into public.triggers (household_id, id, data, updated_at) values ($1, 't2', '{}', now())`, [h])).rejects.toThrow(/row-level security/);
    await db.exec('delete from public.triggers');
  });
});

describe('from a button press to every device', () => {
  it('marks the chore done once, everywhere', async () => {
    const laptop = await simulatedDevice(db, A);
    laptop.home().welcome(['Take out the trash', 'Wash the dishes'], []);
    const trash = laptop.home().chores.find((c) => c.name === 'Take out the trash')!;
    laptop.home().saveTrigger({ key: 'trash', name: 'Trash button', icon: 'x', kind: 'chore', choreId: trash.id, minutes: 45 });
    laptop.home().saveTrigger({ key: 'washer', name: 'Washer', icon: 'water-outline', kind: 'appliance', choreId: null, minutes: 45 });
    await laptop.run();
    expect(laptop.useSync.getState()).toMatchObject({ status: 'idle', error: null });

    const token = await newHook(A.id);
    expect(await post(token, 'trash', 'pressed')).toBe('ok');
    expect(await post(token, 'washer', 'started')).toBe('ok');
    await laptop.run();

    expect(laptop.home().chores.find((c) => c.id === trash.id)!.lastDone).not.toBeNull();
    expect(laptop.home().history).toHaveLength(1);
    expect(laptop.home().timers).toEqual([expect.objectContaining({ label: 'Washer' })]);

    // A new device gets the triggers and the done chore, and applying the same
    // events there doesn't count the press twice.
    const phone = await simulatedDevice(db, A);
    await phone.run();
    expect(phone.home().triggers.map((t) => t.key).sort()).toEqual(['trash', 'washer']);
    expect(phone.home().history).toHaveLength(1);
    expect(phone.home().timers).toEqual([expect.objectContaining({ label: 'Washer' })]);
    const history = await db.query('select 1 from public.done_history where not deleted');
    expect(history.rows).toHaveLength(1);

    // The next press goes to both, and nothing is applied twice on later syncs.
    expect(await post(token, 'washer', 'finished')).toBe('ok');
    await phone.run();
    await laptop.run();
    await phone.run();
    for (const d of [laptop, phone]) {
      expect(d.home().timers).toEqual([expect.objectContaining({ label: 'Washer', finishedAt: expect.any(Number) })]);
      expect(d.home().history).toHaveLength(1);
    }
  });
});
