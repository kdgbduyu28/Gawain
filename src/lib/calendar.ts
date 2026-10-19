import { Busy } from './gaps';

/** Web build: browsers can't read the phone's calendars, so meeting blocks are typed in instead. */
export const CALENDAR_SUPPORTED = false;

export type CalendarInfo = { id: string; title: string; account: string; color?: string };

export async function calendarAccess(_ask: boolean): Promise<boolean> {
  return false;
}

export async function listCalendars(): Promise<CalendarInfo[]> {
  return [];
}

export async function readBusy(_ids: string[] | null, _from: number, _days = 7): Promise<Busy[]> {
  return [];
}
