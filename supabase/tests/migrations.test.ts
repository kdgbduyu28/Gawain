// Applies supabase/migrations to an in-memory Postgres, then checks the policies
// and the merge trigger as a signed-in user would hit them through the API.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createDb } from './pg';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';

let db: PGlite;
const as = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) => asUser<T>(db, user, sql, params);

const upsertChore = (user: string, hid: string, id: string, data: object, updatedAt: string, deleted = false) =>
  as<{ id: string; updated_at: Date }>(
    user,
    `insert into public.chores (household_id, id, data, updated_at, deleted) values ($1, $2, $3, $4, $5)
     on conflict (household_id, id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted
     returning id, updated_at`,
    [hid, id, JSON.stringify(data), updatedAt, deleted],
  );

let hidA: string;
let hidB: string;

beforeAll(async () => {
  db = await createDb([A, B]);
  hidA = (await as<{ h: string }>(A, 'select public.ensure_household() as h'))[0].h;
  hidB = (await as<{ h: string }>(B, 'select public.ensure_household() as h'))[0].h;
}, 60_000);

afterAll(() => db?.close());

describe('migrations', () => {
  it('give each user one household, the same one every time', async () => {
    expect(hidA).toMatch(/^[0-9a-f-]{36}$/);
    expect(hidB).not.toBe(hidA);
    const again = await as<{ h: string }>(A, 'select public.ensure_household() as h');
    expect(again[0].h).toBe(hidA);
    const mine = await as(A, 'select * from public.household_members');
    expect(mine).toEqual([expect.objectContaining({ household_id: hidA, user_id: A, role: 'owner' })]);
    expect(await as(A, 'select id from public.households')).toEqual([{ id: hidA }]);
  });

  it("refuse anonymous visitors", async () => {
    await expect(as(null, 'select * from public.chores')).rejects.toThrow(/permission denied/);
    await expect(as(null, 'select public.ensure_household()')).rejects.toThrow(/permission denied/);
  });

  it("keep households apart", async () => {
    await upsertChore(A, hidA, 'c1', { name: 'Dishes' }, '2026-10-17T01:00:00Z');
    expect(await as(B, 'select * from public.chores')).toEqual([]);
    await expect(upsertChore(B, hidA, 'sneaky', { name: 'x' }, '2026-10-17T01:00:00Z')).rejects.toThrow(/row-level security/);
    // B's update of A's row matches nothing.
    expect(await as(B, `update public.chores set deleted = true where id = 'c1' returning id`)).toEqual([]);
    // Nobody joins a household by writing the membership row themselves.
    await expect(as(B, `insert into public.household_members (household_id, user_id) values ('${hidA}', '${B}')`)).rejects.toThrow(/permission denied/);
  });

  it('stamp server_at and who wrote it', async () => {
    const [row] = await as<{ server_at: Date; updated_by: string }>(A, `select server_at, updated_by from public.chores where id = 'c1'`);
    expect(row.updated_by).toBe(A);
    expect(row.server_at).toBeInstanceOf(Date);
  });

  it('keep the newer edit when an older one arrives late', async () => {
    await upsertChore(A, hidA, 'c2', { name: 'new' }, '2026-10-17T03:00:00Z');
    const stale = await upsertChore(A, hidA, 'c2', { name: 'old' }, '2026-10-17T02:00:00Z');
    expect(stale).toEqual([]); // skipped, so the device knows to pull
    const [row] = await as<{ data: { name: string } }>(A, `select data from public.chores where id = 'c2'`);
    expect(row.data.name).toBe('new');
    const newer = await upsertChore(A, hidA, 'c2', { name: 'newer' }, '2026-10-17T04:00:00Z');
    expect(newer).toHaveLength(1);
  });

  it("don't let a clock in the future win forever", async () => {
    const [row] = await upsertChore(A, hidA, 'c3', { name: 'x' }, '2099-01-01T00:00:00Z');
    expect(row.updated_at.getTime()).toBeLessThan(Date.now() + 6 * 60_000);
  });

  it('soft-delete instead of delete', async () => {
    await upsertChore(A, hidA, 'c1', { name: 'Dishes' }, '2026-10-17T05:00:00Z', true);
    const [row] = await as<{ deleted: boolean }>(A, `select deleted from public.chores where id = 'c1'`);
    expect(row.deleted).toBe(true);
    await expect(as(A, `delete from public.chores where id = 'c1'`)).rejects.toThrow(/permission denied/);
  });

  it('keep personal rows personal', async () => {
    await as(A, `insert into public.blocks (user_id, id, data, updated_at) values ('${A}', 'b1', '{"title":"Standup"}', now())`);
    await as(A, `insert into public.settings (user_id, id, data, updated_at) values ('${A}', 'settings', '{}', now())`);
    expect(await as(B, 'select * from public.blocks')).toEqual([]);
    expect(await as(B, 'select * from public.settings')).toEqual([]);
    await expect(as(B, `insert into public.settings (user_id, id, data, updated_at) values ('${A}', 'x', '{}', now())`)).rejects.toThrow(/row-level security/);
    // Same row ids for different people don't collide.
    await as(B, `insert into public.settings (user_id, id, data, updated_at) values ('${B}', 'settings', '{}', now())`);
  });

  it('apply the same rules to history and items', async () => {
    for (const t of ['done_history', 'items']) {
      await as(A, `insert into public.${t} (household_id, id, data, updated_at) values ('${hidA}', 'r1', '{}', now())`);
      expect(await as(B, `select * from public.${t}`)).toEqual([]);
      const [row] = await as<{ updated_by: string }>(A, `select updated_by from public.${t}`);
      expect(row.updated_by).toBe(A);
    }
  });

  it('reject rows that are not JSON objects', async () => {
    await expect(as(A, `insert into public.items (household_id, id, data, updated_at) values ('${hidA}', 'bad', '[1]', now())`)).rejects.toThrow(/check constraint/);
  });
});
