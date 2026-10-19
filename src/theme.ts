import { StyleSheet } from 'react-native';

export type Scheme = 'light' | 'dark';

const shared = {
  // Deep green: white text on it is 5.5:1.
  primary: '#047857',
  accent: '#F59E0B',
  danger: '#DC2626',
  /** Text and icons sitting on brand-colored backgrounds. */
  onColor: '#FFFFFF',
};

const light = {
  ...shared,
  primarySoft: '#E7F6EF',
  primaryText: '#047857',
  bg: '#F4F5F3',
  card: '#FFFFFF',
  /** Inputs, chips and other fills that sit on a card. */
  surface: '#F0F2EF',
  text: '#1C211E',
  muted: '#68706B',
  line: '#E4E7E3',
  warnSoft: '#FEF3C7',
  warnText: '#92400E',
  dangerSoft: '#FEE2E2',
  dangerText: '#B91C1C',
  overlay: 'rgba(0,0,0,0.45)',
};

export type Palette = typeof light;

const dark: Palette = {
  ...shared,
  primarySoft: '#0F2E24',
  primaryText: '#34D399',
  bg: '#0D0F0E',
  card: '#181B19',
  surface: '#232724',
  text: '#EEF1EE',
  muted: '#9AA39D',
  line: '#2A2F2C',
  warnSoft: '#33270C',
  warnText: '#FBBF24',
  dangerSoft: '#3A1414',
  dangerText: '#F87171',
  overlay: 'rgba(0,0,0,0.65)',
};

const PALETTES: Record<Scheme, Palette> = { light, dark };

let current: Scheme = 'light';

/**
 * Switch palettes. Call before rendering the tree for the new scheme; the root
 * layout keys the app on the scheme so every screen re-renders with it.
 */
export function setScheme(s: Scheme) {
  current = s;
}

export function getScheme(): Scheme {
  return current;
}

/** The active palette. Reads always return the current scheme's value. */
export const C: Palette = new Proxy(light, {
  get: (_, key) => PALETTES[current][key as keyof Palette],
}) as Palette;

/**
 * StyleSheet that is built once per scheme, on first use. Use in place of
 * StyleSheet.create so styles that reference `C` pick up dark mode.
 */
export function themed<T extends StyleSheet.NamedStyles<T>>(build: () => T): T {
  const cache: Partial<Record<Scheme, T>> = {};
  return new Proxy({} as T, {
    get: (_, key) => (cache[current] ??= StyleSheet.create(build()))[key as keyof T],
  });
}

export const R = { sm: 6, md: 10, lg: 14, pill: 999 };

export const MAX_WIDTH = 720;
