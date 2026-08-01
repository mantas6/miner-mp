#!/usr/bin/env python3
"""
Track-agnostic synthesis, rendering and encoding engine for the game soundtrack.

This module holds everything that is *not* musical content: oscillators,
envelopes, the note-name helper, the event container, the per-sample mixdown
that writes a 16-bit stereo WAV, and the ffmpeg encode step that produces the
browser playback assets (MP3 + OGG).

Musical content lives in `soundtrack/tracks/<slug>.py`; each track module builds
a `Track` describing its tempo, seed and the two callbacks the mixer needs:

    build_events(duration) -> list[Event]
    render_sample(event, t, rng) -> float

The engine is deterministic: given the same track and duration it always
produces byte-identical output (stdlib `random.Random` seeded from the track).
"""

from __future__ import annotations

import math
import random
import shutil
import struct
import subprocess
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

SAMPLE_RATE = 44_100

# Semitone offsets from A within an octave. Frequencies are generated from note
# names so arrangements stay readable/editable.
NOTE_BASE = {
    "C": -9, "C#": -8, "Db": -8, "D": -7, "D#": -6, "Eb": -6,
    "E": -5, "F": -4, "F#": -3, "Gb": -3, "G": -2, "G#": -1,
    "Ab": -1, "A": 0, "A#": 1, "Bb": 1, "B": 2,
}


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


@dataclass(frozen=True)
class Track:
    """A renderable track: metadata plus the two mixer callbacks."""

    name: str
    slug: str
    bpm: int
    seed: int
    default_duration: float
    build_events: Callable[[float], list[Event]]
    render_sample: Callable[[Event, float, random.Random], float]


def write_wav(path: Path, duration: float, track: Track) -> None:
    rng = random.Random(track.seed)
    events = track.build_events(duration)
    frames = int(duration * SAMPLE_RATE)

    # Bucket events by rough start time so each sample only checks nearby events.
    bucket_size = 0.5
    buckets: dict[int, list[Event]] = {}
    for ev in events:
        start_b = int(ev.start / bucket_size)
        end_b = int((ev.start + ev.dur) / bucket_size)
        for b in range(start_b, end_b + 1):
            buckets.setdefault(b, []).append(ev)

    render_sample = track.render_sample
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


def render_track(track: Track, duration: float, out_prefix: Path, keep_wav: bool = False) -> list[Path]:
    """Render `track` to `<out_prefix>.{wav,mp3,ogg}` and report what was written."""
    wav_path = out_prefix.with_suffix(".wav")
    print(f"Rendering {duration:.1f}s of {track.name!r} to {wav_path} ...")
    write_wav(wav_path, duration, track)
    encode_with_ffmpeg(wav_path, out_prefix)
    if not keep_wav and out_prefix.with_suffix(".mp3").exists() and out_prefix.with_suffix(".ogg").exists():
        wav_path.unlink(missing_ok=True)

    written: list[Path] = []
    for suffix in (".wav", ".mp3", ".ogg"):
        p = out_prefix.with_suffix(suffix)
        if p.exists():
            written.append(p)
            print(f"  {p} ({p.stat().st_size:,} bytes)")
    return written
