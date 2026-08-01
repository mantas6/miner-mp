// Registry of the soundtracks shipped with the build.
//
// The audio files themselves are rendered offline by `soundtrack/render.py`
// into `public/assets/music/`. Adding a track means writing it under
// `soundtrack/tracks/`, re-rendering, and registering the ids here.

export type TrackId = 'golden-signal';

export interface MusicTrack {
  id: TrackId;
  title: string;
  /** Relative to the page, matching Vite's `base: './'`. */
  mp3: string;
  ogg: string;
}

export const TRACKS: Record<TrackId, MusicTrack> = {
  'golden-signal': {
    id: 'golden-signal',
    title: 'Golden Signal',
    mp3: 'assets/music/golden-signal.mp3',
    ogg: 'assets/music/golden-signal.ogg'
  }
};

export const DEFAULT_TRACK_ID: TrackId = 'golden-signal';
