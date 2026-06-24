#!/usr/bin/env python3
"""
Editable source for the Motherload clone soundtrack.

This is a deterministic, dependency-light Python synthesizer for the game's
looping Soviet/industrial mining theme. It renders a WAV directly with the
Python standard library and, when ffmpeg is available, also encodes MP3 and OGG.

Examples:
  # Smoke test render
  python3 soundtrack_source.py --duration 8 --out-prefix assets/soviet-soundtrack-test

  # Re-render browser assets used by game.js
  python3 soundtrack_source.py --duration 175 --out-prefix assets/soviet-soundtrack

Notes:
  - Existing committed MP3/OGG files are browser playback assets.
  - This file is the editable source: change BPM, patterns, instruments, or
    arrangement below, then re-render the assets.
"""

from __future__ import annotations

import argparse
import math
import os
import random
import shutil
import struct
import subprocess
import wave
from dataclasses import dataclass
from pathlib import Path

SAMPLE_RATE = 44_100
BPM = 125
SEED = 1917

# A minor-ish industrial march palette. Frequencies are generated from note names
# so the arrangement stays readable/editable.
NOTE_BASE = {
    "C": -9, "C#": -8, "Db": -8, "D": -7, "D#": -6, "Eb": -6,
    "E": -5, "F": -4, "F#": -3, "Gb": -3, "G": -2, "G#": -1,
    "Ab": -1, "A": 0, "A#": 1, "Bb": 1, "B": 2,
}

BASS = ["A1", "A1", "C2", "A1", "D2", "C2", "G1", "G1"]
LEAD = ["A3", None, "B3", "C4", None, "G3", "F#3", None,
        "A3", "B3", "D4", "C4", None, "G3", "E3", None]
CHORDS = ["Am", "Am", "F", "G", "Am", "C", "Dm", "E"]


def note_freq(note: str | None) -> float:
    if note is None:
        return 0.0
    name = note[:-1]
    octave = int(note[-1])
    semis_from_a4 = NOTE_BASE[name] + (octave - 4) * 12
    return 440.0 * (2.0 ** (semis_from_a4 / 12.0))


def clamp(x: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def env(t: float, dur: float, attack: float = 0.01, release: float = 0.08) -> float:
    if t < 0 or t > dur:
        return 0.0
    if t < attack:
        return t / max(attack, 1e-6)
    if t > dur - release:
        return max(0.0, (dur - t) / max(release, 1e-6))
    return 1.0


def sine(freq: float, t: float) -> float:
    return math.sin(2.0 * math.pi * freq * t)


def saw(freq: float, t: float) -> float:
    phase = (freq * t) % 1.0
    return 2.0 * phase - 1.0


def tri(freq: float, t: float) -> float:
    phase = (freq * t) % 1.0
    return 4.0 * abs(phase - 0.5) - 1.0


def square(freq: float, t: float, duty: float = 0.5) -> float:
    return 1.0 if ((freq * t) % 1.0) < duty else -1.0


@dataclass
class Event:
    start: float
    dur: float
    freq: float
    gain: float
    kind: str
    pan: float = 0.0


def chord_notes(symbol: str) -> list[str]:
    root = symbol.rstrip("m")
    minor = symbol.endswith("m")
    scale = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    root_i = scale.index(root)
    intervals = [0, 3 if minor else 4, 7]
    return [scale[(root_i + i) % 12] + "3" for i in intervals]


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


def write_wav(path: Path, duration: float) -> None:
    rng = random.Random(SEED)
    events = build_events(duration)
    frames = int(duration * SAMPLE_RATE)

    # Bucket events by rough start time so each sample only checks nearby events.
    bucket_size = 0.5
    buckets: dict[int, list[Event]] = {}
    for ev in events:
        start_b = int(ev.start / bucket_size)
        end_b = int((ev.start + ev.dur) / bucket_size)
        for b in range(start_b, end_b + 1):
            buckets.setdefault(b, []).append(ev)

    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        for i in range(frames):
            t = i / SAMPLE_RATE
            active = buckets.get(int(t / bucket_size), [])
            left = right = 0.0
            for ev in active:
                s = render_sample(ev, t, rng)
                left += s * (1.0 - max(ev.pan, 0.0) * 0.55)
                right += s * (1.0 + min(ev.pan, 0.0) * 0.55)

            # Gentle saturation + fade loop edges.
            fade = min(1.0, t / 1.25, (duration - t) / 1.25)
            left = math.tanh(left * 1.35) * 0.82 * fade
            right = math.tanh(right * 1.35) * 0.82 * fade
            wav.writeframes(struct.pack("<hh", int(clamp(left) * 32767), int(clamp(right) * 32767)))


def encode_with_ffmpeg(wav_path: Path, out_prefix: Path) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("ffmpeg not found; wrote WAV only.")
        return
    subprocess.run([ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(wav_path),
                    "-codec:a", "libmp3lame", "-b:a", "160k", str(out_prefix.with_suffix(".mp3"))], check=True)
    subprocess.run([ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(wav_path),
                    "-codec:a", "libvorbis", "-b:a", "128k", str(out_prefix.with_suffix(".ogg"))], check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Render the Motherload clone soundtrack from source.")
    parser.add_argument("--duration", type=float, default=175.0, help="render length in seconds")
    parser.add_argument("--out-prefix", default="assets/soviet-soundtrack-source",
                        help="output prefix, e.g. assets/soviet-soundtrack")
    parser.add_argument("--keep-wav", action="store_true", help="keep intermediate WAV after MP3/OGG encode")
    args = parser.parse_args()

    out_prefix = Path(args.out_prefix)
    wav_path = out_prefix.with_suffix(".wav")
    print(f"Rendering {args.duration:.1f}s soundtrack source to {wav_path} ...")
    write_wav(wav_path, args.duration)
    encode_with_ffmpeg(wav_path, out_prefix)
    if not args.keep_wav and out_prefix.with_suffix(".mp3").exists() and out_prefix.with_suffix(".ogg").exists():
        wav_path.unlink(missing_ok=True)
    print("Done.")
    for suffix in (".wav", ".mp3", ".ogg"):
        p = out_prefix.with_suffix(suffix)
        if p.exists():
            print(f"  {p} ({p.stat().st_size:,} bytes)")


if __name__ == "__main__":
    os.chdir(Path(__file__).resolve().parent)
    main()
