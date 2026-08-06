// The one place React owns the simulation's lifetime.
//
// The runtime needs two mounted elements (the canvas and the panel that sizes it),
// which only exist after the first commit — so the boot belongs in an effect, not
// at module import time. In exchange the effect gets the two things the old
// import-time boot could never have: refs that are guaranteed to be mounted, and a
// cleanup that disposes the runtime, which is what makes StrictMode's double
// invocation (and Fast Refresh, and an error boundary remount) harmless.
//
// The factory is injected rather than imported, so the component tree never pulls
// `src/game/` into its own module graph — the same reason commands.ts exists. The
// contract below is therefore declared here, structurally matched by
// `createGameRuntime()`, and not imported from the game.

import { useEffect, useRef } from 'react';
import { uiStore } from './store';

/** The elements a runtime mounts against. */
export interface GameRuntimeSurface {
  canvas: HTMLCanvasElement;
  panel: HTMLElement;
}

export interface GameRuntimeHandle {
  dispose(): void;
}

export type GameRuntimeFactory = (surface: GameRuntimeSurface) => GameRuntimeHandle;

/** Whatever was thrown, as one line the failure notice can show. */
function describeFailure(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Boot `createRuntime` against the returned refs for as long as the component is
 * mounted, reporting `booting`/`ready`/`failed` into the store. Omitting the
 * factory mounts the chrome with no game behind it, which is what the UI tests do.
 */
export function useGameRuntime(createRuntime?: GameRuntimeFactory) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!createRuntime) return;
    const store = uiStore.getState();
    const canvas = canvasRef.current;
    const panel = panelRef.current;
    if (!canvas || !panel) {
      store.setRuntimeStatus('failed', 'The game surface is missing from the page.');
      return;
    }

    let runtime: GameRuntimeHandle;
    try {
      runtime = createRuntime({canvas, panel});
    } catch (error) {
      // A runtime that threw half-way through is not left running: the failure is
      // reported, and the notice offers a reload rather than a black rectangle.
      console.error('Game runtime failed to start', error);
      store.setRuntimeStatus('failed', describeFailure(error));
      return;
    }
    store.setRuntimeStatus('ready');

    return () => {
      runtime.dispose();
      uiStore.getState().setRuntimeStatus('booting');
    };
  }, [createRuntime]);

  return {canvasRef, panelRef};
}
