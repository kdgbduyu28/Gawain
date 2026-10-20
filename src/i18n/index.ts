import { fil } from './fil';

export type Lang = 'en' | 'fil';

let current: Lang = 'en';

/**
 * Switch languages. Like the theme, call before rendering the tree; the root
 * layout keys the app on the language so every screen re-renders with it.
 */
export function setLang(l: Lang) {
  current = l;
}

export function getLang(): Lang {
  return current;
}

/** Locale for dates: "Martes, Okt 20" in Filipino. */
export function locale(): string | undefined {
  return current === 'fil' ? 'fil-PH' : undefined;
}

/**
 * Translate by English text. Untranslated strings fall back to English, so screens
 * work before their Filipino copy is written. `{name}` placeholders are filled from
 * `vars`.
 */
export function t(text: string, vars?: Record<string, string | number>): string {
  const s = current === 'fil' ? (fil[text] ?? text) : text;
  return vars ? s.replace(/\{(\w+)\}/g, (m: string, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** fmtDay's words ("today", "in 3 days", "2 days ago") in the current language. */
export function tDay(s: string): string {
  if (current !== 'fil') return s;
  const n = /^in (\d+) days$/.exec(s) ?? /^(\d+) days ago$/.exec(s);
  if (n) return s.startsWith('in') ? `sa ${n[1]} araw` : `${n[1]} araw na ang nakaraan`;
  return fil[s] ?? s;
}
