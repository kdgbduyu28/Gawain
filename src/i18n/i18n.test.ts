/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ALLERGIES, BUDGET_LEVEL, CUISINES, DISLIKES, EQUIPMENT, GOALS, MEAL_LABEL, MEALS, RESTRICTIONS, SHOPS, VIBES } from '../lib/meals/labels';
import { holidays } from '../lib/meals/phcalendar';
import { SECTION_LABEL } from '../lib/meals/trip';
import { fil } from './fil';
import { setLang, t, tDay } from './index';

const SRC = join(__dirname, '..');
// The parts of the app that are translated so far.
const TRANSLATED = ['app/(tabs)/meals.tsx', 'app/(tabs)/_layout.tsx', 'app/meals', 'components/MealInsights.tsx', 'components/NutritionCard.tsx', 'components/MealExtras.tsx'];

function files(p: string): string[] {
  const full = join(SRC, p);
  return statSync(full).isDirectory() ? readdirSync(full).flatMap((f) => files(join(p, f))) : [full];
}

/** Every t('...') key in the translated screens, ternary branches included. */
function keysUsed(): string[] {
  const out = new Set<string>();
  for (const f of TRANSLATED.flatMap(files)) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*(?:[^'"()]*\?\s*)?(['"])((?:\\.|(?!\1).)*)\1(?:\s*:\s*(['"])((?:\\.|(?!\3).)*)\3)?/g)) {
      out.add(m[2].replace(/\\(.)/g, '$1'));
      if (m[4] !== undefined) out.add(m[4].replace(/\\(.)/g, '$1'));
    }
  }
  return [...out];
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

afterEach(() => setLang('en'));

describe('Filipino', () => {
  it('has every phrase the translated screens use', () => {
    const keys = keysUsed();
    expect(keys.length).toBeGreaterThan(100);
    expect(keys.filter((k) => !(k in fil))).toEqual([]);
  });

  it('has every questionnaire option, meal and budget word', () => {
    const labels = [
      ...[SHOPS, MEALS, EQUIPMENT, RESTRICTIONS, GOALS, CUISINES, VIBES, ALLERGIES, DISLIKES].flatMap((list) =>
        list.flatMap((x) => ['label' in x ? x.label : '', 'hint' in x ? (x as { hint: string }).hint : ''].filter(Boolean)),
      ),
      ...Object.values(BUDGET_LEVEL).flatMap((b) => [b.label, b.hint]),
      ...Object.values(MEAL_LABEL),
      ...Object.values(SECTION_LABEL),
      ...holidays(2026).map((h) => h.name),
    ];
    expect(labels.filter((k) => !(k in fil))).toEqual([]);
  });

  it('keeps the same placeholders', () => {
    expect(Object.entries(fil).filter(([en, tl]) => placeholders(en).join() !== placeholders(tl).join())).toEqual([]);
  });

  it('switches language and fills placeholders', () => {
    expect(t('{amount} a plate', { amount: '₱55' })).toBe('₱55 a plate');
    setLang('fil');
    expect(t('{amount} a plate', { amount: '₱55' })).toBe('₱55 bawat plato');
    expect(t('Not translated yet')).toBe('Not translated yet');
    expect(tDay('in 3 days')).toBe('sa 3 araw');
    expect(tDay('tomorrow')).toBe('bukas');
  });
});
