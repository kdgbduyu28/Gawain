import { Platform } from 'react-native';
import type { Busy } from './gaps';
import { busyFromIcs } from './ics';
import { DAY } from './time';

/**
 * Download an iCal link and return its busy times for the next `days` days.
 * The phone app fetches it directly; browsers go through /api/ics because
 * calendar providers don't allow cross-site requests.
 */
export async function readIcs(url: string, from: number, days = 7): Promise<Busy[]> {
  const res =
    Platform.OS === 'web'
      ? await fetch('/api/ics', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) })
      : await fetch(url.replace(/^webcals?:\/\//i, 'https://'), { headers: { accept: 'text/calendar' } });
  if (!res.ok) {
    let msg = `Couldn't read the calendar (${res.status}).`;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {}
    throw new Error(msg);
  }
  const text = await res.text();
  if (!text.trimStart().startsWith('BEGIN:VCALENDAR')) {
    throw new Error(Platform.OS === 'web' && __DEV__ ? 'Calendar links need the deployed site (/api/ics), not the dev server.' : "That link didn't return a calendar.");
  }
  return busyFromIcs(text, from, from + days * DAY);
}
