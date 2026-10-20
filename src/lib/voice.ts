/**
 * Hands-free cooking in the browser: read steps aloud and hear "next" / "back" /
 * "repeat" (or "sunod" / "balik" / "ulit"), and keep the screen on. Phones would need
 * native speech modules, which aren't in this build, so there it's tap only.
 */
import { IS_WEB } from './web';

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

const w = (IS_WEB && typeof window !== 'undefined' ? window : null) as (Window & { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }) | null;

export const canSpeak = !!w?.speechSynthesis;
export const canListen = !!(w?.SpeechRecognition ?? w?.webkitSpeechRecognition);

export function say(text: string, lang = 'en-US') {
  if (!w?.speechSynthesis) return;
  w.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.95;
  w.speechSynthesis.speak(u);
}

export function hush() {
  w?.speechSynthesis?.cancel();
}

export type Command = 'next' | 'back' | 'repeat' | 'timer';

/** What a heard phrase asks for, in English or Filipino. */
export function commandOf(text: string): Command | null {
  const s = text.toLowerCase();
  if (/\b(next|sunod|susunod|tuloy)\b/.test(s)) return 'next';
  if (/\b(back|previous|balik|bumalik)\b/.test(s)) return 'back';
  if (/\b(repeat|again|ulit|ulitin)\b/.test(s)) return 'repeat';
  if (/\b(timer|orasan)\b/.test(s)) return 'timer';
  return null;
}

/** Listen for commands until stopped; restarts itself when the browser ends a session. */
export function listen(onCommand: (c: Command) => void, lang = 'en-US'): () => void {
  const Ctor = w?.SpeechRecognition ?? w?.webkitSpeechRecognition;
  if (!Ctor) return () => {};
  let on = true;
  const rec = new Ctor();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = false;
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const c = commandOf(e.results[i][0].transcript);
      if (c) onCommand(c);
    }
  };
  rec.onend = () => {
    if (on) {
      try {
        rec.start();
      } catch {
        // Already started.
      }
    }
  };
  try {
    rec.start();
  } catch {
    // The browser said no (no mic permission).
  }
  return () => {
    on = false;
    rec.stop();
  };
}

/** Keep the screen awake while cooking (browsers that support it). */
export async function stayAwake(): Promise<() => void> {
  const nav = (typeof navigator !== 'undefined' ? navigator : null) as (Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }) | null;
  try {
    const lock = await nav?.wakeLock?.request('screen');
    return () => {
      lock?.release().catch(() => {});
    };
  } catch {
    return () => {};
  }
}
