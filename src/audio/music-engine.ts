// Track-agnostic procedural music engine.
//
// This is a DOM-free port of `soundtrack_source.py`, the Python script that used
// to render the game's soundtrack to MP3/OGG ahead of time. Instead of shipping
// audio assets we now synthesise the same PCM in a Web Worker at runtime, so the
// module must stay free of browser globals: it only does arithmetic over
// `Float32Array`s and is therefore equally happy in a worker, on the main thread
// or under Vitest in Node.
//
// The engine owns the parts every track shares — oscillators, the envelope, the
// event bucketing, the stereo mix and the bus saturation. Everything musical
// (patterns, note choices, timbres) lives in a `TrackDefinition` under `tracks/`.

/** Render rate for every track. Matches `SAMPLE_RATE` in `soundtrack_source.py`. */
export const SAMPLE_RATE = 44100;

/** Events are indexed into half-second buckets so each sample only visits nearby ones. */
const BUCKET_SIZE = 0.5;

/**
 * How much of the loop start also evaluates the previous pass's spill-over.
 * Anything shorter than the longest event tail would clip decaying notes at the
 * seam; 2 s comfortably covers the ~0.65 s chord stabs of the current tracks.
 */
const WRAP_SECONDS = 2;

// ---------------------------------------------------------------------------
// Shared DSP primitives (ports of soundtrack_source.py lines 62-91)
// ---------------------------------------------------------------------------

