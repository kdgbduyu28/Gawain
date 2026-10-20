import { describe, expect, it } from 'vitest';
import type { Chore, Done } from '../chores';
import type { Item } from '../pantry';
import { MAX_HISTORY, SETTINGS_ID, Synced, TABLES, TableName, historyId } from './tables';

const spec = (n: TableName) => TABLES.find((t) => t.name === n)!;

const chore = (id: string, name = id): Chore => ({ id, name, room: 'Kitchen', everyDays: 7, minutes: 10, where: 'home', lastDone: null, createdAt: 1, snoozedUntil: null });
const item = (id: string, store: string | null = null): Item => ({ id, name: id, aisle: 'Other', store, note: '', level: 'full', onList: false, tracked: true, lastsDays: null, bought: [], addedAt: 1 });

function state(extra: Partial<Synced> = {}): Synced {
  return {
    chores: [],
    history: [],
    items: [],
    blocks: [],
    triggers: [],
    settings: { schedule: { workStart: '09:00' }, digest: '08:00', gapNudges: true, theme: 'dark', icsUrls: ['https://secret'] },
    meals: { profile: null, plan: null, cooked: [], chores: {}, stock: {}, tank: { since: null, size: 11, lasted: [] }, trips: [], bagyoUntil: null },
    ...extra,
  };
}

describe('tables', () => {
  it('round-trips chores, keeping order and removing deleted ones', () => {
    const s = state({ chores: [chore('a'), chore('b'), chore('c')] });
    const rows = spec('chores').rows(s);
    const out = spec('chores').write(s, { b: null, a: rows.a.replace('"a"}', '"a!"}'), d: rows.c.replace(/"c"/g, '"d"') });
    expect(out.chores!.map((c) => c.id)).toEqual(['a', 'c', 'd']);
    expect(spec('chores').rows({ ...s, ...out }).d).toBe(rows.c.replace(/"c"/g, '"d"'));
  });

  it("doesn't sync which store an item is bought at, and keeps the local one", () => {
    const s = state({ items: [item('rice', 'place-1')] });
    const j = spec('items').rows(s).rice;
    expect(j).not.toContain('place-1');
    const out = spec('items').write(s, { rice: j.replace('"level":"full"', '"level":"low"'), eggs: j.replace(/rice/g, 'eggs') });
    expect(out.items!.find((i) => i.id === 'rice')).toMatchObject({ level: 'low', store: 'place-1' });
    expect(out.items!.find((i) => i.id === 'eggs')!.store).toBeNull();
  });

  it('gives history rows a stable id and keeps them in time order, capped', () => {
    const h: Done[] = [{ choreId: 'a', at: 5, late: 0 }];
    const s = state({ history: h });
    expect(Object.keys(spec('done_history').rows(s))).toEqual([historyId(h[0])]);
    const out = spec('done_history').write(s, { 'a@1': JSON.stringify({ choreId: 'a', at: 1, late: 2 }), 'bad@2': '{"nope":1}' });
    expect(out.history).toEqual([{ choreId: 'a', at: 1, late: 2 }, h[0]]);
    const many = Object.fromEntries(Array.from({ length: MAX_HISTORY + 5 }, (_, i) => [`x@${i + 10}`, JSON.stringify({ choreId: 'x', at: i + 10, late: 0 })]));
    expect(spec('done_history').write(s, many).history).toHaveLength(MAX_HISTORY);
  });

  it('syncs work hours and reminder choices but not calendar links or theme', () => {
    const s = state();
    const j = spec('settings').rows(s)[SETTINGS_ID];
    expect(JSON.parse(j)).toEqual({ digest: '08:00', gapNudges: true, schedule: { workStart: '09:00' } });
    const out = spec('settings').write(s, { [SETTINGS_ID]: JSON.stringify({ digest: null, gapNudges: false, schedule: { workEnd: '17:00' }, theme: 'light', icsUrls: [] }) });
    expect(out.settings).toMatchObject({ digest: null, gapNudges: false, theme: 'dark', icsUrls: ['https://secret'], schedule: { workStart: '09:00', workEnd: '17:00' } });
  });

  it('ignores a deleted settings row', () => {
    expect(spec('settings').write(state(), { [SETTINGS_ID]: null })).toEqual({});
  });

  it('splits the meal planner into rows that merge separately', () => {
    const profile = { budget: 3000 } as unknown as NonNullable<Synced['meals']['profile']>;
    const plan = { slots: [], grocery: [] } as unknown as NonNullable<Synced['meals']['plan']>;
    const s = state({
      meals: {
        profile,
        plan,
        cooked: ['1-dinner'],
        chores: { '1-dinner': 'c1' },
        stock: { tomato: { qty: 500, at: 7 } },
        tank: { since: 5, size: 11, lasted: [40] },
        trips: [{ id: 't1', at: 3, by: 'Ana', amount: 850, note: 'Palengke' }],
        bagyoUntil: 99,
      },
    });
    const rows = spec('meals').rows(s);
    expect(Object.keys(rows).sort()).toEqual(['bagyo', 'cook:1-dinner', 'link:1-dinner', 'plan', 'profile', 'stock:tomato', 'tank', 'trip:t1']);
    expect(JSON.parse(rows['trip:t1'])).toEqual({ at: 3, by: 'Ana', amount: 850, note: 'Palengke' });
    expect(JSON.parse(rows['link:1-dinner'])).toEqual({ chore: 'c1' });
    const out = spec('meals').write(s, {
      'cook:1-dinner': null,
      'cook:2-lunch': '{}',
      'link:2-lunch': '{"chore":"c2"}',
      'stock:tomato': null,
      'stock:egg': '{"at":9,"qty":6}',
      'stock:bad': '{"qty":"lots"}',
      plan: null,
      'trip:t1': null,
      'trip:t2': '{"at":8,"by":"Tim","amount":420,"note":""}',
      bagyo: null,
    }).meals!;
    expect(out).toEqual({
      profile,
      plan: null,
      cooked: ['2-lunch'],
      chores: { '1-dinner': 'c1', '2-lunch': 'c2' },
      stock: { egg: { qty: 6, at: 9 } },
      tank: { since: 5, size: 11, lasted: [40] },
      trips: [{ id: 't2', at: 8, by: 'Tim', amount: 420, note: '' }],
      bagyoUntil: null,
    });
  });
});
