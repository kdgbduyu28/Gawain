import * as Notifications from 'expo-notifications';
import { Href, router } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { calendarAccess, readBusy } from '../lib/calendar';
import { Busy } from '../lib/gaps';
import { readIcs } from '../lib/icsFetch';
import { syncGeofences } from '../lib/places';
import { NOTIFICATIONS_SUPPORTED, sync } from '../lib/push';
import { startOfDay } from '../lib/time';
import { useHome } from '../store/useHome';

const REFRESH_MS = 15 * 60_000;

/**
 * Re-read busy times from the phone's calendars (if connected) and any iCal links.
 * Called on launch, whenever the app comes back, and every 15 minutes while open.
 */
export async function refreshCalendar() {
  const s = useHome.getState();
  const from = startOfDay(Date.now());
  const busy: Busy[] = [];
  const errors: string[] = [];
  if (s.settings.useCalendar && (await calendarAccess(false))) {
    busy.push(...(await readBusy(s.settings.calendarIds, from).catch(() => [])));
  }
  const links = await Promise.allSettled(s.settings.icsUrls.map((u) => readIcs(u, from)));
  for (const r of links) {
    if (r.status === 'fulfilled') busy.push(...r.value);
    else errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
  }
  useHome.getState().setCalendarBusy(busy, errors[0] ?? null);
}

/**
 * Keeps the outside world in step with the store: calendar busy times, scheduled
 * notifications, watched places. Opens the right screen when a notification is tapped.
 */
export function Background() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const s = useHome.getState();
        sync(s).catch(() => {});
        syncGeofences().catch(() => {});
      }, 800);
    };
    const unsubscribe = useHome.subscribe((s, prev) => {
      if (
        s.settings.useCalendar !== prev.settings.useCalendar ||
        s.settings.calendarIds !== prev.settings.calendarIds ||
        s.settings.icsUrls !== prev.settings.icsUrls
      ) {
        refreshCalendar().catch(() => {});
      }
      run();
    });
    const appState = AppState.addEventListener('change', (st) => {
      if (st === 'active') refreshCalendar().catch(() => {}).finally(run);
    });
    refreshCalendar().catch(() => {}).finally(run);
    const poll = setInterval(() => refreshCalendar().catch(() => {}), REFRESH_MS);
    return () => {
      unsubscribe();
      appState.remove();
      clearTimeout(timer);
      clearInterval(poll);
    };
  }, []);

  return NOTIFICATIONS_SUPPORTED ? <NotificationTaps /> : null;
}

function NotificationTaps() {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const href = response?.notification.request.content.data?.href;
    if (typeof href === 'string' && response?.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
      router.navigate(href as Href);
    }
  }, [response]);
  return null;
}
