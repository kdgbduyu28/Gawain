import { kwhFromPresyo, lpgFromPresyo } from './energy';
import { INGREDIENTS, Ingredient, Source } from './ingredients';

/**
 * Turns Presyo's published government price files into a price per gram, millilitre
 * or piece for every ingredient. Presyo's data is static JSON on Cloudflare Pages
 * with open CORS, so browsers and phones read it directly.
 */

export const PRESYO = 'https://presyo.pages.dev/data';
export const NCR = '130000000';

export type Shop = 'palengke' | 'supermarket' | 'mixed';

type Series = { item: string; unit: string; spec?: string | null; s: (number | null)[] };
type SrpSection = { name: string; items: { item: string; size: string; srp: number }[] };

/** One Metro Manila market's prices from DA's daily monitoring: item name → price per kg (or piece). */
export type Market = { id: string; name: string; prices: Record<string, number> };


export type PresyoData = {
  area: string;
  psa: Series[];
  psaPeriod: string | null;
  /** DA monitors Metro Manila markets only, so this is empty elsewhere. */
  da: Series[];
  daDate: string | null;
  srp: SrpSection[];
  srpDate: string | null;
  /** Per-market prices (Metro Manila only). */
  markets: Market[];
  marketDate: string | null;
  /** LPG per kg from DOE's Metro Manila 11 kg tank prices, and the month. */
  lpg?: { perKg: number; period: string } | null;
  /** Typical electricity rate for the region (₱/kWh), and the month. */
  power?: { kwh: number; period: string } | null;
};

export type PriceSourceKind = 'psa' | 'da' | 'srp' | 'est';
/** `change` is the move over about a month (0.12 = 12% dearer), when the source has history. */
export type Price = { perUnit: number; source: PriceSourceKind; change?: number };
export type PriceBook = Record<string, Price>;

/** Fresh food costs a bit more at the supermarket than at the palengke; packaged goods don't change. */
export const SHOP_FACTOR: Record<Shop, number> = { palengke: 1, mixed: 1.05, supermarket: 1.12 };
const FRESH = new Set(['Meat & fish', 'Produce', 'Dairy & eggs', 'Rice & grains']);

const DA_FILES = ['meat', 'vegetables', 'pantry', 'seafood', 'fruits', 'rice'];

/** Download what the planner needs from Presyo for one region. */
export async function loadPresyo(area: string, get: typeof fetch = fetch): Promise<PresyoData> {
  const json = async <T,>(path: string): Promise<T | null> => {
    try {
      const r = await get(`${PRESYO}/${path}`);
      return r.ok ? ((await r.json()) as T) : null;
    } catch {
      return null;
    }
  };
  const isNcr = area === NCR;
  type Latest = { date: string; items: { item: string; m: Record<string, number> }[] };
  type MarketInfo = { id: string; name: string }[];
  const [lpgJson, powerJson, psa, srp, latestDa, marketInfo, ...da] = await Promise.all([
    json<Parameters<typeof lpgFromPresyo>[0]>('lpg/ncr-monthly.json'),
    json<Parameters<typeof kwhFromPresyo>[0]>(`power/${area}.json`),
    json<{ periods: string[]; items: Series[] }>(`psa/${area}.json`),
    json<{ effective: string; sections: SrpSection[] }>('grocery/srp.json'),
    isNcr ? json<Latest>('da/latest.json') : Promise.resolve(null),
    isNcr ? json<MarketInfo>('markets.json') : Promise.resolve(null),
    ...(isNcr ? DA_FILES.map((f) => json<{ periods: string[]; items: Series[] }>(`da/index-${f}.json`)) : []),
  ]);
  const daOk = da.filter((d): d is { periods: string[]; items: Series[] } => !!d);
  return {
    area,
    psa: psa?.items ?? [],
    psaPeriod: psa?.periods.at(-1) ?? null,
    da: daOk.flatMap((d) => d.items),
    daDate: daOk[0]?.periods.at(-1) ?? null,
    srp: srp?.sections ?? [],
    srpDate: srp?.effective ?? null,
    markets: latestDa ? marketsFrom(latestDa.items, marketInfo ?? []) : [],
    marketDate: latestDa?.date ?? null,
    lpg: lpgFromPresyo(lpgJson),
    power: kwhFromPresyo(powerJson),
  };
}

/** Pivot DA's item → market prices into market → item prices (local and imported variants averaged). */
export function marketsFrom(items: { item: string; m: Record<string, number> }[], info: { id: string; name: string }[]): Market[] {
  const byMarket = new Map<string, Map<string, number[]>>();
  for (const it of items)
    for (const [mid, price] of Object.entries(it.m)) {
      if (typeof price !== 'number') continue;
      const m = byMarket.get(mid) ?? new Map<string, number[]>();
      m.set(it.item, [...(m.get(it.item) ?? []), price]);
      byMarket.set(mid, m);
    }
  const names = new Map(info.map((x) => [x.id, x.name]));
  return [...byMarket].map(([id, m]) => ({
    id,
    name: names.get(id) ?? id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    prices: Object.fromEntries([...m].map(([k, v]) => [k, median(v)!])),
  }));
}

