#!/usr/bin/env python3
"""
CLI for rendering game soundtrack assets from source.

The tracks are deterministic Python synthesizers (stdlib only); ffmpeg is used
to encode the browser playback assets. Committed MP3/OGG files under
`public/assets/music/` are build products of this script.

Examples:
  # List registered tracks
  python3 soundtrack/render.py --list

  # Re-render the shipped assets for one track (default duration)
  python3 soundtrack/render.py golden-signal

  # Short smoke render somewhere else, keeping the WAV
  python3 soundtrack/render.py golden-signal --duration 8 --out-dir /tmp/x --keep-wav

  # Render everything
  python3 soundtrack/render.py --all
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Runnable as a plain script (`python3 soundtrack/render.py`) from anywhere:
# put the repo root on sys.path so `soundtrack.*` imports resolve.
REPO_ROOT = Path(__file__).resolve().parent.parent
if __package__ in (None, ""):
    sys.path.insert(0, str(REPO_ROOT))

from soundtrack.engine import Track, render_track  # noqa: E402
from soundtrack.tracks import TRACKS, get_track  # noqa: E402

DEFAULT_OUT_DIR = REPO_ROOT / "public" / "assets" / "music"


def list_tracks() -> None:
    if not TRACKS:
        print("No tracks registered.")
        return
    print("Available tracks:")
    for slug, track in sorted(TRACKS.items()):
        print(f"  {slug:<20} {track.name} ({track.bpm} BPM, default {track.default_duration:.0f}s)")


def render_one(track: Track, out_dir: Path, duration: float | None, keep_wav: bool) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    render_track(
        track,
        duration if duration is not None else track.default_duration,
        out_dir / track.slug,
        keep_wav=keep_wav,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Render game soundtrack assets from source.")
    parser.add_argument("track", nargs="?", help="track slug to render (see --list)")
    parser.add_argument("--all", action="store_true", help="render every registered track")
    parser.add_argument("--list", action="store_true", help="list available tracks and exit")
    parser.add_argument("--duration", type=float, default=None,
                        help="render length in seconds (default: the track's own default)")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR,
                        help=f"output directory (default: {DEFAULT_OUT_DIR})")
    parser.add_argument("--keep-wav", action="store_true", help="keep intermediate WAV after MP3/OGG encode")
    args = parser.parse_args()

    if args.list:
        list_tracks()
        return 0

    if args.all:
        selected = [TRACKS[slug] for slug in sorted(TRACKS)]
    elif args.track:
        try:
            selected = [get_track(args.track)]
        except KeyError as exc:
            parser.error(str(exc.args[0]))
    else:
        parser.error("give a track slug, or --all, or --list")

    out_dir = args.out_dir.expanduser()
    for track in selected:
        render_one(track, out_dir, args.duration, args.keep_wav)
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
