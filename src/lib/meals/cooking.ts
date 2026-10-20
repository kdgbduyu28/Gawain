import type { Chore } from '../chores';
import { addDays, startOfDay } from '../time';
import type { Recipe } from './recipes';

type NewChore = Omit<Chore, 'id' | 'createdAt' | 'lastDone'>;

/** A one-off Kitchen chore due on the day the dish is planned, sized by its cooking time. */
export function cookChore(r: Recipe, date: number, by?: string): NewChore {
  return { name: by ? `${by}: cook ${r.name}` : `Cook ${r.name}`, room: 'Kitchen', everyDays: null, minutes: r.minutes, where: 'home', snoozedUntil: startOfDay(date) };
}

/** Dishes that marinate or soak overnight get a short chore the day before. */
export function prepChore(r: Recipe, date: number): NewChore | null {
  const text = r.steps.join(' ');
  if (!/overnight|soak/i.test(text)) return null;
  const what = /marinat/i.test(text) ? 'Marinate' : /soak/i.test(text) ? 'Soak' : 'Prep';
  return { name: `${what} for ${r.name}`, room: 'Kitchen', everyDays: null, minutes: 10, where: 'home', snoozedUntil: startOfDay(addDays(date, -1)) };
}

/** The first time a step mentions ("simmer 30 minutes", "90 minutes (30 in a pressure cooker)"), for a one-tap timer. */
export function stepMinutes(step: string): number | null {
  const hits = [...step.matchAll(/(\d+)(?:–(\d+))?\s*(minutes?|hours?)/gi)].map((m) => Number(m[2] ?? m[1]) * (/hour/i.test(m[3]) ? 60 : 1));
  const first = hits[0];
  return first && first >= 2 && first <= 600 ? first : null;
}
