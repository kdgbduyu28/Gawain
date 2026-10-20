import { Busy, Schedule, merge } from '../gaps';
import { MIN, addDays, at, startOfDay } from '../time';

/**
 * Minutes of meetings during work hours on each of the next seven days, keyed by
 * weekday, so the planner can keep busy days' cooking quick.
 */
export function meetingLoad(busy: Busy[], s: Schedule, from: number): Record<number, number> {
  const out: Record<number, number> = {};
  const merged = merge(busy);
  for (let d = 0; d < 7; d++) {
    const day = startOfDay(addDays(from, d));
    const dow = new Date(day).getDay();
    if (!s.workDays.includes(dow)) {
      out[dow] = 0;
      continue;
    }
    const ws = at(day, s.workStart);
    const we = at(day, s.workEnd);
    let mins = 0;
    for (const b of merged) {
      const a = Math.max(b.start, ws);
      const z = Math.min(b.end, we);
      if (z > a) mins += (z - a) / MIN;
    }
    out[dow] = Math.round(mins);
  }
  return out;
}
