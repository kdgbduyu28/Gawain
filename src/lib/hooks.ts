import { useEffect, useState } from 'react';
import { useHome } from '../store/useHome';

/** The current time, refreshed every `ms` (default: each minute) so due labels and gaps stay current. */
export function useNow(ms = 60_000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** True once saved data has loaded, so first-run checks don't fire on an empty store. */
export function useHydrated(): boolean {
  const [ok, setOk] = useState(useHome.persist.hasHydrated());
  useEffect(() => {
    if (ok) return;
    return useHome.persist.onFinishHydration(() => setOk(true));
  }, [ok]);
  return ok;
}