/** Most recent value in the last month of a daily or monthly series, and where it is. */
function latestAt(s: (number | null)[]): { v: number; i: number } | null {
  for (let i = s.length - 1; i >= Math.max(0, s.length - 30); i--) if (typeof s[i] === 'number') return { v: s[i] as number, i };
  return null;
}

/** The value about `back` steps before index `i` (nearest earlier value within a few steps). */
function before(s: (number | null)[], i: number, back: number): number | null {
  for (let j = i - back; j >= Math.max(0, i - back - 7); j--) if (typeof s[j] === 'number') return s[j] as number;
  return null;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

type Measured = { price: number; per: 'kg' | 'L' | 'pc'; change?: number };

/** "1 Liter/bottle", "350 ml/bottle", "155g", "370mL", "1,000 ml/bottle" → litres or kilograms. */
export function parseSize(s: string | null | undefined): { amount: number; per: 'kg' | 'L' } | null {
  const m = s && /([\d.,]+)\s*(kg|g|ml|l|liter|litre)\b/i.exec(s);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  const u = m[2].toLowerCase();
  if (u === 'kg') return { amount: n, per: 'kg' };
  if (u === 'g') return { amount: n / 1000, per: 'kg' };
  if (u === 'ml') return { amount: n / 1000, per: 'L' };
  return { amount: n, per: 'L' };
}

/**
 * Median latest price across matching rows (DA lists local and imported, branded and
 * unbranded separately). `back` is how many steps make a month: 30 for DA's daily
 * series, 1 for PSA's monthly ones.
 */
function fromSeries(series: Series[], name: string, back: number, spec?: string): Measured | null {
  const want = name.toLowerCase();
  const rows = series.filter((r) => r.item.toLowerCase() === want && (!spec || (r.spec ?? '').toLowerCase().includes(spec.toLowerCase())));
  const vals: { v: number; per: Measured['per']; ch: number | null }[] = [];
  for (const r of rows) {
    const at = latestAt(r.s);
    if (!at) continue;
    const prev = before(r.s, at.i, back);
    const ch = prev ? at.v / prev - 1 : null;
    if (r.unit === 'kg') vals.push({ v: at.v, per: 'kg', ch });
    else if (r.unit === 'pc') vals.push({ v: at.v, per: 'pc', ch });
    else if (r.unit === 'bottle') {
      const size = parseSize(r.spec);
      if (size?.per === 'L') vals.push({ v: at.v / size.amount, per: 'L', ch });
    }
  }
  if (!vals.length) return null;
  const per = vals[0].per;
  const same = vals.filter((x) => x.per === per);
  const price = median(same.map((x) => x.v));
  const changes = same.map((x) => x.ch).filter((x): x is number => x !== null);
  return price === null ? null : { price, per, change: changes.length ? median(changes)! : undefined };
}

function fromSrp(sections: SrpSection[], name: string, item?: string): Measured | null {
  const sec = sections.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (!sec) return null;
  const vals: { v: number; per: 'kg' | 'L' }[] = [];
  for (const it of sec.items) {
    if (item && !it.item.toLowerCase().includes(item.toLowerCase())) continue;
    const size = parseSize(it.size);
    if (size && size.amount > 0) vals.push({ v: it.srp / size.amount, per: size.per });
  }
  if (!vals.length) return null;
  const per = vals[0].per;
  return { price: median(vals.filter((x) => x.per === per).map((x) => x.v))!, per };
}

/** Price of one base unit (g, ml or pc) of `ing` from a measured price. */
function toBase(ing: Ingredient, m: Measured, f = 1): number | null {
  const same = (ing.unit === 'g' && m.per === 'kg') || (ing.unit === 'ml' && m.per === 'L');
  if (same) return (m.price / 1000) * f;
  if (ing.unit === 'pc' && m.per === 'pc') return m.price * f;
  // Different kinds (a corn cob priced per kg, coconut milk from a coconut): `f` converts.
  if (f !== 1) return m.price * f;
  return null;
}

function priceFrom(ing: Ingredient, src: Source, data: PresyoData): Price | null {
  let m: Measured | null = null;
  let kind: PriceSourceKind;
  if ('psa' in src) {
    m = fromSeries(data.psa, src.psa, 1);
    kind = 'psa';
  } else if ('da' in src) {
    m = fromSeries(data.da, src.da, 30, src.spec);
    kind = 'da';
  } else {
    m = fromSrp(data.srp, src.srp, src.item);
    kind = 'srp';
  }
  if (!m) return null;
  const perUnit = toBase(ing, m, src.f);
  if (!perUnit || perUnit <= 0 || !Number.isFinite(perUnit)) return null;
  return m.change !== undefined && Number.isFinite(m.change) ? { perUnit, source: kind, change: m.change } : { perUnit, source: kind };
}

/**
 * Price per base unit for every ingredient: the first Presyo source that has data
 * (DA only in Metro Manila), else the built-in estimate. Fresh food is adjusted for
 * where you shop.
 */
export function priceBook(data: PresyoData | null, shop: Shop): PriceBook {
  const out: PriceBook = {};
  for (const ing of INGREDIENTS) {
    let p: Price | null = null;
    if (data) for (const src of ing.src ?? []) if ((p = priceFrom(ing, src, data))) break;
    p ??= { perUnit: ing.est / ing.pack, source: 'est' };
    const factor = FRESH.has(ing.aisle) && p.source !== 'srp' ? SHOP_FACTOR[shop] : 1;
    out[ing.id] = { ...p, perUnit: p.perUnit * factor };
  }
  return out;
}

/** Share of ingredients priced from government data rather than estimates. */
export function coverage(book: PriceBook): number {
  const all = Object.values(book);
  return all.filter((p) => p.source !== 'est').length / all.length;
}

/** Regions Presyo has PSA prices for. */
/** Regions with a central city's position, for the weather when no home is saved. */
export const REGIONS: { code: string; name: string; lat: number; lng: number }[] = [
  { code: '130000000', name: 'Metro Manila', lat: 14.6, lng: 121.0 },
  { code: '140000000', name: 'Cordillera (CAR)', lat: 16.41, lng: 120.6 },
  { code: '010000000', name: 'Ilocos', lat: 16.62, lng: 120.32 },
  { code: '020000000', name: 'Cagayan Valley', lat: 17.61, lng: 121.73 },
  { code: '030000000', name: 'Central Luzon', lat: 15.03, lng: 120.69 },
  { code: '040000000', name: 'CALABARZON', lat: 14.2, lng: 121.16 },
  { code: '170000000', name: 'MIMAROPA', lat: 13.41, lng: 121.18 },
  { code: '050000000', name: 'Bicol', lat: 13.14, lng: 123.74 },
  { code: '060000000', name: 'Western Visayas', lat: 10.72, lng: 122.56 },
  { code: '070000000', name: 'Central Visayas', lat: 10.32, lng: 123.89 },
  { code: '080000000', name: 'Eastern Visayas', lat: 11.24, lng: 125.0 },
  { code: '090000000', name: 'Zamboanga Peninsula', lat: 7.83, lng: 123.43 },
  { code: '100000000', name: 'Northern Mindanao', lat: 8.48, lng: 124.65 },
  { code: '110000000', name: 'Davao Region', lat: 7.07, lng: 125.61 },
  { code: '120000000', name: 'SOCCSKSARGEN', lat: 6.5, lng: 124.85 },
  { code: '160000000', name: 'Caraga', lat: 8.95, lng: 125.54 },
  { code: '150000000', name: 'BARMM', lat: 7.22, lng: 124.25 },
];

export type MarketCost = { id: string; name: string; cost: number; items: number };

/**
 * What the market-priced part of a shopping list costs at each Metro Manila market.
 * Only markets that price most of those items are compared; a missing item is
 * filled in at the median of the other markets so totals stay comparable.
 */
export function compareMarkets(lines: { id: string; need: number }[], markets: Market[]): { covered: string[]; markets: MarketCost[] } {
  const priced = lines
    .map((l) => ({ ...l, ing: INGREDIENTS.find((i) => i.id === l.id) }))
    .filter((l): l is typeof l & { ing: Ingredient } => !!l.ing?.market && markets.some((m) => m.prices[l.ing!.market!] !== undefined));
  if (!priced.length || markets.length < 2) return { covered: [], markets: [] };
  const mid = new Map(priced.map((l) => [l.id, median(markets.map((m) => m.prices[l.ing.market!]).filter((x): x is number => x !== undefined))!]));
  const amount = (l: (typeof priced)[number]) => (l.ing.unit === 'pc' ? l.need : l.need / 1000);
  const out: MarketCost[] = [];
  for (const m of markets) {
    const have = priced.filter((l) => m.prices[l.ing.market!] !== undefined);
    if (have.length < priced.length * 0.75) continue;
    const cost = priced.reduce((n, l) => n + amount(l) * (m.prices[l.ing.market!] ?? mid.get(l.id)!), 0);
    out.push({ id: m.id, name: m.name, cost: Math.round(cost), items: have.length });
  }
  return { covered: priced.map((l) => l.id), markets: out.sort((a, b) => a.cost - b.cost) };
}
