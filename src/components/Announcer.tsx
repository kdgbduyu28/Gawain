import { announcePlanned } from '../lib/speaker';
import { usePlanTimers } from '../lib/usePlanTimers';
import { useHome } from '../store/useHome';

/**
 * Phones: the system shows the notification itself, but a speaker has to be
 * told at the time, so this says reminders while Gawain is open. (The browser
 * does this in WebNotifier.)
 */
export function Announcer() {
  // Speaking is optional; a rice-cooker plug timer still needs switching on.
  const on = useHome((s) => s.settings.announce.on || s.timers.some((t) => !!t.plug));
  usePlanTimers(announcePlanned, on);
  return null;
}
