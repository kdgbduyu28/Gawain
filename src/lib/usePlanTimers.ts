import { useEffect, useRef } from 'react';
import { useHome } from '../store/useHome';
import { planFor } from './push';
import { Planned } from './reminders';
import { HOUR } from './time';

/** Only look this far ahead; the plan is rebuilt whenever anything changes anyway. */
const HORIZON = 24 * HOUR;

/**
 * Calls `onFire` for each planned reminder when it's due, while the app is open.
 * Browsers can't schedule notifications for later, and speakers have to be told
 * at the time, so this keeps timers for the next day's plan and rebuilds them
 * whenever the store changes.
 */
export function usePlanTimers(onFire: (p: Planned) => void, enabled = true) {
  const fire = useRef(onFire);
  useEffect(() => {
    fire.current = onFire;
  }, [onFire]);

  useEffect(() => {
    if (!enabled) return;
    const fired = new Set<string>();
    let timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = () => {
      timers.forEach(clearTimeout);
      const now = Date.now();
      timers = planFor(useHome.getState(), now)
        .filter((p) => p.at > now && p.at - now < HORIZON && !fired.has(p.id))
        .map((p) =>
          setTimeout(() => {
            fired.add(p.id);
            fire.current(p);
          }, p.at - now),
        );
    };
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useHome.subscribe(() => {
      clearTimeout(debounce);
      debounce = setTimeout(schedule, 500);
    });
    schedule();
    // Re-plan hourly so the 24-hour window keeps moving.
    const hourly = setInterval(schedule, HOUR);
    return () => {
      unsubscribe();
      clearTimeout(debounce);
      clearInterval(hourly);
      timers.forEach(clearTimeout);
    };
  }, [enabled]);
}
