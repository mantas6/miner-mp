import { describe, expect, it } from 'vitest';
import { SAMPLE_RATE, createRng, env, renderTrack, saw, sine, square, tri } from './music-engine';
import type { Event, Rng, TrackDefinition } from './music-engine';

// 120 BPM => a 0.25 s step, so four steps make a 1 s cycle. Keeping the cycle a
// whole multiple of the engine's 0.5 s bucket size means the periodicity
// assertions below are exact rather than approximate.
const STEP = 0.25;
const CYCLE_SECONDS = 4 * STEP;

function toneEvents(totalSteps: number, step: number): Event[] {
  const events: Event[] = [];
  for (let i = 0; i < totalSteps; i++) {
    // Four notes, so the pattern repeats with the 4-step cycle. The 0.4 s tail is
    // longer than a step, which makes the last event of the loop spill past the
    // end and exercises the seamless wrap.
    const freq = [220, 277.18, 329.63, 246.94][i % 4];
    events.push({ start: i * step, dur: 0.4, freq, gain: 0.4, kind: 'tone', pan: i % 2 === 0 ? -0.4 : 0.4 });
  }
  return events;
}

/** Deterministic and perfectly periodic: no noise voices anywhere. */
const toneTrack: TrackDefinition = {
  id: 'test-tone',
  title: 'Test Tone',
  bpm: 120,
  seed: 7,
  cycleSteps: 4,
  renderCycles: 2,
  buildEvents: toneEvents,
  renderEvent(ev: Event, local: number): number {
    const amp = env(local, ev.dur);
    if (amp <= 0) return 0;
    return amp * ev.gain * sine(ev.freq, local);
  }
};

/** Same skeleton plus a noise voice, to cover the RNG path through the mixer. */
const noisyTrack: TrackDefinition = {
  ...toneTrack,
  id: 'test-noisy',
  title: 'Test Noisy',
  buildEvents(totalSteps: number, step: number): Event[] {
    const events = toneEvents(totalSteps, step);
    for (let i = 0; i < totalSteps; i++) {
      events.push({ start: i * step + step * 0.5, dur: 0.05, freq: 8000, gain: 0.3, kind: 'noise', pan: 0 });
    }
    return events;
  },
  renderEvent(ev: Event, local: number, rng: Rng): number {
    const amp = env(local, ev.dur);
    if (amp <= 0) return 0;
    if (ev.kind === 'noise') return amp * ev.gain * (rng() * 2 - 1);
    return amp * ev.gain * sine(ev.freq, local);
  }
};

function maxAbs(data: Float32Array): number {
  let max = 0;
  for (const sample of data) max = Math.max(max, Math.abs(sample));
  return max;
}

function meanAbsDelta(data: Float32Array): number {
  let total = 0;
  for (let i = 1; i < data.length; i++) total += Math.abs(data[i] - data[i - 1]);
  return total / (data.length - 1);
}

