import { describe, expect, it, vi } from 'vitest';
import { Announce, DEFAULT_ANNOUNCE, findEntities, haBase, kindOf, shouldAnnounce, speak, speakRequest, spoken, switchOn } from './announce';
import { Busy } from './gaps';
import { MIN } from './time';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

// Thursday 15 Oct 2026, 1:00 PM local.
const NOW = new Date(2026, 9, 15, 13, 0).getTime();
const DAY = { dayStart: '07:00', dayEnd: '22:00' } as const;
const A: Announce = { ...DEFAULT_ANNOUNCE, on: true, url: 'abc.ui.nabu.casa/lovelace/0', token: 'x'.repeat(40), speaker: 'media_player.kitchen', tts: 'tts.google_en_com' };
const timer = { id: 'timer:hook:t2', title: 'Washer is done', body: 'Finished just now.' };

const answer = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('announce', () => {
  it('finds the Home Assistant address in whatever was pasted', () => {
    expect(haBase(' abc.ui.nabu.casa/lovelace/0 ')).toBe('https://abc.ui.nabu.casa');
    expect(haBase('http://192.168.1.5:8123/')).toBe('http://192.168.1.5:8123');
    expect(haBase('')).toBe('');
    expect(haBase('not a url at all')).toBe('');
  });

  it('knows each reminder kind', () => {
    expect(kindOf({ id: 'timer:abc' })).toBe('timers');
    expect(kindOf({ id: 'gap:123:c1' })).toBe('nudges');
    expect(kindOf({ id: 'digest:1' })).toBe('digest');
    expect(kindOf({ id: 'away' })).toBeNull();
  });

  it('speaks only when on, set up, picked, free and awake', () => {
    expect(shouldAnnounce(A, timer, NOW, [], DAY)).toBe(true);
    expect(shouldAnnounce({ ...A, on: false }, timer, NOW, [], DAY)).toBe(false);
    expect(shouldAnnounce({ ...A, speaker: '' }, timer, NOW, [], DAY)).toBe(false);
    expect(shouldAnnounce(A, { id: 'gap:1:c1' }, NOW, [], DAY)).toBe(false); // nudges are off by default
    const call: Busy = { start: NOW - 10 * MIN, end: NOW + 20 * MIN, title: 'Client call' };
    expect(shouldAnnounce(A, timer, NOW, [call], DAY)).toBe(false);
    expect(shouldAnnounce(A, timer, NOW + 25 * MIN, [call], DAY)).toBe(true);
    expect(shouldAnnounce(A, timer, new Date(2026, 9, 15, 22, 30).getTime(), [], DAY)).toBe(false);
    expect(shouldAnnounce(A, timer, new Date(2026, 9, 15, 6, 0).getTime(), [], DAY)).toBe(false);
  });

  it('turns a notification into something to say', () => {
    expect(spoken(timer)).toBe('Washer is done. Finished just now.');
    expect(spoken({ title: 'Today: Dishes and Trash', body: '2 chores due · 3 on the grocery list' })).toBe('Today: Dishes and Trash. 2 chores due, 3 on the grocery list');
    expect(spoken({ title: "You're out. 2 items", body: 'Eggs and Rice\nErrands: Bank' })).toBe("You're out. 2 items. Eggs and Rice. Errands: Bank");
    expect(spoken({ title: 'Quick break?', body: 'Wash the dishes (10 min)?' })).toBe('Quick break? Wash the dishes (10 min)?');
    expect(spoken({ title: 'Groceries', body: '' })).toBe('Groceries.');
  });

  it('calls tts.speak with the speaker and voice', () => {
    const { url, init } = speakRequest(A, 'Hello');
    expect(url).toBe('https://abc.ui.nabu.casa/api/services/tts/speak');
    expect(init.headers).toMatchObject({ authorization: `Bearer ${A.token}` });
    expect(JSON.parse(String(init.body))).toEqual({ entity_id: 'tts.google_en_com', media_player_entity_id: 'media_player.kitchen', message: 'Hello', cache: false });
  });

  it('explains failures in plain words', async () => {
    expect(await speak(A, 'Hi', true, answer(200, []))).toEqual({ ok: true });
    expect(await speak(A, 'Hi', true, answer(401))).toEqual({ ok: false, error: expect.stringMatching(/token/) });
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await speak(A, 'Hi', true, offline)).toEqual({ ok: false, error: expect.stringMatching(/CORS allowed origins/) });
    expect(await speak(A, 'Hi', false, offline)).toEqual({ ok: false, error: expect.not.stringMatching(/CORS/) });
  });

  it('switches a plug on', async () => {
    let sent: { url: string; body: string } | null = null;
    const fetcher = (async (url: string, init: RequestInit) => {
      sent = { url, body: String(init.body) };
      return new Response('[]', { status: 200 });
    }) as unknown as typeof fetch;
    expect(await switchOn(A, 'switch.rice_cooker', true, fetcher)).toEqual({ ok: true });
    expect(sent).toEqual({ url: expect.stringMatching(/\/api\/services\/switch\/turn_on$/), body: '{"entity_id":"switch.rice_cooker"}' });
  });

  it('lists speakers, voices and plugs from Home Assistant', async () => {
    const states = [
      { entity_id: 'media_player.kitchen', state: 'idle', attributes: { friendly_name: 'Kitchen Sonos' } },
      { entity_id: 'media_player.tv', state: 'unavailable', attributes: { friendly_name: 'Old TV' } },
      { entity_id: 'media_player.bedroom', state: 'off', attributes: {} },
      { entity_id: 'tts.google_en_com', state: 'unknown', attributes: { friendly_name: 'Google en com' } },
      { entity_id: 'light.porch', state: 'on', attributes: {} },
      { entity_id: 'switch.rice_cooker', state: 'off', attributes: { friendly_name: 'Rice cooker plug' } },
    ];
    expect(await findEntities(A, true, answer(200, states))).toEqual({
      speakers: [
        { id: 'media_player.kitchen', name: 'Kitchen Sonos' },
        { id: 'media_player.bedroom', name: 'media_player.bedroom' },
      ],
      voices: [{ id: 'tts.google_en_com', name: 'Google en com' }],
      switches: [{ id: 'switch.rice_cooker', name: 'Rice cooker plug' }],
    });
    expect(await findEntities(A, true, answer(401))).toEqual({ error: expect.stringMatching(/token/) });
  });

  it('keeps the token out of backups, and a restore keeps the one already here', async () => {
    const { useHome } = await import('../store/useHome');
    useHome.getState().setSettings({ announce: A });
    const file = JSON.parse(JSON.stringify(useHome.getState().backup()));
    expect(JSON.stringify(file)).not.toContain(A.token);
    expect(file.settings.announce.speaker).toBe('media_player.kitchen');
    useHome.getState().restore(file);
    expect(useHome.getState().settings.announce.token).toBe(A.token);
  });
});
