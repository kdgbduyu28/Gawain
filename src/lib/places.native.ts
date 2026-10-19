import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useHome } from '../store/useHome';
import { notifyNow } from './push';
import { awayText } from './reminders';
import { HOUR } from './time';

export const LOCATION_SUPPORTED = true;

const TASK = 'gawain-places';
const LAST_KEY = 'gawain.away.last';
/** Don't repeat the same place's reminder within this window (GPS can flicker at the edge). */
const QUIET = 2 * HOUR;

type Region = { identifier?: string };
type GeofenceEvent = { eventType: Location.GeofencingEventType; region: Region };

// Runs in the background when you cross a saved place's edge; must be defined at import time.
TaskManager.defineTask<GeofenceEvent>(TASK, async ({ data, error }) => {
  if (error || !data) return;
  const id = data.region.identifier;
  if (!id) return;
  if (!useHome.persist.hasHydrated()) await useHome.persist.rehydrate();
  const s = useHome.getState();
  if (!s.settings.awayReminders) return;
  const place = s.places.find((p) => p.id === id);
  if (!place) return;

  const leftHome = place.kind === 'home' && data.eventType === Location.GeofencingEventType.Exit;
  const atStore = place.kind === 'store' && data.eventType === Location.GeofencingEventType.Enter;
  if (!leftHome && !atStore) return;

  const now = Date.now();
  const last: Record<string, number> = JSON.parse((await AsyncStorage.getItem(LAST_KEY)) ?? '{}');
  if (now - (last[id] ?? 0) < QUIET) return;

  const text = awayText(leftHome ? { kind: 'left-home' } : { kind: 'at-store', storeId: place.id, name: place.name }, s.items, s.chores, now);
  if (!text) return;
  last[id] = now;
  await AsyncStorage.setItem(LAST_KEY, JSON.stringify(last));
  await notifyNow(text.title, text.body, '/groceries');
});

/**
 * Away reminders need "Always" location so the phone can tell the app when you
 * leave home, even when it's closed. Asks for while-using first, as iOS requires.
 */
export async function locationAccess(ask: boolean): Promise<'always' | 'while-using' | 'none'> {
  let fg = await Location.getForegroundPermissionsAsync();
  if (!fg.granted && ask && fg.canAskAgain) fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return 'none';
  let bg = await Location.getBackgroundPermissionsAsync();
  if (!bg.granted && ask && bg.canAskAgain) bg = await Location.requestBackgroundPermissionsAsync();
  return bg.granted ? 'always' : 'while-using';
}

export async function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  if ((await locationAccess(true)) === 'none') return null;
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: p.coords.latitude, lng: p.coords.longitude };
}

/** Watch the saved places while away reminders are on; stop watching otherwise. iOS allows 20 regions. */
export async function syncGeofences(): Promise<void> {
  const s = useHome.getState();
  const regions = s.places.slice(0, 20).map((p) => ({
    identifier: p.id,
    latitude: p.lat,
    longitude: p.lng,
    radius: p.radius,
    notifyOnEnter: p.kind === 'store',
    notifyOnExit: p.kind === 'home',
  }));
  const started = await Location.hasStartedGeofencingAsync(TASK).catch(() => false);
  const want = s.settings.awayReminders && regions.length > 0 && (await locationAccess(false)) === 'always';
  if (want) await Location.startGeofencingAsync(TASK, regions);
  else if (started) await Location.stopGeofencingAsync(TASK);
}
