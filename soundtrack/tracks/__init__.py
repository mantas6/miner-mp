"""
Registry of renderable soundtrack tracks.

Add a track by dropping a module next to `golden_signal.py` (copy it as a
template) and registering its `TRACK` below, keyed by slug.
"""

from __future__ import annotations

from soundtrack.engine import Track

from . import golden_signal

TRACKS: dict[str, Track] = {
    golden_signal.SLUG: golden_signal.TRACK,
}


def get_track(slug: str) -> Track:
    """Look up a track by slug, with a helpful error listing what exists."""
    try:
        return TRACKS[slug]
    except KeyError:
        available = ", ".join(sorted(TRACKS)) or "(none registered)"
        raise KeyError(f"unknown track {slug!r}; available tracks: {available}") from None
