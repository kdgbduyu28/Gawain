/**
 * Reminders said out loud on a speaker (Sonos, Google Nest, anything Home
 * Assistant can play to) through the person's own Home Assistant. The address,
 * token and speaker stay on this device; Gawain's server never sees them.
 */
import { Busy, Schedule } from './gaps';
import { Planned } from './reminders';
import { at, startOfDay } from './time';

export type Announce = {
  /** Off keeps the setup for later. */
  on: boolean;
  /** Home Assistant's address, e.g. https://abc123.ui.nabu.casa */
  url: string;
  /** A long-lived access token from the Home Assistant profile page. */
  token: string;
  /** media_player.kitchen_sonos */
  speaker: string;
  /** The voice: tts.google_en_com, tts.home_assistant_cloud... */
  tts: string;
  timers: boolean;
  nudges: boolean;
  digest: boolean;
  /** The rice cooker's smart plug (switch.rice_cooker), switched on at the time a dish needs rice. */
  ricePlug: string;
};

export const DEFAULT_ANNOUNCE: Announce = { on: false, url: '', token: '', speaker: '', tts: '', timers: true, nudges: false, digest: true, ricePlug: '' };

/** "abc.ui.nabu.casa/lovelace/0" → "https://abc.ui.nabu.casa" (Home Assistant always sits at the root). */
export function haBase(url: string): string {
  const u = url.trim();
  if (!u) return '';
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).origin;
  } catch {
    return '';
  }
}

/** Which reminder a planned notification is, from its id. */
export function kindOf(p: Pick<Planned, 'id'>): 'timers' | 'nudges' | 'digest' | null {
  if (p.id.startsWith('timer:')) return 'timers';
  if (p.id.startsWith('gap:')) return 'nudges';
  if (p.id.startsWith('digest:')) return 'digest';
  return null;
}

/**
 * Whether to say this reminder out loud now. Never during a meeting (you're
 * probably on a call) or outside your day, and only kinds you picked.
 */
export function shouldAnnounce(a: Announce | null, p: Pick<Planned, 'id'>, now: number, busy: Busy[], schedule: Pick<Schedule, 'dayStart' | 'dayEnd'>): boolean {
  if (!a?.on || !ready(a)) return false;
  const kind = kindOf(p);
  if (!kind || !a[kind]) return false;
  if (busy.some((b) => b.start <= now && now < b.end)) return false;
  const day = startOfDay(now);
  return now >= at(day, schedule.dayStart) && now < at(day, schedule.dayEnd);
}

export const ready = (a: Announce) => !!(haBase(a.url) && a.token.trim() && a.speaker && a.tts);

/** What the speaker says: the notification's title and body as one sentence or two. */
export function spoken(p: Pick<Planned, 'title' | 'body'>): string {
  const clean = (s: string) =>
    s
      .replace(/\s*·\s*/g, ', ')
      .replace(/\n+/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();
  const title = clean(p.title);
  const end = /[.!?]$/.test(title) ? '' : '.';
  const body = clean(p.body);
  return body ? `${title}${end} ${body}` : `${title}${end}`;
}

/** The Home Assistant call that says `message` on the speaker. */
export function speakRequest(a: Announce, message: string): { url: string; init: RequestInit } {
  return {
    url: `${haBase(a.url)}/api/services/tts/speak`,
    init: {
      method: 'POST',
      headers: { authorization: `Bearer ${a.token.trim()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ entity_id: a.tts, media_player_entity_id: a.speaker, message, cache: false }),
    },
  };
}

/** Plain-language reason a call to Home Assistant failed. */
export function failure(status: number | null, isWeb: boolean): string {
  if (status === null) {
    return isWeb
      ? "Couldn't reach Home Assistant. Check the address is https and reachable from outside your home, and that this site is allowed: Settings → System → Network → HTTP server → CORS allowed origins."
      : "Couldn't reach Home Assistant. Check the address, and that it's reachable from where this phone is.";
  }
  if (status === 401 || status === 403) return 'Home Assistant turned the token down. Make a new long-lived access token on your profile page and paste it again.';
  if (status === 400) return 'Home Assistant rejected the request. Check the speaker and voice are right.';
  if (status === 404) return "That address doesn't look like Home Assistant. Use the address you open it with, without /lovelace.";
  return `Home Assistant answered ${status}. Check that the speaker is on.`;
}

/** The Home Assistant call that switches a plug on. */
export function switchOnRequest(a: Pick<Announce, 'url' | 'token'>, entity: string): { url: string; init: RequestInit } {
  return {
    url: `${haBase(a.url)}/api/services/switch/turn_on`,
    init: {
      method: 'POST',
      headers: { authorization: `Bearer ${a.token.trim()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ entity_id: entity }),
    },
  };
}

export async function switchOn(a: Pick<Announce, 'url' | 'token'>, entity: string, isWeb: boolean, fetcher: typeof fetch = fetch): Promise<SpeakResult> {
  const { url, init } = switchOnRequest(a, entity);
  try {
    const res = await fetcher(url, init);
    return res.ok ? { ok: true } : { ok: false, error: failure(res.status, isWeb) };
  } catch {
    return { ok: false, error: failure(null, isWeb) };
  }
}

export type SpeakResult = { ok: true } | { ok: false; error: string };

export async function speak(a: Announce, message: string, isWeb: boolean, fetcher: typeof fetch = fetch): Promise<SpeakResult> {
  const { url, init } = speakRequest(a, message);
  try {
    const res = await fetcher(url, init);
    return res.ok ? { ok: true } : { ok: false, error: failure(res.status, isWeb) };
  } catch {
    return { ok: false, error: failure(null, isWeb) };
  }
}

export type HaEntity = { id: string; name: string };

/** Speakers and voices this Home Assistant has, for picking instead of typing ids. */
export async function findEntities(
  a: Pick<Announce, 'url' | 'token'>,
  isWeb: boolean,
  fetcher: typeof fetch = fetch,
): Promise<{ speakers: HaEntity[]; voices: HaEntity[]; switches: HaEntity[] } | { error: string }> {
  let res: Response;
  try {
    res = await fetcher(`${haBase(a.url)}/api/states`, { headers: { authorization: `Bearer ${a.token.trim()}` } });
  } catch {
    return { error: failure(null, isWeb) };
  }
  if (!res.ok) return { error: failure(res.status, isWeb) };
  const states = (await res.json().catch(() => [])) as { entity_id?: string; state?: string; attributes?: { friendly_name?: string } }[];
  const pick = (domain: string) =>
    states
      .filter((s) => typeof s.entity_id === 'string' && s.entity_id.startsWith(`${domain}.`) && s.state !== 'unavailable')
      .map((s) => ({ id: s.entity_id!, name: s.attributes?.friendly_name || s.entity_id! }))
      .sort((x, y) => x.name.localeCompare(y.name));
  return { speakers: pick('media_player'), voices: pick('tts'), switches: pick('switch') };
}