/** Index of the first differing sample, or -1. Cheaper than a 90k-element `toEqual`. */
function firstDifference(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return Math.min(a.length, b.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

function firstBadSample(data: Float32Array): number {
  for (let i = 0; i < data.length; i++) {
    if (!Number.isFinite(data[i]) || data[i] < -1 || data[i] > 1) return i;
  }
  return -1;
}

describe('createRng', () => {
  it('replays the identical stream for a given seed', () => {
    const a = createRng(1917);
    const b = createRng(1917);
    const first = Array.from({ length: 32 }, () => a());
    const second = Array.from({ length: 32 }, () => b());

    expect(second).toEqual(first);
  });

  it('produces values inside [0, 1) and diverges between seeds', () => {
    const rng = createRng(3);
    const other = createRng(4);
    const values: number[] = [];
    for (let i = 0; i < 512; i++) values.push(rng());

    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    // A constant generator would pass the range check above.
    expect(new Set(values).size).toBeGreaterThan(400);
    expect(other()).not.toBe(values[0]);
  });
});

describe('env', () => {
  it('ramps over the attack, sustains, then releases to zero', () => {
    expect(env(0.005, 1)).toBeCloseTo(0.5, 10);
    expect(env(0.01, 1)).toBeCloseTo(1, 10);
    expect(env(0.5, 1)).toBe(1);
    expect(env(0.96, 1)).toBeCloseTo(0.5, 10);
    expect(env(1, 1)).toBe(0);
  });

  it('is silent outside the event window', () => {
    expect(env(-0.001, 1)).toBe(0);
    expect(env(1.5, 1)).toBe(0);
  });

  it('honours custom attack and release times', () => {
    expect(env(0.05, 1, 0.1, 0.2)).toBeCloseTo(0.5, 10);
    expect(env(0.9, 1, 0.1, 0.2)).toBeCloseTo(0.5, 10);
  });
});

describe('oscillators', () => {
  it('match their Python counterparts at known phases', () => {
    expect(sine(1, 0.25)).toBeCloseTo(1, 10);
    expect(saw(1, 0)).toBeCloseTo(-1, 10);
    expect(saw(1, 0.75)).toBeCloseTo(0.5, 10);
    expect(tri(1, 0)).toBeCloseTo(1, 10);
    expect(tri(1, 0.5)).toBeCloseTo(-1, 10);
    expect(tri(1, 0.25)).toBeCloseTo(0, 10);
    expect(square(1, 0.1, 0.5)).toBe(1);
    expect(square(1, 0.6, 0.5)).toBe(-1);
    expect(square(1, 0.3, 0.18)).toBe(-1);
  });
});

describe('renderTrack', () => {
  it('renders the requested number of cycles at the engine sample rate', () => {
    const rendered = renderTrack(toneTrack);

    expect(rendered.sampleRate).toBe(SAMPLE_RATE);
    expect(rendered.left).toHaveLength(Math.round(2 * CYCLE_SECONDS * SAMPLE_RATE));
    expect(rendered.right).toHaveLength(rendered.left.length);
  });

  it('is deterministic, including the noise voices', () => {
    const first = renderTrack(noisyTrack);
    const second = renderTrack(noisyTrack);

    expect(firstDifference(first.left, second.left)).toBe(-1);
    expect(firstDifference(first.right, second.right)).toBe(-1);
  });

  it('stays finite and inside the [-1, 1] ceiling', () => {
    const { left, right } = renderTrack(noisyTrack);

    expect(firstBadSample(left)).toBe(-1);
    expect(firstBadSample(right)).toBe(-1);
  });

  it('actually makes sound', () => {
    const { left, right } = renderTrack(noisyTrack);

    expect(maxAbs(left)).toBeGreaterThan(0.01);
    expect(maxAbs(right)).toBeGreaterThan(0.01);
  });

  it('pans events into both channels independently', () => {
    const { left, right } = renderTrack(toneTrack);

    // Hard-coded pans of ±0.4 mean the two channels must differ somewhere.
    let differs = false;
    for (let i = 0; i < left.length && !differs; i++) differs = left[i] !== right[i];
    expect(differs).toBe(true);
  });

  it('repeats exactly every cycle, so the loop has no seam', () => {
    const { left, right } = renderTrack(toneTrack);
    const cycleFrames = Math.round(CYCLE_SECONDS * SAMPLE_RATE);

    let worst = 0;
    for (let i = 0; i < cycleFrames; i++) {
      worst = Math.max(worst, Math.abs(left[i] - left[i + cycleFrames]));
      worst = Math.max(worst, Math.abs(right[i] - right[i + cycleFrames]));
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it('does not click when the end of the buffer wraps to the start', () => {
    const { left, right } = renderTrack(toneTrack);
    const last = left.length - 1;

    // The wrap-around step must look like any other step, not like a jump.
    expect(Math.abs(left[0] - left[last])).toBeLessThan(10 * meanAbsDelta(left));
    expect(Math.abs(right[0] - right[last])).toBeLessThan(10 * meanAbsDelta(right));
  });

  it('asks for the 16-step margin but never plays events past the end of the loop', () => {
    const seen: number[] = [];
    const withMargin: TrackDefinition = {
      ...toneTrack,
      id: 'test-margin',
      buildEvents(totalSteps: number, step: number): Event[] {
        seen.push(totalSteps);
        const events = toneEvents(totalSteps, step);
        // A blast well past the loop end. In an infinite loop it would never be
        // heard at its literal time, so the render must ignore it entirely.
        events.push({ start: 2 * CYCLE_SECONDS + 0.5, dur: 0.4, freq: 60, gain: 5, kind: 'tone', pan: 0 });
        return events;
      }
    };
    const trimmed: TrackDefinition = {
      ...toneTrack,
      id: 'test-trimmed',
      buildEvents: (totalSteps, step) => toneEvents(totalSteps, step).filter((ev) => ev.start < 2 * CYCLE_SECONDS)
    };

    const rendered = renderTrack(withMargin);
    expect(seen).toEqual([4 * 2 + 16]);
    expect(firstDifference(rendered.left, renderTrack(trimmed).left)).toBe(-1);
  });
});
