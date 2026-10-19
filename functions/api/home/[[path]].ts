/**
 * Cloudflare Pages Function: smart-home events in.
 *
 *   POST /api/home/<token>                 body { "trigger": "washer", "event": "finished" }
 *   POST /api/home/<token>/washer/finished (no body needed, for tools that can't send JSON)
 *
 * <token> is the household's secret link from Settings → Smart home. This only
 * forwards to the database function post_home_event, which checks the token,
 * so it needs nothing but Gawain's public Supabase address and publishable key
 * (the same ones in the web app's bundle).
 */

const SUPABASE_URL = 'https://jiowntosdcsxrqthmzzq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_IFDTL4oS8aE31DD3O9Pgxg_tBHO98TA';

type Env = { SUPABASE_URL?: string; SUPABASE_PUBLISHABLE_KEY?: string };
type Ctx = { request: Request; params: { path?: string[] }; env: Env };

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });

const ANSWERS: Record<string, [number, string]> = {
  ok: [200, 'Got it.'],
  'unknown-link': [404, "That link isn't active. Copy it again from Gawain → Settings → Smart home."],
  'bad-trigger': [400, 'Send a trigger name of letters, numbers, - or _ (like "washer"), and an event (like "finished").'],
  'too-many': [429, 'Too many events in the last hour. Check the automation isn\'t firing in a loop.'],
};

export function onRequestOptions(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost({ request, params, env }: Ctx): Promise<Response> {
  const [token = '', pathTrigger, pathEvent] = params.path ?? [];
  let body: { trigger?: unknown; event?: unknown } = {};
  const text = await request.text();
  if (text.trim()) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') body = parsed;
    } catch {
      return json(400, { ok: false, error: 'The body should be JSON, like { "trigger": "washer", "event": "finished" }.' });
    }
  }
  const trigger = String(body.trigger ?? pathTrigger ?? '');
  const event = String(body.event ?? pathEvent ?? '');
  if (!trigger) return json(400, { ok: false, error: ANSWERS['bad-trigger'][1] });

  const url = env.SUPABASE_URL ?? SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY ?? SUPABASE_KEY;
  let res: Response;
  try {
    res = await fetch(`${url}/rest/v1/rpc/post_home_event`, {
      method: 'POST',
      headers: { apikey: key, 'content-type': 'application/json' },
      body: JSON.stringify({ hook_token: token, trigger_key: trigger, event }),
    });
  } catch {
    return json(502, { ok: false, error: "Couldn't reach Gawain's database. Try again." });
  }
  if (!res.ok) return json(502, { ok: false, error: `Gawain's database answered ${res.status}.` });
  const answer = String(await res.json());
  const [status, message] = ANSWERS[answer] ?? [502, 'Unexpected answer.'];
  return json(status, status === 200 ? { ok: true, trigger: trigger.trim().toLowerCase(), event: event.trim().toLowerCase() } : { ok: false, error: message });
}
