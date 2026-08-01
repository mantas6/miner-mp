// The sung lyrics of "Golden Signal", one robot voice-over per line.
//
// The audio files are rendered offline by `soundtrack/render_voice.sh` into
// `public/assets/voice/`; the ids here are that script's slugs, so editing a
// line means editing both. Like the soundtrack, every line ships as MP3 and OGG.
//
// This module is deliberately free of DOM and timers: it is the registry plus
// the two decisions the intro scheduler makes (which line next, how long to wait
// before it), which keeps both of them testable on their own.

export type VoiceLineId =
  | 'golden-signal-line-1'
  | 'golden-signal-line-2'
  | 'golden-signal-line-3'
  | 'golden-signal-line-4';

export interface VoiceLine {
  id: VoiceLineId;
  /** The lyric being spoken, for accessibility labels and for the render script. */
  text: string;
  /** Relative to the page, matching Vite's `base: './'`. */
  mp3: string;
  ogg: string;
}

function line(id: VoiceLineId, text: string): VoiceLine {
  return {id, text, mp3: `assets/voice/${id}.mp3`, ogg: `assets/voice/${id}.ogg`};
}

export const VOICE_LINES: readonly VoiceLine[] = [
  line('golden-signal-line-1', 'Golden signal, shining bright'),
  line('golden-signal-line-2', 'Lift us through the neon night'),
  line('golden-signal-line-3', 'Golden signal, hold the line'),
  line('golden-signal-line-4', 'We are sparks in silver time')
];

/** Silence between the end of one line and the start of the next. */
export const VOICE_GAP_MIN_MS = 2600;
export const VOICE_GAP_MAX_MS = 6200;

/**
 * The next line to speak: uniform over everything *except* the one just heard,
 * so the order stays unpredictable without ever stuttering the same lyric twice.
 * With a single line to choose from there is nothing to avoid, so it repeats.
 */
export function pickVoiceLine(
  lines: readonly VoiceLine[],
  previous: VoiceLine | null,
  random: () => number = Math.random
): VoiceLine | null {
  if (lines.length === 0) return null;
  const choices = previous && lines.length > 1 ? lines.filter(candidate => candidate.id !== previous.id) : lines;
  if (choices.length === 0) return lines[0];
  // `random()` is specified as [0, 1), but clamping costs nothing and a source
  // that returns exactly 1 would otherwise index past the end.
  const index = Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)));
  return choices[index];
}

/** A gap of a few seconds, so the splash reads as a loop and not a playlist. */
export function nextVoiceGapMs(random: () => number = Math.random): number {
  return Math.round(VOICE_GAP_MIN_MS + random() * (VOICE_GAP_MAX_MS - VOICE_GAP_MIN_MS));
}
