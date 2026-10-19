export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** "HH:MM" in the phone's local time, e.g. "09:00". */
export type Clock = string;

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole calendar days from `a` to `b` (local time), ignoring the time of day. */
export function daysBetween(a: number, b: number): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY);
}

export function addDays(t: number, days: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** The timestamp of `clock` on the day that contains `day`. */
export function at(day: number, clock: Clock): number {
  const [h, m] = clock.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

export function parseClock(s: string): Clock | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ampm = m[3]?.toLowerCase();
  if (ampm) {
    if (h < 1 || h > 12) return null;
    if (ampm === 'pm' && h !== 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
  }
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** "2:00", "2:30 PM" style: hour without a leading zero, PM only when asked. */
export function fmtTime(t: number, withAmPm = false): string {
  const d = new Date(t);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return withAmPm ? `${h12}:${m} ${h < 12 ? 'AM' : 'PM'}` : `${h12}:${m}`;
}

export function fmtClock(c: Clock): string {
  return fmtTime(at(Date.now(), c), true);
}

export function fmtMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const weekdayName = (d: number) => WEEKDAYS[d];

/** "today", "yesterday", "3 days ago", "in 2 days", "Mon, Oct 12"... relative to `now`. */
export function fmtDay(t: number, now: number): string {
  const d = daysBetween(now, t);
  if (d === 0) return 'today';
  if (d === -1) return 'yesterday';
  if (d === 1) return 'tomorrow';
  if (d < 0 && d > -14) return `${-d} days ago`;
  if (d > 0 && d < 14) return `in ${d} days`;
  return new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function fmtEvery(days: number | null): string {
  if (days === null) return 'once';
  if (days === 1) return 'every day';
  if (days === 7) return 'every week';
  if (days % 7 === 0) return `every ${days / 7} weeks`;
  if (days === 30) return 'every month';
  return `every ${days} days`;
}
