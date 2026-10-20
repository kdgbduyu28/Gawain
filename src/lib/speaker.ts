import { allBusy, useHome } from '../store/useHome';
import { haBase, shouldAnnounce, speak, spoken, switchOn } from './announce';
import { Planned } from './reminders';
import { IS_WEB } from './web';

/** Says a reminder on the Home Assistant speaker, if it's set up and now is a good time. */
export function announcePlanned(p: Planned, now = Date.now()) {
  const s = useHome.getState();
  const a = s.settings.announce;
  if (p.id.startsWith('plug:')) {
    switchPlug(p.id.slice(5));
    return;
  }
  if (!shouldAnnounce(a, p, now, allBusy(s, now, 1), s.settings.schedule)) return;
  speak(a, spoken(p), IS_WEB).catch(() => {});
}

/** A smart-plug timer is due: switch the plug on, then clear the timer. */
function switchPlug(timerId: string) {
  const s = useHome.getState();
  const t = s.timers.find((x) => x.id === timerId);
  const a = s.settings.announce;
  if (!t?.plug || !haBase(a.url) || !a.token.trim()) return;
  switchOn(a, t.plug, IS_WEB)
    .catch(() => {})
    .finally(() => useHome.getState().stopTimer(timerId));
}
