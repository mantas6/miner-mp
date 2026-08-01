import { describe, expect, it } from 'vitest';
import { SAMPLE_RATE, env, renderTrack, saw, sine } from '../music-engine';
import type { Event } from '../music-engine';
import { chordNotes, goldenSignal, noteFreq } from './golden-signal';
import { DEFAULT_TRACK_ID, TRACKS, getTrack, isTrackId } from './index';

const STEP = 0.24; // 125 BPM: a beat is 0.48 s, a step half of that.

function countKind(events: Event[], kind: string): number {
  return events.filter((ev) => ev.kind === kind).length;
}

function startsOf(events: Event[], kind: string): number[] {
  return events.filter((ev) => ev.kind === kind).map((ev) => ev.start);
}

describe('noteFreq', () => {
  it('anchors on A4 = 440 Hz and halves per octave down', () => {
    expect(noteFreq('A4')).toBeCloseTo(440, 10);
    expect(noteFreq('A3')).toBeCloseTo(220, 10);
    expect(noteFreq('A1')).toBeCloseTo(55, 10);
    expect(noteFreq('A5')).toBeCloseTo(880, 10);
  });

  it('resolves sharps, flats and enharmonic spellings identically', () => {
    expect(noteFreq('C4')).toBeCloseTo(261.6255653, 6);
    expect(noteFreq('F#3')).toBeCloseTo(184.9972114, 6);
    expect(noteFreq('Gb3')).toBeCloseTo(noteFreq('F#3'), 10);
    expect(noteFreq('A#2')).toBeCloseTo(noteFreq('Bb2'), 10);
  });

  it('treats a missing note as silence', () => {
    expect(noteFreq(null)).toBe(0);
  });
});

describe('chordNotes', () => {
  it('builds minor and major triads in octave 3', () => {
    expect(chordNotes('Am')).toEqual(['A3', 'C3', 'E3']);
    expect(chordNotes('F')).toEqual(['F3', 'A3', 'C3']);
    expect(chordNotes('Dm')).toEqual(['D3', 'F3', 'A3']);
    expect(chordNotes('C')).toEqual(['C3', 'E3', 'G3']);
    expect(chordNotes('G')).toEqual(['G3', 'B3', 'D3']);
    expect(chordNotes('E')).toEqual(['E3', 'G#3', 'B3']);
  });
});

describe('goldenSignal.buildEvents', () => {
  const events = goldenSignal.buildEvents(16, STEP);

  it('lays down one bass note and one hi-hat per step', () => {
    expect(countKind(events, 'bass')).toBe(16);
    expect(countKind(events, 'hat')).toBe(16);
    expect(startsOf(events, 'bass')).toEqual(Array.from({ length: 16 }, (_, i) => i * STEP));
  });

  it('plays the lead on even steps, skipping the rests in the motif', () => {
    // LEAD[0..7] is A3, -, B3, C4, -, G3, F#3, - so five of eight even steps sound.
    const starts = startsOf(events, 'lead');
    expect(starts).toHaveLength(5);
    for (const start of starts) {
      const step = Math.round((start - 0.025) / STEP);
      expect(step % 2).toBe(0);
    }
    expect(starts[0]).toBeCloseTo(0.025, 10);
  });

  it('stabs a three-note chord at bar starts and mid-bars only', () => {
    const starts = startsOf(events, 'chord');
    expect(starts).toHaveLength(12);
    const steps = [...new Set(starts.map((s) => Math.floor(s / STEP + 1e-9)))];
    expect(steps).toEqual([0, 4, 8, 12]);
    // Three voices staggered by 12 ms and fanned across the stereo field.
    const first = events.filter((ev) => ev.kind === 'chord').slice(0, 3);
    expect(first[0].pan).toBeCloseTo(-0.18, 10);
    expect(first[1].pan).toBeCloseTo(-0.02, 10);
    expect(first[2].pan).toBeCloseTo(0.14, 10);
    expect(first[1].start - first[0].start).toBeCloseTo(0.012, 10);
    expect(first.map((ev) => ev.freq)).toEqual(chordNotes('Am').map(noteFreq));
  });

  it('puts the kick on every other step and the snare on the backbeat', () => {
    expect(startsOf(events, 'kick')).toEqual([0, 2, 4, 6, 8, 10, 12, 14].map((i) => i * STEP));
    expect(startsOf(events, 'snare')).toEqual([2, 6, 10, 14].map((i) => i * STEP));
  });

  it('schedules nothing else', () => {
    expect(events).toHaveLength(16 + 5 + 12 + 8 + 4 + 16);
    expect(new Set(events.map((ev) => ev.kind))).toEqual(new Set(['bass', 'lead', 'chord', 'kick', 'snare', 'hat']));
  });
});

