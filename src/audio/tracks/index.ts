// Registry of every renderable soundtrack.
//
// `TrackId` is the single source of truth for which tracks exist: the `Record`
// below will not compile until every id has a definition, and the worker
// protocol types reference the same union so an unknown id cannot be requested.

import { goldenSignal } from './golden-signal';
import type { TrackDefinition } from '../music-engine';

export type TrackId = 'golden-signal';

export const TRACKS: Record<TrackId, TrackDefinition> = {
  'golden-signal': goldenSignal
};

export const DEFAULT_TRACK_ID: TrackId = 'golden-signal';

export const TRACK_IDS = Object.keys(TRACKS) as TrackId[];

export function isTrackId(id: string): id is TrackId {
  return Object.hasOwn(TRACKS, id);
}

export function getTrack(id: TrackId): TrackDefinition {
  return TRACKS[id];
}
