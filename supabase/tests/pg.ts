/// <reference types="node" />
// An in-memory Postgres (PGlite) with a stand-in for Supabase's auth schema and
// every migration applied, for tests. No Docker needed.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '..', 'migrations');

// What a Supabase database has before any migration runs, as far as these
// migrations care: the API roles, auth.users, and auth.uid() reading the JWT.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  -- Supabase's default: new tables in public are fully granted to the API roles.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

export async function createDb(users: string[]): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const u of users) await db.query('insert into auth.users values ($1)', [u]);
  for (const f of readdirSync(DIR).filter((f: string) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(DIR, f), 'utf8'));
  }
  return db;
}

/** Runs `sql` as a signed-in user (or anonymous with null), like a PostgREST request. */
export async function asUser<T = Record<string, unknown>>(db: PGlite, user: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user ?? '']);
    await tx.exec(`set local role ${user ? 'authenticated' : 'anon'}`);
    return (await tx.query<T>(sql, params)).rows;
  });
}
