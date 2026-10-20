import { DAY } from '../time';
import { INGREDIENT, Ingredient } from './ingredients';

/**
 * What's in the kitchen from the meal plan: added when a grocery item is ticked off,
 * used up when a dish is cooked, and dropped once it has probably gone off.
 */
export type Stock = Record<string, { qty: number; at: number }>;

/** Read an amount back from a shopping-list note: "1.2 kg", "605 g", "2 × 155 g can", "6 piraso", "¼ kilo". */
export function parseBuy(note: string, ing: Ingredient): number {
  const t = note.trim().toLowerCase();
  const packs = /^(\d+)\s*[×x]\s*/.exec(t);
  if (packs) return Number(packs[1]) * ing.pack;
  const frac: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75 };
  const kilo = /^(\d+)?\s*([¼½¾])?\s*kilo/.exec(t);
  if (kilo && (kilo[1] || kilo[2])) return (Number(kilo[1] ?? 0) + (frac[kilo[2] ?? ''] ?? 0)) * 1000;
  const m = /^([\d.,]+)\s*(kg|g|ml|l|pcs?|piraso|tali)?\b/.exec(t);
  if (m) {
    const n = Number(m[1].replace(',', ''));
    const u = m[2] ?? '';
    if (u === 'kg' || u === 'l') return n * 1000;
    if (u === 'tali') return n * ing.pack;
    return n;
  }
  return ing.pack;
}

export function addStock(stock: Stock, id: string, qty: number, at: number): Stock {
  const cur = stock[id];
  return { ...stock, [id]: { qty: (cur?.qty ?? 0) + qty, at } };
}

/** Use up what a dish took. Things that run out disappear. */
export function consume(stock: Stock, lines: { id: string; qty: number }[]): Stock {
  const next = { ...stock };
  for (const l of lines) {
    const cur = next[l.id];
    if (!cur) continue;
    const left = cur.qty - l.qty;
    if (left <= (INGREDIENT[l.id]?.unit === 'pc' ? 0.4 : 5)) delete next[l.id];
    else next[l.id] = { ...cur, qty: left };
  }
  return next;
}

/** Days until each item goes off (negative once it has). */
export function daysLeft(stock: Stock, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, s] of Object.entries(stock)) {
    const life = INGREDIENT[id]?.life ?? 30;
    out[id] = Math.floor(life - (now - s.at) / DAY);
  }
  return out;
}

/** Items that go off within `within` days (and haven't yet), soonest first. */
export function goingOff(stock: Stock, now: number, within = 3): Record<string, number> {
  const left = daysLeft(stock, now);
  return Object.fromEntries(
    Object.entries(left)
      .filter(([, d]) => d >= 0 && d <= within)
      .sort((a, b) => a[1] - b[1]),
  );
}

/** Ingredient ids still good to cook with. */
export function inKitchen(stock: Stock, now: number): string[] {
  return Object.entries(daysLeft(stock, now))
    .filter(([, d]) => d >= 0)
    .map(([id]) => id);
}

/** Drop what has gone off. */
export function prune(stock: Stock, now: number): Stock {
  const left = daysLeft(stock, now);
  return Object.fromEntries(Object.entries(stock).filter(([id]) => left[id] >= 0));
}
