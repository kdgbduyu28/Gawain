import { Platform } from 'react-native';

/**
 * Browser-only helpers: notifications while the tab is open, the offline service
 * worker, "install to home screen", and backup files. Everything is a no-op on phones.
 */

export const IS_WEB = Platform.OS === 'web';

export type WebPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export function webNotifyPermission(): WebPermission {
  if (!IS_WEB || typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestWebNotify(): Promise<WebPermission> {
  if (webNotifyPermission() === 'unsupported') return 'unsupported';
  return Notification.requestPermission();
}

/** Show a system notification. Goes through the service worker when there is one (Android Chrome requires it). */
export async function showWebNotification(id: string, title: string, body: string, href: string): Promise<void> {
  if (webNotifyPermission() !== 'granted') return;
  const options = { body, tag: id, icon: '/logo192.png', badge: '/logo192.png', data: { href } };
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (reg) await reg.showNotification(title, options);
  else new Notification(title, options);
}

/** Offline support for the deployed site. Skipped in development, where it would cache stale bundles. */
export function registerServiceWorker(onOpen: (href: string) => void) {
  if (!IS_WEB || __DEV__ || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  // The worker tells us which screen a tapped notification should open.
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'open' && typeof e.data.href === 'string') onOpen(e.data.href);
  });
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();

if (IS_WEB && typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export function onInstallChange(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * 'installed': running from the home screen / as an app already.
 * 'prompt': the browser can show its install dialog (Chrome, Edge, Android).
 * 'ios': Safari, where it's Share → Add to Home Screen.
 * 'manual': anything else (Firefox desktop...).
 */
export function installState(): 'installed' | 'prompt' | 'ios' | 'manual' | 'unsupported' {
  if (!IS_WEB || typeof window === 'undefined') return 'unsupported';
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone;
  if (standalone) return 'installed';
  if (deferred) return 'prompt';
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  return 'manual';
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  listeners.forEach((l) => l());
  return outcome === 'accepted';
}

/** Save `data` as a JSON file via the browser's download. */
export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Ask the user to pick a JSON file and return its parsed contents (null if cancelled). */
export function pickJson(): Promise<unknown | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then((t) => {
        try {
          resolve(JSON.parse(t));
        } catch {
          reject(new Error("That file isn't a Gawain backup."));
        }
      }, reject);
    };
    input.click();
  });
}
