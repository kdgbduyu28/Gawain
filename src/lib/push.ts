import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { allBusy, useHome } from '../store/useHome';
import { Planned, plan } from './reminders';

/** Local notifications only exist on phones; the web build skips all of this. */
export const NOTIFICATIONS_SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

type State = ReturnType<typeof useHome.getState>;

let configured = false;

function configure() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', { name: 'Gawain', importance: Notifications.AndroidImportance.DEFAULT }).catch(() => {});
  }
}

export async function notificationAccess(ask: boolean): Promise<boolean> {
  if (!NOTIFICATIONS_SUPPORTED) return false;
  configure();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!ask || !current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export function planFor(s: State, now = Date.now()): Planned[] {
  if (!s.settings.notifications) return [];
  return plan(
    {
      chores: s.chores,
      items: s.items,
      timers: s.timers,
      busy: allBusy(s, now),
      schedule: s.settings.schedule,
      digest: s.settings.digest,
      gapNudges: s.settings.gapNudges,
    },
    now,
  );
}

/**
 * Make the scheduled notifications match the plan: cancel what's no longer wanted,
 * schedule what's missing. Safe to call as often as state changes.
 */
export async function sync(s: State, now = Date.now()): Promise<void> {
  if (!NOTIFICATIONS_SUPPORTED) return;
  const wanted = planFor(s, now);
  if (!(await notificationAccess(wanted.length > 0))) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const have = new Map(scheduled.map((n) => [n.identifier, n]));
  const want = new Map(wanted.map((w) => [w.id, w]));
  // Same id but different text (e.g. the digest's counts changed) gets rescheduled too.
  const stale = scheduled.filter((n) => {
    const w = want.get(n.identifier);
    return !w || w.body !== n.content.body || w.title !== n.content.title;
  });
  await Promise.all(stale.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  const staleIds = new Set(stale.map((n) => n.identifier));
  for (const w of wanted) {
    if (have.has(w.id) && !staleIds.has(w.id)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: w.id,
      content: { title: w.title, body: w.body, data: { href: w.href } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(w.at) },
    });
  }
}

/** Show a notification right away (used by the away-from-home reminder). */
export async function notifyNow(title: string, body: string, href: string): Promise<void> {
  if (!NOTIFICATIONS_SUPPORTED) return;
  configure();
  await Notifications.scheduleNotificationAsync({ content: { title, body, data: { href } }, trigger: null });
}
