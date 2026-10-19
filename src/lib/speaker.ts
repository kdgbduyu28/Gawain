import { allBusy, useHome } from '../store/useHome';
import { shouldAnnounce, speak, spoken } from './announce';
import { Planned } from './reminders';
import { IS_WEB } from './web';

/** Says a reminder on the Home Assistant speaker, if it's set up and now is a good time. */
export function announcePlanned(p: Planned, now = Date.now()) {
  const s = useHome.getState();
  const a = s.settings.announce;
  if (!shouldAnnounce(a, p, now, allBusy(s, now, 1), s.settings.schedule)) return;
  speak(a, spoken(p), IS_WEB).catch(() => {});
}
