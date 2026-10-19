// Just enough of supabase-js for the sync engine, answered by PGlite as the
// signed-in user, so the engine's real queries run against the real policies.
import type { PGlite } from '@electric-sql/pglite';
import { asUser } from './pg';

type Result = { data: any; error: { message: string } | null };

class Query implements PromiseLike<Result> {
  private cols = '*';
  private where: { sql: string; val: unknown }[] = [];
  private orders: string[] = [];
  private lim: number | null = null;
  private rows: Record<string, unknown>[] | null = null;
  private conflict = '';

  constructor(private db: PGlite, private user: string, private table: string) {}

  select(cols: string) {
    this.cols = cols;
    return this;
  }
  eq(col: string, val: unknown) {
    this.where.push({ sql: `${col} = $`, val });
    return this;
  }
  gt(col: string, val: unknown) {
    this.where.push({ sql: `${col} > $`, val });
    return this;
  }
  gte(col: string, val: unknown) {
    this.where.push({ sql: `${col} >= $`, val });
    return this;
  }
  in(col: string, val: unknown[]) {
    this.where.push({ sql: `${col}::text = any($`, val: val.map(String) });
    return this;
  }
  order(col: string) {
    this.orders.push(col);
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  upsert(rows: Record<string, unknown>[], opts: { onConflict: string }) {
    this.rows = rows;
    this.conflict = opts.onConflict;
    return this;
  }

  private sql(): { sql: string; params: unknown[] } {
    const t = `public.${this.table}`;
    if (this.rows) {
      const keys = Object.keys(this.rows[0]);
      return {
        sql: `insert into ${t} (${keys.join(', ')}) select ${keys.join(', ')} from jsonb_populate_recordset(null::${t}, $1)
              on conflict (${this.conflict}) do update set ${keys.map((k) => `${k} = excluded.${k}`).join(', ')}
              returning ${this.cols}`,
        params: [JSON.stringify(this.rows)],
      };
    }
    const params: unknown[] = [];
    const where = this.where.map((w) => {
      params.push(w.val);
      return w.sql + params.length + (w.sql.includes('any(') ? ')' : '');
    });
    return {
      sql: `select ${this.cols} from ${t}${where.length ? ` where ${where.join(' and ')}` : ''}${this.orders.length ? ` order by ${this.orders.join(', ')}` : ''}${this.lim ? ` limit ${this.lim}` : ''}`,
      params,
    };
  }

  then<A, B>(ok?: ((r: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    const { sql, params } = this.sql();
    return asUser(this.db, this.user, sql, params)
      .then((data) => ({ data, error: null }), (e: Error) => ({ data: null, error: { message: e.message } }))
      .then(ok, bad);
  }
}

export function fakeSupabase(db: PGlite, user: { id: string; email: string }) {
  let signedIn = true;
  return {
    from: (table: string) => new Query(db, user.id, table),
    rpc: async (fn: string): Promise<Result> => {
      try {
        const [row] = await asUser<{ r: unknown }>(db, user.id, `select public.${fn}() as r`);
        return { data: row.r, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
    auth: {
      getSession: async () => ({ data: { session: signedIn ? { user } : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => {
        signedIn = false;
        return { error: null };
      },
    },
  };
}