export function clamp(x: number, lo = -1, hi = 1): number {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Linear attack / sustain / linear release envelope.
 * Returns 0 outside `[0, dur]`, which is how voices switch themselves off.
 */
export function env(t: number, dur: number, attack = 0.01, release = 0.08): number {
  if (t < 0 || t > dur) return 0;
  if (t < attack) return t / Math.max(attack, 1e-6);
  if (t > dur - release) return Math.max(0, (dur - t) / Math.max(release, 1e-6));
  return 1;
}

export function sine(freq: number, t: number): number {
  return Math.sin(2 * Math.PI * freq * t);
}

export function saw(freq: number, t: number): number {
  const phase = modOne(freq * t);
  return 2 * phase - 1;
}

export function tri(freq: number, t: number): number {
  const phase = modOne(freq * t);
  return 4 * Math.abs(phase - 0.5) - 1;
}

export function square(freq: number, t: number, duty = 0.5): number {
  return modOne(freq * t) < duty ? 1 : -1;
}

/**
 * Python's `%` always returns a non-negative result for a positive modulus while
 * JavaScript's keeps the sign of the dividend. The oscillators are only ever fed
 * non-negative time, but negative phase would flip a waveform inside out, so the
 * Python semantics are reproduced here rather than assumed away.
 */
function modOne(x: number): number {
  const m = x % 1;
  return m < 0 ? m + 1 : m;
}

// ---------------------------------------------------------------------------
// Randomness
// ---------------------------------------------------------------------------

/** Uniform random source in `[0, 1)`. */
export type Rng = () => number;

/**
 * mulberry32. Deliberately *not* a port of Python's Mersenne Twister: the RNG
 * only ever feeds white noise (snare body, hi-hats), so bit-exact parity with the
 * old renders buys nothing. What does matter is that a given seed always produces
 * the same buffer, which mulberry32 gives us in a handful of integer ops.
 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Track contract
// ---------------------------------------------------------------------------

/** One scheduled voice. `pan` is -1 (hard left) .. +1 (hard right). */
export interface Event {
  start: number;
  dur: number;
  freq: number;
  gain: number;
  kind: string;
  pan: number;
}

export interface TrackDefinition {
  /**
   * Registry key. Typed as `string` rather than `TrackId` so the engine does not
   * have to import `./tracks`, which imports the engine back; the registry's
   * `Record<TrackId, TrackDefinition>` is what actually pins the ids down.
   */
  id: string;
  title: string;
  bpm: number;
  /** Seed for the noise voices. Same seed, same buffer. */
  seed: number;
  /** Musical period in steps, where one step is half a beat. */
  cycleSteps: number;
  /** How many whole periods the rendered loop contains. */
  renderCycles: number;
  /**
   * Schedules every voice for `totalSteps` steps of `step` seconds each.
   * Called once per render.
   */
  buildEvents(totalSteps: number, step: number): Event[];
  /**
   * Synthesises one sample of `ev`.
   *
   * Contract: `tLocal` is time *since the event started* (the engine has already
   * subtracted `ev.start`, unlike the Python original which passed absolute time
   * and subtracted internally). The voice is responsible for applying
   * `env(tLocal, ev.dur)` and for returning 0 once the envelope has closed — the
   * engine only sums and pans the result.
   */
  renderEvent(ev: Event, tLocal: number, rng: Rng): number;
}

export interface RenderedTrack {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

/**
 * Renders a track to a gapless stereo loop.
 *
 * The Python original faded 1.25 s in and out so the MP3 could be looped without
 * a click, which audibly ducked the music twice a minute. We instead render a
 * whole number of musical cycles and model the loop as genuinely infinite:
 *
 *  - only events starting inside `[0, T)` exist (the `+ 16` step margin that
 *    `buildEvents` is asked for is discarded — for a track whose pattern period
 *    divides `T` those extra events are exact copies of in-loop ones);
 *  - the main pass hears event `e` at `tLocal = t - e.start`, as usual;
 *  - during the first `WRAP_SECONDS` the wrap pass additionally hears the
 *    *previous* pass's image of every event, at `tLocal = t + T - e.start`. That
 *    is precisely the tail of a note that started near the end of the loop, so
 *    the seam carries the decay across instead of cutting it.
 *
 * Both passes are summed before the bus saturation, so the seam goes through the
 * same non-linearity as everything else and cannot poke above the ceiling.
 *
 * Caveat: events lasting longer than `WRAP_SECONDS` (or than `T`) still get their
 * tail truncated at the seam. Keep note durations well under two seconds.
 */
export function renderTrack(track: TrackDefinition): RenderedTrack {
  const step = 60 / track.bpm / 2;
  const loopSteps = track.cycleSteps * track.renderCycles;
  const loopSeconds = loopSteps * step;
  const frames = Math.round(loopSeconds * SAMPLE_RATE);

  // Built with the Python `+ 16` step margin, then trimmed: see the note above.
  const events = track.buildEvents(loopSteps + 16, step).filter((ev) => ev.start < loopSeconds);

  let latest = loopSeconds;
  for (const ev of events) latest = Math.max(latest, ev.start + ev.dur);
  const bucketCount = Math.floor(latest / BUCKET_SIZE) + 2;
  const buckets: Event[][] = Array.from({ length: bucketCount }, () => []);
  for (const ev of events) {
    const first = Math.max(0, Math.floor(ev.start / BUCKET_SIZE));
    const last = Math.min(bucketCount - 1, Math.floor((ev.start + ev.dur) / BUCKET_SIZE));
    for (let b = first; b <= last; b++) buckets[b].push(ev);
  }

  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const rng = createRng(track.seed);
  const wrapFrames = Math.min(frames, Math.ceil(Math.min(WRAP_SECONDS, loopSeconds) * SAMPLE_RATE));
  const empty: Event[] = [];

  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    let l = 0;
    let r = 0;

    const bucket = Math.floor(t / BUCKET_SIZE);
    const active = bucket < bucketCount ? buckets[bucket] : empty;
    for (let k = 0; k < active.length; k++) {
      const ev = active[k];
      const s = track.renderEvent(ev, t - ev.start, rng);
      l += s * (1 - Math.max(ev.pan, 0) * 0.55);
      r += s * (1 + Math.min(ev.pan, 0) * 0.55);
    }

    if (i < wrapFrames) {
      const tw = t + loopSeconds;
      const wrapBucket = Math.floor(tw / BUCKET_SIZE);
      const tails = wrapBucket < bucketCount ? buckets[wrapBucket] : empty;
      for (let k = 0; k < tails.length; k++) {
        const ev = tails[k];
        const s = track.renderEvent(ev, tw - ev.start, rng);
        l += s * (1 - Math.max(ev.pan, 0) * 0.55);
        r += s * (1 + Math.min(ev.pan, 0) * 0.55);
      }
    }

    left[i] = clamp(Math.tanh(l * 1.35) * 0.82);
    right[i] = clamp(Math.tanh(r * 1.35) * 0.82);
  }

  return { left, right, sampleRate: SAMPLE_RATE };
}
