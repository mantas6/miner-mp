// "Golden Signal" — the A-minor Soviet/industrial mining march.
//
// A direct port of the arrangement from the retired `soundtrack_source.py`
// offline renderer (patterns, event scheduling and voice synthesis), now
// expressed as a `TrackDefinition` the engine renders at runtime. Frequencies
// are derived from note names so the arrangement stays readable and editable.

import { env, saw, sine, square, tri } from '../music-engine';
import type { Event, Rng, TrackDefinition } from '../music-engine';

/** Semitone offsets from A4, keyed by note name. */
const NOTE_BASE: Record<string, number> = {
  C: -9, 'C#': -8, Db: -8, D: -7, 'D#': -6, Eb: -6,
  E: -5, F: -4, 'F#': -3, Gb: -3, G: -2, 'G#': -1,
  Ab: -1, A: 0, 'A#': 1, Bb: 1, B: 2
};

const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const BASS = ['A1', 'A1', 'C2', 'A1', 'D2', 'C2', 'G1', 'G1'];
const LEAD: (string | null)[] = [
  'A3', null, 'B3', 'C4', null, 'G3', 'F#3', null,
  'A3', 'B3', 'D4', 'C4', null, 'G3', 'E3', null
];
const CHORDS = ['Am', 'Am', 'F', 'G', 'Am', 'C', 'Dm', 'E'];

/** Scientific pitch notation (`"F#3"`) to Hz. A null note is silence. */
export function noteFreq(note: string | null): number {
  if (note === null) return 0;
  const name = note.slice(0, -1);
  const octave = Number.parseInt(note.slice(-1), 10);
  const semisFromA4 = NOTE_BASE[name] + (octave - 4) * 12;
  return 440 * 2 ** (semisFromA4 / 12);
}

/**
 * Triad note names for a chord symbol, e.g. `"Am"` -> `["A3", "C3", "E3"]`.
 * Every voice is pinned to octave 3, which is what keeps the stabs sitting
 * between the bass and the lead.
 */
export function chordNotes(symbol: string): string[] {
  const minor = symbol.endsWith('m');
  const root = minor ? symbol.slice(0, -1) : symbol;
  const rootIndex = CHROMATIC.indexOf(root);
  const intervals = [0, minor ? 3 : 4, 7];
  return intervals.map((i) => `${CHROMATIC[(rootIndex + i) % 12]}3`);
}

function buildEvents(totalSteps: number, step: number): Event[] {
  const events: Event[] = [];

  for (let i = 0; i < totalSteps; i++) {
    const t = i * step;
    const bassNote = BASS[i % BASS.length];
    events.push({ start: t, dur: step * 0.92, freq: noteFreq(bassNote), gain: 0.23, kind: 'bass', pan: -0.05 });

    // Lead motif every other step, mirroring the in-game WebAudio fallback.
    if (i % 2 === 0) {
      const leadNote = LEAD[Math.floor(i / 2) % LEAD.length];
      if (leadNote) {
        events.push({ start: t + 0.025, dur: step * 0.7, freq: noteFreq(leadNote), gain: 0.105, kind: 'lead', pan: 0.23 });
      }
    }

    // Accordion/brass chord stabs at bar starts and mid-bars.
    if (i % 8 === 0 || i % 8 === 4) {
      const chord = CHORDS[Math.floor(i / 8) % CHORDS.length];
      const notes = chordNotes(chord);
      for (let n = 0; n < notes.length; n++) {
        events.push({
          start: t + n * 0.012,
          dur: step * 2.7,
          freq: noteFreq(notes[n]),
          gain: 0.07,
          kind: 'chord',
          pan: -0.18 + n * 0.16
        });
      }
    }

    // Percussion as pitched/noise-like synth events.
    if (i % 2 === 0) events.push({ start: t, dur: 0.075, freq: 63, gain: 0.32, kind: 'kick', pan: 0 });
    if (i % 4 === 2) events.push({ start: t, dur: 0.1, freq: 185, gain: 0.17, kind: 'snare', pan: 0 });
    events.push({ start: t + step * 0.48, dur: 0.045, freq: 9000, gain: 0.035, kind: 'hat', pan: 0.15 });
  }

  return events;
}

/** `local` is time since the event started; see `TrackDefinition.renderEvent`. */
function renderEvent(ev: Event, local: number, rng: Rng): number {
  const amp = env(local, ev.dur);
  if (amp <= 0) return 0;

  switch (ev.kind) {
    case 'bass': {
      // Detuned sine + restrained saw for drilling-machine weight.
      return amp * ev.gain * (0.78 * sine(ev.freq, local) + 0.22 * saw(ev.freq * 0.995, local));
    }
    case 'lead': {
      const vibrato = 1 + 0.006 * sine(5.5, local);
      return amp * ev.gain * (0.7 * tri(ev.freq * vibrato, local) + 0.3 * sine(ev.freq * 2, local));
    }
    case 'chord': {
      const trem = 0.7 + 0.3 * sine(7.5, local);
      return amp * ev.gain * trem * (0.55 * saw(ev.freq, local) + 0.45 * square(ev.freq * 0.5, local, 0.42));
    }
    case 'kick': {
      const drop = ev.freq * (1 + 3.5 * (1 - local / ev.dur));
      return amp * ev.gain * sine(drop, local);
    }
    case 'snare': {
      const noise = rng() * 2 - 1;
      const tone = square(ev.freq, local, 0.18);
      return amp * ev.gain * (0.65 * noise + 0.35 * tone);
    }
    case 'hat': {
      return amp * ev.gain * (rng() * 2 - 1);
    }
    default: {
      return 0;
    }
  }
}

export const goldenSignal: TrackDefinition = {
  id: 'golden-signal',
  title: 'Golden Signal',
  bpm: 125,
  seed: 1917,
  // The bass repeats every 8 steps, the lead every 32 and the chords every 64,
  // so 64 steps is the shortest musically seamless period.
  cycleSteps: 64,
  renderCycles: 4,
  buildEvents,
  renderEvent
};
