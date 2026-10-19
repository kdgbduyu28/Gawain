import * as Calendar from 'expo-calendar';
import { Busy } from './gaps';
import { DAY } from './time';

export const CALENDAR_SUPPORTED = true;

export type CalendarInfo = { id: string; title: string; account: string; color?: string };

export async function calendarAccess(ask: boolean): Promise<boolean> {
  const current = await Calendar.getCalendarPermissions();
  if (current.granted) return true;
  if (!ask || !current.canAskAgain) return false;
  return (await Calendar.requestCalendarPermissions()).granted;
}

export async function listCalendars(): Promise<CalendarInfo[]> {
  const cals = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  return cals.map((c) => ({ id: c.id, title: c.title, account: c.source?.name ?? '', color: c.color }));
}

/**
 * Busy times from the phone's calendars for the next `days` days. Only start/end and
 * title are kept, in memory; nothing is written to your calendars.
 */
export async function readBusy(ids: string[] | null, from: number, days = 7): Promise<Busy[]> {
  const cals = ids ?? (await listCalendars()).map((c) => c.id);
  if (!cals.length) return [];
  const events = await Calendar.listEvents(cals, new Date(from), new Date(from + days * DAY));
  return events
    .filter((e) => !e.allDay && e.availability !== Calendar.Availability.FREE)
    .map((e) => ({ start: new Date(e.startDate).getTime(), end: new Date(e.endDate).getTime(), title: e.title ?? '' }))
    .filter((b) => b.end > b.start);
}
