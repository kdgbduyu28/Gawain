// The Pages Function hubs post to (functions/api/home), with the database call faked.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestOptions, onRequestPost } from '../functions/api/home/[[path]]';

const TOKEN = 'a'.repeat(64);

function call(path: string[], body?: unknown, answer: unknown = 'ok', status = 200) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(answer), { status }));
  vi.stubGlobal('fetch', fetchMock);
  const request = new Request('https://gawain.test/api/home/' + path.join('/'), {
    method: 'POST',
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { fetchMock, res: onRequestPost({ request, params: { path }, env: {} }) };
}

afterEach(() => vi.unstubAllGlobals());

describe('POST /api/home/<token>', () => {
  it('forwards a JSON event to the database', async () => {
    const { fetchMock, res } = call([TOKEN], { trigger: 'Washer', event: 'finished' });
    const r = await res;
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, trigger: 'washer', event: 'finished' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/rest\/v1\/rpc\/post_home_event$/);
    expect(JSON.parse(String(init.body))).toEqual({ hook_token: TOKEN, trigger_key: 'Washer', event: 'finished' });
    expect((init.headers as Record<string, string>).apikey).toMatch(/^sb_publishable_/);
  });

  it('takes the trigger and event from the path when there is no body', async () => {
    const { fetchMock, res } = call([TOKEN, 'trash', 'pressed']);
    expect((await res).status).toBe(200);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({ trigger_key: 'trash', event: 'pressed' });
  });

  it('explains what went wrong', async () => {
    expect((await call([TOKEN], { trigger: 'washer' }, 'unknown-link').res).status).toBe(404);
    expect((await call([TOKEN], { trigger: 'washer' }, 'too-many').res).status).toBe(429);
    expect((await call([TOKEN], { trigger: 'washer' }, null, 500).res).status).toBe(502);
    const noTrigger = await call([TOKEN], {}).res;
    expect(noTrigger.status).toBe(400);
    const notJson = await call([TOKEN], '{nope').res;
    expect(notJson.status).toBe(400);
    expect((await notJson.json()).error).toMatch(/JSON/);
  });

  it('answers browser preflight so the app can send a test', () => {
    const r = onRequestOptions();
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
  });
});
