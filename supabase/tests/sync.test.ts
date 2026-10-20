// End-to-end sync between simulated devices: each one is a fresh copy of the
// app's store and the sync engine with its own storage, talking to the same
// database (PGlite with the real migrations and policies).
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { simulatedDevice, tick } from './device';
import { createDb } from './pg';
import { makePlan } from '../../src/lib/meals/planner';
import { NCR, priceBook } from '../../src/lib/meals/prices';

const MEAL_ANSWERS = { shop: 'palengke', area: NCR, adults: 2, kids: 0, meals: ['lunch', 'dinner'], days: [0, 1, 2, 3, 4, 5, 6], equipment: ['stove', 'rice_cooker'], diets: [], cuisines: ['filipino'], vibes: [], allergies: [], dislikes: [], have: [], budget: 3000 } satisfies Parameters<typeof makePlan>[0];

const ME = { id: '00000000-0000-0000-0000-0000000000a1', email: 'me@example.com' };
const OTHER = { id: '00000000-0000-0000-0000-0000000000b2', email: 'other@example.com' };

let db: PGlite;

beforeAll(async () => {
  db = await createDb([ME.id, OTHER.id]);
}, 60_000);
afterAll(() => db?.close());

const device = (user: { id: string; email: string }) => simulatedDevice(db, user);

type Device = Awaited<ReturnType<typeof device>>;
let laptop: Device;
let phone: Device;

