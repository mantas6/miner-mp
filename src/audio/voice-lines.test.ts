// The two decisions behind the splash-screen voice-over: which lyric comes
// next, and how long the silence before it lasts.

import { describe, expect, it } from 'vitest';
import {
  nextVoiceGapMs,
  pickVoiceLine,
  VOICE_GAP_MAX_MS,
  VOICE_GAP_MIN_MS,
  VOICE_LINES,
  type VoiceLine
} from './voice-lines';

/** A source that hands out the given values in order, then repeats the last. */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('voice line registry', () => {
  it('ships every lyric of the song with both encodings', () => {
    expect(VOICE_LINES).toHaveLength(4);
    expect(VOICE_LINES.map(line => line.text)).toEqual([
      'Golden signal, shining bright',
      'Lift us through the neon night',
      'Golden signal, hold the line',
      'We are sparks in silver time'
    ]);
    for (const line of VOICE_LINES) {
      expect(line.mp3).toBe(`assets/voice/${line.id}.mp3`);
      expect(line.ogg).toBe(`assets/voice/${line.id}.ogg`);
      // Relative, so the build works under the GitHub Pages project subpath.
      expect(line.mp3.startsWith('/')).toBe(false);
    }
  });

  it('gives every line a distinct id', () => {
    expect(new Set(VOICE_LINES.map(line => line.id)).size).toBe(VOICE_LINES.length);
  });
});

describe('pickVoiceLine', () => {
  it('picks from the whole set when nothing has been spoken yet', () => {
    expect(pickVoiceLine(VOICE_LINES, null, () => 0)).toBe(VOICE_LINES[0]);
    expect(pickVoiceLine(VOICE_LINES, null, () => 0.99)).toBe(VOICE_LINES[3]);
  });

  it('never repeats the line that just played', () => {
    for (const previous of VOICE_LINES) {
      for (const roll of [0, 0.2, 0.5, 0.7, 0.99]) {
        expect(pickVoiceLine(VOICE_LINES, previous, () => roll)?.id).not.toBe(previous.id);
      }
    }
  });

  it('still reaches every other line once one is excluded', () => {
    const previous = VOICE_LINES[1];
    const picked = new Set(
      [0, 0.4, 0.8].map(roll => pickVoiceLine(VOICE_LINES, previous, () => roll)?.id)
    );
    expect(picked).toEqual(new Set(['golden-signal-line-1', 'golden-signal-line-3', 'golden-signal-line-4']));
  });

  it('walks a long run without a single immediate repeat', () => {
    const random = sequence([0.9, 0.1, 0.55, 0.33, 0.99, 0.0, 0.42, 0.77, 0.61, 0.05, 0.5, 0.25]);
    let previous: VoiceLine | null = null;
    const heard: string[] = [];
    for (let i = 0; i < 12; i++) {
      const line = pickVoiceLine(VOICE_LINES, previous, random);
      expect(line).not.toBeNull();
      expect(line!.id).not.toBe(previous?.id);
      heard.push(line!.id);
      previous = line;
    }
    // A random order, not a rotation: the run is not simply the list repeated.
    expect(new Set(heard).size).toBeGreaterThan(1);
  });

  it('survives a source that returns the exclusive upper bound', () => {
    expect(pickVoiceLine(VOICE_LINES, null, () => 1)).toBe(VOICE_LINES[3]);
    expect(pickVoiceLine(VOICE_LINES, VOICE_LINES[0], () => 1)).toBe(VOICE_LINES[3]);
  });

  it('has nothing to avoid with a single line, and nothing to give with none', () => {
    const only = [VOICE_LINES[2]];
    expect(pickVoiceLine(only, VOICE_LINES[2], () => 0.5)).toBe(VOICE_LINES[2]);
    expect(pickVoiceLine([], null, () => 0.5)).toBeNull();
  });
});

describe('nextVoiceGapMs', () => {
  it('stays inside the advertised few-second window', () => {
    expect(nextVoiceGapMs(() => 0)).toBe(VOICE_GAP_MIN_MS);
    expect(nextVoiceGapMs(() => 1)).toBe(VOICE_GAP_MAX_MS);
    for (const roll of [0.01, 0.25, 0.5, 0.75, 0.999]) {
      const gap = nextVoiceGapMs(() => roll);
      expect(gap).toBeGreaterThanOrEqual(VOICE_GAP_MIN_MS);
      expect(gap).toBeLessThanOrEqual(VOICE_GAP_MAX_MS);
    }
  });

  it('spreads the gap rather than always returning the same wait', () => {
    expect(nextVoiceGapMs(() => 0.25)).not.toBe(nextVoiceGapMs(() => 0.75));
  });
});