describe('goldenSignal.renderEvent', () => {
  const rng = () => 0.75;

  it('is silent before the event and after its release', () => {
    const ev: Event = { start: 0, dur: 0.2, freq: 220, gain: 0.5, kind: 'bass', pan: 0 };
    expect(goldenSignal.renderEvent(ev, -0.01, rng)).toBe(0);
    expect(goldenSignal.renderEvent(ev, 0.3, rng)).toBe(0);
  });

  it('produces bounded audio for every voice', () => {
    for (const kind of ['bass', 'lead', 'chord', 'kick', 'snare', 'hat']) {
      const ev: Event = { start: 0, dur: 0.2, freq: 220, gain: 0.3, kind, pan: 0 };
      let peak = 0;
      let finite = true;
      for (let i = 0; i < 4000; i++) {
        const s = goldenSignal.renderEvent(ev, i / SAMPLE_RATE, rng);
        if (!Number.isFinite(s)) finite = false;
        peak = Math.max(peak, Math.abs(s));
      }
      expect(finite, `${kind} must not produce NaN/Infinity`).toBe(true);
      expect(peak, `${kind} should sound`).toBeGreaterThan(0);
      // Every voice mixes unit-amplitude oscillators with weights summing to 1.
      expect(peak, `${kind} should stay within its gain`).toBeLessThanOrEqual(0.3 + 1e-9);
    }
  });

  it('ignores unknown voices', () => {
    const ev: Event = { start: 0, dur: 0.2, freq: 220, gain: 0.5, kind: 'theremin', pan: 0 };
    expect(goldenSignal.renderEvent(ev, 0.1, rng)).toBe(0);
  });

  it('sweeps the kick pitch down over the event, as the Python source does', () => {
    const ev: Event = { start: 0, dur: 0.075, freq: 63, gain: 1, kind: 'kick', pan: 0 };
    for (const local of [0.001, 0.02, 0.05, 0.074]) {
      const drop = ev.freq * (1 + 3.5 * (1 - local / ev.dur));
      const expected = env(local, ev.dur) * ev.gain * sine(drop, local);
      expect(goldenSignal.renderEvent(ev, local, rng)).toBeCloseTo(expected, 12);
    }
    // 4.5x the base pitch at the transient, settling to 1x at the tail.
    const pitchAt = (local: number) => 63 * (1 + 3.5 * (1 - local / 0.075));
    expect(pitchAt(0)).toBeCloseTo(63 * 4.5, 10);
    expect(pitchAt(0.075)).toBeCloseTo(63, 10);
  });

  it('mixes the bass from a sine and a slightly detuned saw', () => {
    const ev: Event = { start: 0, dur: 0.2, freq: 110, gain: 0.23, kind: 'bass', pan: 0 };
    const local = 0.05;
    const expected = env(local, ev.dur) * ev.gain * (0.78 * sine(ev.freq, local) + 0.22 * saw(ev.freq * 0.995, local));
    expect(goldenSignal.renderEvent(ev, local, rng)).toBeCloseTo(expected, 12);
  });
});

describe('goldenSignal render', () => {
  it('renders a short version to non-silent, in-range audio', () => {
    // One 8-step cycle instead of 4 x 64, to keep the suite fast.
    const { left, right, sampleRate } = renderTrack({ ...goldenSignal, cycleSteps: 8, renderCycles: 1 });

    expect(sampleRate).toBe(SAMPLE_RATE);
    expect(left).toHaveLength(Math.round(8 * 0.24 * SAMPLE_RATE));
    expect(right).toHaveLength(left.length);

    let peak = 0;
    let bad = -1;
    for (let i = 0; i < left.length; i++) {
      if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) bad = i;
      if (left[i] < -1 || left[i] > 1 || right[i] < -1 || right[i] > 1) bad = i;
      peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    }
    expect(bad).toBe(-1);
    expect(peak).toBeGreaterThan(0.01);
  });
});

describe('track registry', () => {
  it('resolves the default track', () => {
    expect(DEFAULT_TRACK_ID).toBe('golden-signal');
    expect(getTrack(DEFAULT_TRACK_ID)).toBe(goldenSignal);
    expect(getTrack('golden-signal').title).toBe('Golden Signal');
  });

  it('guards unknown ids', () => {
    expect(isTrackId('golden-signal')).toBe(true);
    expect(isTrackId('toString')).toBe(false);
    expect(isTrackId('nope')).toBe(false);
  });

  it('keys every definition by its own id', () => {
    for (const [id, track] of Object.entries(TRACKS)) expect(track.id).toBe(id);
  });
});
