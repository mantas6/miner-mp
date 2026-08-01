// Message shapes exchanged with `soundtrack.worker.ts`.
//
// These live apart from the worker entry point on purpose: importing the worker
// module for its types would pull its top-level `self.onmessage` registration
// into the main bundle, so callers import from here instead.

import type { TrackId } from './tracks';

export interface SoundtrackRenderRequest {
  type: 'render';
  trackId: TrackId;
}

export type SoundtrackWorkerRequest = SoundtrackRenderRequest;

export interface SoundtrackRenderedMessage {
  type: 'rendered';
  trackId: TrackId;
  /** Transferred, not copied — the buffers are detached in the worker. */
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
}

export interface SoundtrackErrorMessage {
  type: 'error';
  /** Null when the request itself was unreadable. */
  trackId: TrackId | null;
  message: string;
}

export type SoundtrackWorkerResponse = SoundtrackRenderedMessage | SoundtrackErrorMessage;
