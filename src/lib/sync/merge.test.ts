import { describe, expect, it } from 'vitest';
import { RemoteRow, TableState, acked, detect, emptyTable, mergeRemote, pullFrom, stableJson } from './merge';

const T0 = 1_000_000;
const row = (id: string, json: string | null, at: number, serverAt = new Date(at).toISOString()): RemoteRow => ({ id, json, at, serverAt });

/** A table that has already synced `rows` with the server. */
function synced(rows: Record<string, string>, at = T0): TableState {
  const base: TableState['base'] = {};
  for (const id in rows) base[id] = { json: rows[id], at };
  return { base, dirty: {}, cursor: new Date(at).toISOString() };
}

describe('detect', () => {
  it('marks everything on a first sign-in', () => {
    const t = detect(emptyTable(), { a: '1', b: '2' }, T0);
    expect(t.dirty).toEqual({ a: { json: '1', at: T0 }, b: { json: '2', at: T0 } });
  });

  it('marks edits and deletions, not untouched rows', () => {
    const t = detect(synced({ a: '1', b: '2', c: '3' }), { a: '1', b: '2!' }, T0 + 5);
    expect(t.dirty).toEqual({ b: { json: '2!', at: T0 + 5 }, c: { json: null, at: T0 + 5 } });
  });

  it('keeps the first edit time until the row changes again', () => {
    let t = detect(synced({ a: '1' }), { a: '2' }, T0 + 1);
    t = detect(t, { a: '2' }, T0 + 2);
    expect(t.dirty.a.at).toBe(T0 + 1);
    t = detect(t, { a: '3' }, T0 + 3);
    expect(t.dirty.a).toEqual({ json: '3', at: T0 + 3 });
  });

  it('forgets an edit that was undone before it was sent', () => {
    let t = detect(synced({ a: '1' }), {}, T0 + 1);
    expect(t.dirty.a.json).toBeNull();
    t = detect(t, { a: '1' }, T0 + 2);
    expect(t.dirty).toEqual({});
  });

  it("forgets a new row deleted before it was sent", () => {
    let t = detect(emptyTable(), { a: '1' }, T0);
    t = detect(t, {}, T0 + 1);
    expect(t.dirty).toEqual({});
  });

  it('returns the same object when nothing changed', () => {
    const t = synced({ a: '1' });
    expect(detect(t, { a: '1' }, T0 + 1)).toBe(t);
  });

  it("brings back a row someone else deleted if it's edited here again", () => {
    const t = detect(synced({ a: null as unknown as string }), { a: '2' }, T0 + 1);
    expect(t.dirty.a).toEqual({ json: '2', at: T0 + 1 });
  });
});

