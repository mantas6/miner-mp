#!/usr/bin/env python3
"""
"Golden Signal" — the looping Soviet/industrial mining theme.

This is the reference track definition; copy this file to add a new track, then
register it in `soundtrack/tracks/__init__.py`.

A track module provides:
  - metadata constants (NAME, SLUG, BPM, SEED, DEFAULT_DURATION),
  - `build_events(duration)`: the arrangement, as a flat list of `Event`s,
  - `render_sample(ev, t, rng)`: the voice synthesis for one event at time `t`,
  - `TRACK`: an `engine.Track` tying those together for the renderer.

Everything below is deterministic; `rng` is a shared seeded stream, so changing
event order changes the noise voices too.
"""

from __future__ import annotations

import math
import random

from soundtrack.engine import Event, Track, chord_notes, env, note_freq, saw, sine, square, tri

NAME = "Golden Signal"
SLUG = "golden-signal"
BPM = 125
SEED = 1917
DEFAULT_DURATION = 175.0

# A minor-ish industrial march palette.
BASS = ["A1", "A1", "C2", "A1", "D2", "C2", "G1", "G1"]
LEAD = ["A3", None, "B3", "C4", None, "G3", "F#3", None,
        "A3", "B3", "D4", "C4", None, "G3", "E3", None]
CHORDS = ["Am", "Am", "F", "G", "Am", "C", "Dm", "E"]


def build_events(duration: float) -> list[Event]:
    beat = 60.0 / BPM
    step = beat / 2.0
    events: list[Event] = []
    total_steps = int(math.ceil(duration / step)) + 16

    for i in range(total_steps):
        t = i * step
        bass_note = BASS[i % len(BASS)]
        events.append(Event(t, step * 0.92, note_freq(bass_note), 0.23, "bass", -0.05))

        # Lead motif every other step, similar to the in-game WebAudio fallback.
        if i % 2 == 0:
            lead_note = LEAD[(i // 2) % len(LEAD)]
            if lead_note:
                events.append(Event(t + 0.025, step * 0.7, note_freq(lead_note), 0.105, "lead", 0.23))

        # Accordion/brass chord stabs at bar starts and mid-bars.
        if i % 8 in (0, 4):
            chord = CHORDS[(i // 8) % len(CHORDS)]
            for n, note in enumerate(chord_notes(chord)):
                events.append(Event(t + n * 0.012, step * 2.7, note_freq(note), 0.07, "chord", -0.18 + n * 0.16))

        # Percussion as pitched/noise-like synth events.
        if i % 2 == 0:
            events.append(Event(t, 0.075, 63, 0.32, "kick", 0.0))
        if i % 4 == 2:
            events.append(Event(t, 0.10, 185, 0.17, "snare", 0.0))
        if i % 1 == 0:
            events.append(Event(t + step * 0.48, 0.045, 9000, 0.035, "hat", 0.15))

    return events


def render_sample(ev: Event, t: float, rng: random.Random) -> float:
    local = t - ev.start
    amp = env(local, ev.dur)
    if amp <= 0:
        return 0.0

    if ev.kind == "bass":
        # Detuned sine + restrained saw for drilling-machine weight.
        return amp * ev.gain * (0.78 * sine(ev.freq, local) + 0.22 * saw(ev.freq * 0.995, local))
    if ev.kind == "lead":
        vibrato = 1.0 + 0.006 * sine(5.5, local)
        return amp * ev.gain * (0.7 * tri(ev.freq * vibrato, local) + 0.3 * sine(ev.freq * 2, local))
    if ev.kind == "chord":
        trem = 0.7 + 0.3 * sine(7.5, local)
        return amp * ev.gain * trem * (0.55 * saw(ev.freq, local) + 0.45 * square(ev.freq * 0.5, local, 0.42))
    if ev.kind == "kick":
        drop = ev.freq * (1.0 + 3.5 * (1.0 - local / ev.dur))
        return amp * ev.gain * sine(drop, local)
    if ev.kind == "snare":
        noise = rng.uniform(-1.0, 1.0)
        tone = square(ev.freq, local, 0.18)
        return amp * ev.gain * (0.65 * noise + 0.35 * tone)
    if ev.kind == "hat":
        return amp * ev.gain * rng.uniform(-1.0, 1.0)
    return 0.0


TRACK = Track(
    name=NAME,
    slug=SLUG,
    bpm=BPM,
    seed=SEED,
    default_duration=DEFAULT_DURATION,
    build_events=build_events,
    render_sample=render_sample,
)
