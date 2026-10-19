import { describe, expect, it } from 'vitest';
import { busyFromIcs, normalizeIcsUrl } from './ics';

// Manila is UTC+8 all year, so these expectations hold in any test machine time zone.
const ph = (d: number, h: number, m = 0) => Date.UTC(2026, 9, d, h - 8, m);
const FROM = ph(12, 0); // Mon 12 Oct 2026
const TO = ph(19, 0); // Mon 19 Oct 2026

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:standup',
  'SUMMARY:Daily standup',
  'DTSTART;TZID=Asia/Manila:20260901T100000',
  'DTEND;TZID=Asia/Manila:20260901T101500',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  'EXDATE;TZID=Asia/Manila:20261014T100000',
  'END:VEVENT',
  // Thursday's standup moved to 11:00.
  'BEGIN:VEVENT',
  'UID:standup',
  'RECURRENCE-ID;TZID=Asia/Manila:20261015T100000',
  'SUMMARY:Daily standup (moved)',
  'DTSTART;TZID=Asia/Manila:20261015T110000',
  'DTEND;TZID=Asia/Manila:20261015T111500',
  'END:VEVENT',
  // Friday's standup cancelled.
  'BEGIN:VEVENT',
  'UID:standup',
  'RECURRENCE-ID;TZID=Asia/Manila:20261016T100000',
  'STATUS:CANCELLED',
  'DTSTART;TZID=Asia/Manila:20261016T100000',
  'DTEND;TZID=Asia/Manila:20261016T101500',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:one-on-one',
  'SUMMARY:1:1 with Ana\\, monthly',
  'DTSTART:20260908T060000Z',
  'DURATION:PT30M',
  'RRULE:FREQ=MONTHLY;BYDAY=2TU',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:focus',
  'SUMMARY:Focus time',
  'TRANSP:TRANSPARENT',
  'DTSTART;TZID=Singapore Standard Time:20261013T140000',
  'DTEND;TZID=Singapore Standard Time:20261013T160000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:client',
  'SUMMARY:Client call',
  'DTSTART;TZID=Singapore Standard Time:20261013T150000',
  'DTEND;TZID=Singapore Standard Time:20261013T16',
  ' 0000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:holiday',
  'SUMMARY:Holiday',
  'DTSTART;VALUE=DATE:20261016',
  'DTEND;VALUE=DATE:20261017',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('iCal links', () => {
  const busy = busyFromIcs(ICS, FROM, TO);
  const titles = busy.map((b) => [b.title, b.start]);

  it('expands weekly meetings, skipping EXDATEs and cancelled or moved ones', () => {
    const standups = busy.filter((b) => b.title === 'Daily standup').map((b) => b.start);
    expect(standups).toEqual([ph(12, 10), ph(13, 10)]);
    expect(titles).toContainEqual(['Daily standup (moved)', ph(15, 11)]);
  });

  it('handles monthly "second Tuesday", UTC times and DURATION', () => {
    const one = busy.find((b) => b.title.startsWith('1:1'));
    expect(one).toMatchObject({ title: '1:1 with Ana, monthly', start: ph(13, 14), end: ph(13, 14, 30) });
  });

  it('reads Windows time zone names and folded lines', () => {
    expect(busy.find((b) => b.title === 'Client call')).toMatchObject({ start: ph(13, 15), end: ph(13, 16) });
  });

  it('skips free and all-day events', () => {
    expect(busy.some((b) => b.title === 'Focus time' || b.title === 'Holiday')).toBe(false);
  });

  it('stops repeating at UNTIL and COUNT', () => {
    const ics = (rule: string) =>
      `BEGIN:VEVENT\nUID:x\nSUMMARY:x\nDTSTART:20261012T020000Z\nDTEND:20261012T030000Z\nRRULE:${rule}\nEND:VEVENT`;
    expect(busyFromIcs(ics('FREQ=DAILY;COUNT=3'), FROM, TO).length).toBe(3);
    expect(busyFromIcs(ics('FREQ=DAILY;UNTIL=20261013T235959Z'), FROM, TO).length).toBe(2);
    expect(busyFromIcs(ics('FREQ=DAILY;INTERVAL=2'), FROM, TO).length).toBe(4);
  });

  it('accepts webcal links', () => {
    expect(normalizeIcsUrl('webcal://calendar.google.com/x/basic.ics')).toBe('https://calendar.google.com/x/basic.ics');
    expect(normalizeIcsUrl('not a link')).toBeNull();
  });
});
