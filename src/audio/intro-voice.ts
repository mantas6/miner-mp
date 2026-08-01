// The robot voice that reads the "Golden Signal" lyrics over the splash screen.
//
// One shared `<audio>` element speaks a random line every few seconds for as
// long as the intro is mounted. It is deliberately *not* routed through the
// WebAudio graph: that graph needs a trusted gesture to resume, and the only
// gesture available on the splash is the one that dismisses it. An element can
// still be allowed to play on its own (Chrome grants it on sites the player
// visits often), so the scheduler simply asks every tick and keeps waiting while
// the answer is no.
//
// The lyrics belong to the song, so they follow the music switch, not the
// sound-effects one, and they are quieter than the soundtrack itself.

import { pickSource, prefersMp3 } from './encoding';
import { nextVoiceGapMs, pickVoiceLine, VOICE_LINES, type VoiceLine } from './voice-lines';

/** A beat of quiet before the first line, so the splash is not shouted at. */
export const VOICE_OPENING_DELAY_MS = 900;

/** How long to wait before asking the browser again after it refused to play. */
export const VOICE_BLOCKED_RETRY_MS = 2000;

/** Under the soundtrack's own 0.36, so a line never covers the music. */
export const VOICE_VOLUME = 0.3;

export interface IntroVoiceOptions {
  /** The soundtrack switch. False mutes the lyrics without stopping the loop. */
  wantsVoice(): boolean;
  lines?: readonly VoiceLine[];
  random?: () => number;
  /** Injectable for tests; the real thing is a plain `<audio>` element. */
  createElement?: () => HTMLAudioElement;
}

export interface IntroVoice {
  /** Begin (or restart) the loop. Safe to call when it is already running. */
  start(): void;
  /** Silence the current line and drop the element and the pending timer. */
  stop(): void;
}

export function createIntroVoice({
  wantsVoice,
  lines = VOICE_LINES,
  random = Math.random,
  createElement = () => new Audio()
}: IntroVoiceOptions): IntroVoice {
  let element: HTMLAudioElement | null = null;
  let timer = 0;
  let previous: VoiceLine | null = null;
  let running = false;

  function schedule(delay: number): void {
    clearTimeout(timer);
    timer = setTimeout(speak, delay) as unknown as number;
  }

  /** One line finished (or failed); leave a gap and pick another. */
  function onLineDone(): void {
    if (running) schedule(nextVoiceGapMs(random));
  }

  function speak(): void {
    if (!running || !element) return;
    // Muted right now, but the player may unmute while the splash is still up.
    if (!wantsVoice()) return schedule(VOICE_BLOCKED_RETRY_MS);

    const line = pickVoiceLine(lines, previous, random);
    if (!line) return;

    element.src = pickSource(line, prefersMp3(element));
    element.currentTime = 0;
    // Only a line that was actually heard counts as "the previous one", so a
    // blocked attempt cannot silently use up a turn in the no-repeat rotation.
    // Old browsers return nothing from `play()`; awaiting that is harmless.
    void (async () => {
      try {
        await element?.play();
        // `stop()` may have landed while the promise was in flight.
        if (running) previous = line;
      } catch {
        if (running) schedule(VOICE_BLOCKED_RETRY_MS);
      }
    })();
  }

  return {
    start() {
      if (running) return;
      running = true;
      element = createElement();
      element.preload = 'auto';
      element.volume = VOICE_VOLUME;
      // `ended` drives the loop; `error` keeps a missing asset from stalling it.
      element.addEventListener('ended', onLineDone);
      element.addEventListener('error', onLineDone);
      schedule(VOICE_OPENING_DELAY_MS);
    },

    stop() {
      running = false;
      clearTimeout(timer);
      timer = 0;
      previous = null;
      if (!element) return;
      element.removeEventListener('ended', onLineDone);
      element.removeEventListener('error', onLineDone);
      element.pause();
      // Dropping the source stops a buffering line from downloading on into the
      // lobby; the element itself is released with this closure.
      element.removeAttribute('src');
      element = null;
    }
  };
}
