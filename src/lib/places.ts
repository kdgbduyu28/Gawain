/** Web build: browsers can't watch your location in the background, so away reminders are phone-only. */
export const LOCATION_SUPPORTED = false;

export async function locationAccess(_ask: boolean): Promise<'always' | 'while-using' | 'none'> {
  return 'none';
}

export async function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  return null;
}

export async function syncGeofences(): Promise<void> {}