describe('mergeRemote', () => {
  it('adds, changes and removes rows from the server', () => {
    const { table, apply } = mergeRemote(synced({ a: '1', b: '2' }), [row('a', '1!', T0 + 1), row('b', null, T0 + 1), row('c', '3', T0 + 1)]);
    expect(apply).toEqual({ a: '1!', b: null, c: '3' });
    expect(table.base.c).toEqual({ json: '3', at: T0 + 1 });
    expect(table.cursor).toBe(new Date(T0 + 1).toISOString());
  });

  it('keeps a newer local edit and still sends it', () => {
    const t = detect(synced({ a: '1' }), { a: 'mine' }, T0 + 10);
    const { table, apply } = mergeRemote(t, [row('a', 'theirs', T0 + 5)]);
    expect(apply).toEqual({});
    expect(table.dirty.a).toEqual({ json: 'mine', at: T0 + 10 });
    expect(table.base.a).toEqual({ json: 'theirs', at: T0 + 5 });
  });

  it('takes a newer remote edit over an older local one', () => {
    const t = detect(synced({ a: '1' }), { a: 'mine' }, T0 + 5);
    const { table, apply } = mergeRemote(t, [row('a', 'theirs', T0 + 10)]);
    expect(apply).toEqual({ a: 'theirs' });
    expect(table.dirty).toEqual({});
  });

  it('lets the server win a tie, so both devices agree', () => {
    const t = detect(synced({ a: '1' }), { a: 'mine' }, T0 + 5);
    expect(mergeRemote(t, [row('a', 'theirs', T0 + 5)]).apply).toEqual({ a: 'theirs' });
  });

  it('lets a newer remote delete beat an older local edit', () => {
    const t = detect(synced({ a: '1' }), { a: 'mine' }, T0 + 5);
    expect(mergeRemote(t, [row('a', null, T0 + 9)]).apply).toEqual({ a: null });
  });

  it('ignores rows it has already seen (pulls overlap)', () => {
    const t = synced({ a: '1' }, T0 + 10);
    const { table, apply } = mergeRemote(t, [row('a', '1', T0 + 10), row('a', 'older', T0 + 2)]);
    expect(apply).toEqual({});
    expect(table.base.a).toEqual({ json: '1', at: T0 + 10 });
  });

  it('never moves the cursor backwards', () => {
    const t = { ...synced({}), cursor: '2026-10-17T10:00:00.000Z' };
    expect(mergeRemote(t, [row('a', '1', T0, '2026-10-17T09:59:30.000Z')]).table.cursor).toBe('2026-10-17T10:00:00.000Z');
  });

  it('two devices editing different rows both keep both edits', () => {
    // Phone and laptop start in sync, each edits a different chore offline.
    let phone = detect(synced({ a: '1', b: '2' }), { a: 'phone', b: '2' }, T0 + 1);
    let laptop = detect(synced({ a: '1', b: '2' }), { a: '1', b: 'laptop' }, T0 + 2);
    // Phone pushes first.
    phone = acked(phone, phone.dirty, { a: T0 + 1 }).table;
    // Laptop pulls the phone's edit, then pushes its own; phone pulls that.
    const l = mergeRemote(laptop, [row('a', 'phone', T0 + 1)]);
    laptop = acked(l.table, l.table.dirty, { b: T0 + 2 }).table;
    const p = mergeRemote(phone, [row('a', 'phone', T0 + 1), row('b', 'laptop', T0 + 2)]);
    expect(l.apply).toEqual({ a: 'phone' });
    expect(p.apply).toEqual({ b: 'laptop' });
    expect(laptop.dirty).toEqual({});
    expect(p.table.dirty).toEqual({});
  });
});

describe('acked', () => {
  it('turns accepted rows into the base', () => {
    const t = detect(synced({ a: '1' }), { a: '2' }, T0 + 1);
    const { table, rejected } = acked(t, t.dirty, { a: T0 + 1 });
    expect(rejected).toEqual([]);
    expect(table.dirty).toEqual({});
    expect(table.base.a).toEqual({ json: '2', at: T0 + 1 });
  });

  it('keeps a row dirty when it was edited again during the push', () => {
    const t = detect(synced({ a: '1' }), { a: '2' }, T0 + 1);
    const sent = t.dirty;
    const during = detect(t, { a: '3' }, T0 + 2);
    const { table } = acked(during, sent, { a: T0 + 1 });
    expect(table.dirty.a).toEqual({ json: '3', at: T0 + 2 });
    expect(table.base.a.json).toBe('2');
  });

  it("reports rows the server skipped because it had a newer one", () => {
    const t = detect(synced({ a: '1' }), { a: '2' }, T0 + 1);
    const { table, rejected } = acked(t, t.dirty, {});
    expect(rejected).toEqual(['a']);
    expect(table.dirty.a.json).toBe('2'); // until the newer row is pulled and wins
  });

  it("uses the server's time when it pulled a future clock back", () => {
    const t = detect(synced({ a: '1' }), { a: '2' }, T0 + 1e9);
    expect(acked(t, t.dirty, { a: T0 + 5 }).table.base.a.at).toBe(T0 + 5);
  });
});

describe('helpers', () => {
  it('stableJson ignores key order', () => {
    expect(stableJson({ b: 1, a: { d: [1, { y: 1, x: 2 }], c: null } })).toBe(stableJson({ a: { c: null, d: [1, { x: 2, y: 1 }] }, b: 1 }));
  });

  it('pullFrom starts a minute early', () => {
    expect(pullFrom(null)).toBeNull();
    expect(pullFrom('2026-10-17T10:00:00.000Z')).toBe('2026-10-17T09:59:00.000Z');
  });
});
