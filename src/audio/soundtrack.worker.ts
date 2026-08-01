// Renders the soundtrack off the main thread.
//
// A full loop is ~2.7 M stereo frames of per-sample synthesis, which would stall
// the game for a second or two if it ran inline. The worker hands the finished
// channels back as transferables, so the main thread pays a pointer move rather
// than a 22 MB copy.

import { renderTrack } from './music-engine';
import { getTrack, isTrackId } from './tracks';
import type {
  SoundtrackErrorMessage,
  SoundtrackRenderedMessage,
  SoundtrackWorkerRequest,
  SoundtrackWorkerResponse
} from './worker-protocol';

// The project compiles against `lib: ["DOM"]`, which types `self` as a window and
// does not declare `DedicatedWorkerGlobalScope`. Pulling in `lib.webworker.d.ts`
// here would redeclare half of the DOM, so the two calls this file actually makes
// are spelled out instead.
interface SoundtrackWorkerScope {
  onmessage: ((event: MessageEvent<SoundtrackWorkerRequest>) => void) | null;
  postMessage(message: SoundtrackWorkerResponse, transfer?: Transferable[]): void;
}

const ctx = self as unknown as SoundtrackWorkerScope;

function fail(trackId: SoundtrackErrorMessage['trackId'], message: string): void {
  const response: SoundtrackErrorMessage = { type: 'error', trackId, message };
  // `DedicatedWorkerGlobalScope.postMessage` has no targetOrigin parameter; the
  // lint rule only sees the `Window.postMessage` shape our DOM-typed `self` has.
  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  ctx.postMessage(response);
}

ctx.onmessage = (event: MessageEvent<SoundtrackWorkerRequest>) => {
  const request = event.data;
  if (!request || request.type !== 'render') {
    fail(null, `Unsupported soundtrack worker request: ${JSON.stringify(request ?? null)}`);
    return;
  }

  const trackId = request.trackId;
  if (!isTrackId(trackId)) {
    fail(null, `Unknown track: ${String(trackId)}`);
    return;
  }

  try {
    const { left, right, sampleRate } = renderTrack(getTrack(trackId));
    const response: SoundtrackRenderedMessage = { type: 'rendered', trackId, left, right, sampleRate };
    ctx.postMessage(response, [left.buffer, right.buffer]);
  } catch (error) {
    fail(trackId, error instanceof Error ? error.message : String(error));
  }
};
