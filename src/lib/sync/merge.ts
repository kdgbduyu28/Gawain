/**
 * Last-write-wins merging for one synced table, kept free of React, storage and
 * network so it can be tested on its own.
 *
 * Rows are compared as JSON strings of their synced fields. For each table the
 * device remembers:
 *  - base: the server's copy as last seen (pulled, or pushed and accepted)
 *  - dirty: local edits the server hasn't accepted yet, with when they were made
 * A local row that differs from its base is an edit; a base row missing locally
 * was deleted here.
 */

/** A row's synced fields as JSON, or null for a deleted row. */
export type Json = string | null;

export type Version = { json: Json; at: number };

export type TableState = {
  base: Record<string, Version>;
  dirty: Record<string, Version>;
  /** server_at of the newest row pulled (ISO), or null before the first pull. */
  cursor: string | null;
};

export type RemoteRow = { id: string; json: Json; at: number; serverAt: string };

export const emptyTable = (): TableState => ({ base: {}, dirty: {}, cursor: null });

/**
 * Notes what changed locally since the last call. `local` is every row on the
 * device right now, by id. An edit gets `now` as its time; an edit that's
 * already dirty and hasn't changed again keeps its original time.
 */
export function detect(t: TableState, local: Record<string, string>, now: number): TableState {
  let dirty = t.dirty;
  const mark = (id: string, json: Json) => {
    const known = dirty[id] ?? null;
    const base = t.base[id];
    // Same as what the server has (or a row it never heard of, gone again): nothing to send.
    if (base ? base.json === json : json === null) {
      if (known) {
        if (dirty === t.dirty) dirty = { ...dirty };
        delete dirty[id];
      }
      return;
    }
    if (known && known.json === json) return;
    if (dirty === t.dirty) dirty = { ...dirty };
    dirty[id] = { json, at: now };
  };
  for (const id in local) mark(id, local[id]);
  for (const id in t.base) if (!(id in local) && t.base[id].json !== null) mark(id, null);
  for (const id in t.dirty) if (!(id in local) && !(id in t.base)) mark(id, null);
  return dirty === t.dirty ? t : { ...t, dirty };
}

export type Merged = {
  table: TableState;
  /** Rows to write into the local store: new JSON, or null to remove. */
  apply: Record<string, Json>;
};

/**
 * Folds pulled rows in. The newer edit wins; on a tie the server's copy wins so
 * every device lands on the same answer. Rows older than what we already have
 * (pulls overlap a little) change nothing.
 */
export function mergeRemote(t: TableState, rows: RemoteRow[]): Merged {
  const base = { ...t.base };
  const dirty = { ...t.dirty };
  const apply: Record<string, Json> = {};
  let cursor = t.cursor;
  for (const r of rows) {
    if (cursor === null || r.serverAt > cursor) cursor = r.serverAt;
    const seen = base[r.id];
    if (seen && seen.at > r.at) continue;
    base[r.id] = { json: r.json, at: r.at };
    const mine = dirty[r.id];
    if (mine) {
      if (mine.at > r.at) continue; // keep ours; it still gets pushed
      delete dirty[r.id];
    }
    if (!seen || seen.json !== r.json || mine) apply[r.id] = r.json;
  }
  return { table: { base, dirty, cursor }, apply };
}

/**
 * After a push: rows the server accepted become the new base, and stop being
 * dirty unless they were edited again while the push was in flight. Returns the
 * ids the server skipped because it already had something newer.
 */
export function acked(t: TableState, sent: Record<string, Version>, accepted: Record<string, number>): { table: TableState; rejected: string[] } {
  const base = { ...t.base };
  const dirty = { ...t.dirty };
  const rejected: string[] = [];
  for (const id in sent) {
    if (!(id in accepted)) {
      rejected.push(id);
      continue;
    }
    // The server may have pulled a far-future time back to its own clock.
    base[id] = { json: sent[id].json, at: accepted[id] };
    const now = dirty[id];
    if (now && now.json === sent[id].json && now.at === sent[id].at) delete dirty[id];
  }
  return { table: { ...t, base, dirty }, rejected };
}

/** Pulls start a minute before the cursor: a row saved in a transaction that began earlier can commit after a later one. */
export const PULL_OVERLAP_MS = 60_000;

export function pullFrom(cursor: string | null): string | null {
  if (cursor === null) return null;
  return new Date(new Date(cursor).getTime() - PULL_OVERLAP_MS).toISOString();
}

/** JSON with keys in a fixed order, so the same row always gives the same string. */
export function stableJson(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x,
  );
}
