import { startOfDay } from '../time';

/**
 * The week's weather from Open-Meteo (free, no key, works from the browser), so
 * rainy days get sabaw, hot days skip the oven and a coming storm gets a stock-up
 * list and dishes that don't need the market or the fridge.
 *
 * Open-Meteo has no PAGASA storm signals, so "storm" means the forecast itself
 * looks like one: strong gusts or a very wet day. People can also switch
 * bagyo mode on themselves.
 */

export type DayWeather = {
  /** Start of the day, local time. */
  date: number;
  tmax: number;
  rainMm: number;
  gustKmh: number;
  code: number;
  rain: boolean;
  hot: boolean;
  storm: boolean;
};

const API = 'https://api.open-meteo.com/v1/forecast';

export const HOT_C = 33;
export const RAIN_MM = 5;
export const STORM_GUST = 70;
export const STORM_RAIN_MM = 60;

/** Rain or showers or thunder in WMO weather codes. */
const RAINY_CODES = (c: number) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;

export function classify(date: number, tmax: number, rainMm: number, gustKmh: number, code: number): DayWeather {
  const storm = gustKmh >= STORM_GUST || rainMm >= STORM_RAIN_MM;
  return { date: startOfDay(date), tmax, rainMm, gustKmh, code, rain: rainMm >= RAIN_MM || (RAINY_CODES(code) && rainMm >= 1), hot: tmax >= HOT_C, storm };
}

type Daily = { time: string[]; weather_code: number[]; temperature_2m_max: number[]; precipitation_sum: number[]; wind_gusts_10m_max: number[] };

export function parseForecast(json: { daily?: Daily } | null): DayWeather[] {
  const d = json?.daily;
  if (!d?.time) return [];
  return d.time.map((t, i) => {
    const [y, m, day] = t.split('-').map(Number);
    return classify(new Date(y, m - 1, day).getTime(), d.temperature_2m_max[i] ?? 0, d.precipitation_sum[i] ?? 0, d.wind_gusts_10m_max[i] ?? 0, d.weather_code[i] ?? 0);
  });
}

export async function loadWeather(lat: number, lng: number, get: typeof fetch = fetch): Promise<DayWeather[]> {
  const q = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lng.toFixed(3),
    daily: 'weather_code,temperature_2m_max,precipitation_sum,wind_gusts_10m_max',
    timezone: 'Asia/Manila',
    forecast_days: '8',
  });
  try {
    const r = await get(`${API}?${q}`);
    return r.ok ? parseForecast(await r.json()) : [];
  } catch {
    return [];
  }
}

/** Weekday → that day's weather, for the planner. */
export function byWeekday(days: DayWeather[], from: number): Record<number, DayWeather> {
  const start = startOfDay(from);
  const out: Record<number, DayWeather> = {};
  for (const w of days) if (w.date >= start && w.date < start + 7 * 86_400_000) out[new Date(w.date).getDay()] = w;
  return out;
}

/** Days in the forecast that look like a storm. */
export const stormDays = (days: DayWeather[]) => days.filter((w) => w.storm);

/** What to have at home before a storm, beyond the plan's own shopping. Names match Gawain's grocery items. */
export const STORM_KIT = ['Rice', 'Canned sardines', 'Corned beef', 'Canned tuna', 'Instant noodles', 'Eggs', 'Bottled water', 'Batteries', 'Candles', 'Crackers'];