describe('sync between devices', () => {
  it('uploads what was on the first device when it signs in', async () => {
    laptop = await device(ME);
    laptop.home().welcome(['Wash the dishes', 'Take out the trash'], ['Rice', 'Eggs']);
    laptop.home().saveBlock({ title: 'Standup', days: [1, 2, 3, 4, 5], start: '09:30', end: '09:45' });
    laptop.home().setSettings({ icsUrls: ['https://calendar.google.com/secret/basic.ics'], theme: 'dark' });
    await laptop.run();
    expect(laptop.useSync.getState()).toMatchObject({ status: 'idle', error: null, pending: 0 });
    const counts = await db.query<{ t: string; n: number }>(
      `select 'chores' t, count(*)::int n from chores union all select 'items', count(*)::int from items union all select 'blocks', count(*)::int from blocks`,
    );
    expect(counts.rows).toEqual([
      { t: 'chores', n: 2 },
      { t: 'items', n: 2 },
      { t: 'blocks', n: 1 },
    ]);
  });

  it("keeps calendar links and theme off the server", async () => {
    const all = await db.query<{ data: unknown }>('select data from settings');
    expect(JSON.stringify(all.rows)).not.toMatch(/secret|icsUrls|theme/);
  });

  it('brings everything to a new, empty device', async () => {
    phone = await device(ME);
    expect(phone.home().settings.welcomed).toBe(false);
    await phone.run();
    expect(phone.choreNames()).toEqual(['Take out the trash', 'Wash the dishes']);
    expect(phone.home().items.map((i) => i.name).sort()).toEqual(['Eggs', 'Rice']);
    expect(phone.home().blocks).toHaveLength(1);
    expect(phone.home().settings.welcomed).toBe(true);
    expect(phone.home().settings.icsUrls).toEqual([]);
  });

  it('syncs edits, done chores and deletes both ways', async () => {
    const dishes = phone.home().chores.find((c) => c.name === 'Wash the dishes')!;
    phone.home().markDone(dishes.id);
    const eggs = phone.home().items.find((i) => i.name === 'Eggs')!;
    phone.home().setLevel(eggs.id, 'low');
    await phone.run();

    const rice = laptop.home().items.find((i) => i.name === 'Rice')!;
    laptop.home().removeItem(rice.id);
    await laptop.run();

    expect(laptop.home().chores.find((c) => c.id === dishes.id)!.lastDone).not.toBeNull();
    expect(laptop.home().history).toHaveLength(1);
    expect(laptop.home().items.map((i) => [i.name, i.level, i.onList])).toEqual([['Eggs', 'low', true]]);

    await phone.run();
    expect(phone.home().items.map((i) => i.name)).toEqual(['Eggs']);
    const deleted = await db.query<{ deleted: boolean; data: object }>(`select deleted, data from items where id = $1`, [rice.id]);
    expect(deleted.rows).toEqual([{ deleted: true, data: {} }]);
  });

  it('keeps the later edit when both devices change the same chore', async () => {
    const trash = laptop.home().chores.find((c) => c.name === 'Take out the trash')!;
    laptop.home().saveChore({ ...trash, name: 'Trash (laptop)' });
    await tick(5);
    phone.home().saveChore({ ...trash, name: 'Trash (phone)' });
    await laptop.run();
    await phone.run();
    await laptop.run();
    expect(laptop.choreNames()).toContain('Trash (phone)');
    expect(phone.choreNames()).toContain('Trash (phone)');
  });

  it('shares the meal plan, cooked dishes and kitchen stock with the household', async () => {
    const profile = { ...MEAL_ANSWERS, cooks: ['Tim', 'Ana'] };
    const plan = makePlan(profile, priceBook(null, 'palengke'), { seed: 4, start: 1 });
    laptop.useMeals.setState({ profile, plan });
    await laptop.run();
    await phone.run();
    expect(phone.meals().profile?.cooks).toEqual(['Tim', 'Ana']);
    expect(phone.meals().plan?.slots.map((x) => x.recipeId)).toEqual(plan.slots.map((x) => x.recipeId));

    // The phone adds a dish to Chores; the laptop buys groceries. Both land on both.
    const slot = plan.slots.find((x) => x.cook)!;
    const choreId = phone.home().saveChore({ name: 'Cook it', room: 'Kitchen', everyDays: null, minutes: 30, where: 'home' });
    phone.meals().linkChore(slot.key, choreId);
    laptop.home().addToList('Tomatoes');
    const tomatoes = laptop.home().items.find((i) => i.name === 'Tomatoes')!;
    laptop.home().saveItem({ ...tomatoes, note: '½ kilo' });
    laptop.home().buy(tomatoes.id);
    phone.home().addToList('Eggs');
    phone.home().buy(phone.home().items.find((i) => i.name === 'Eggs')!.id);
    expect(laptop.meals().stock.tomato.qty).toBe(500);
    await phone.run();
    await laptop.run();
    await phone.run();
    expect(laptop.meals().chores[slot.key]).toBe(choreId);
    expect(Object.keys(phone.meals().stock).sort()).toEqual(Object.keys(laptop.meals().stock).sort());
    expect(phone.meals().stock.tomato.qty).toBe(500);

    // Finishing the Cook chore on the laptop marks the dish cooked everywhere.
    await laptop.run();
    laptop.home().markDone(choreId);
    expect(laptop.meals().cooked).toEqual([slot.key]);
    await laptop.run();
    await phone.run();
    expect(phone.meals().cooked).toEqual([slot.key]);

    // Prices are never uploaded.
    const rows = await db.query<{ id: string }>('select id from meals where not deleted order by id');
    expect(rows.rows.map((r) => r.id)).toEqual(expect.arrayContaining(['plan', 'profile', `cook:${slot.key}`, `link:${slot.key}`, 'stock:tomato']));
    expect(JSON.stringify(rows.rows)).not.toMatch(/book|psaPeriod/);

    // A new plan clears cooked dishes on the other device too.
    laptop.useMeals.setState({ plan: makePlan(profile, priceBook(null, 'palengke'), { seed: 9, start: 1 }), cooked: [], chores: {} });
    await laptop.run();
    await phone.run();
    expect(phone.meals().cooked).toEqual([]);
    expect(phone.meals().plan?.seed).toBe(9);
  });

  it('asks before combining when a third device already has its own data', async () => {
    const tablet = await device(ME);
    tablet.home().welcome(['Do the laundry'], []);
    await tablet.run();
    expect(tablet.useSync.getState().status).toBe('choose');
    // Nothing was sent while waiting.
    expect((await db.query(`select 1 from chores where data->>'name' = 'Do the laundry'`)).rows).toHaveLength(0);

    await tablet.sync.chooseFirstSync('merge');
    await tablet.run();
    expect(tablet.choreNames()).toEqual(['Do the laundry', 'Trash (phone)', 'Wash the dishes']);
    await laptop.run();
    expect(laptop.choreNames()).toEqual(['Do the laundry', 'Trash (phone)', 'Wash the dishes']);
  });

  it('replaces local data with the account when asked', async () => {
    const spare = await device(ME);
    spare.home().welcome(['Clean the fridge'], ['Coffee']);
    await spare.run();
    expect(spare.useSync.getState().status).toBe('choose');
    await spare.sync.chooseFirstSync('replace');
    await spare.run();
    expect(spare.choreNames()).toEqual(['Do the laundry', 'Trash (phone)', 'Wash the dishes']);
    expect(spare.home().items.map((i) => i.name)).toEqual(['Eggs']);
  });

  it("keeps someone else's account separate", async () => {
    const theirs = await device(OTHER);
    theirs.home().welcome(['Water the plants'], []);
    await theirs.run();
    expect(theirs.choreNames()).toEqual(['Water the plants']);
    await laptop.run();
    expect(laptop.choreNames()).not.toContain('Water the plants');
  });

  it('keeps working on the device after signing out', async () => {
    await phone.sync.signOut();
    phone.home().addToList('Bread');
    await phone.run();
    expect(phone.useSync.getState().status).toBe('off');
    expect(phone.home().items.map((i) => i.name)).toContain('Bread');
    await laptop.run();
    expect(laptop.home().items.map((i) => i.name)).not.toContain('Bread');
  });
});
