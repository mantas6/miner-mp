// The imperative handles the simulation still needs: the canvas it draws into and
// the panel that sizes it. Everything else the game used to poke — meters, labels,
// buttons, overlays, toasts — is now React reading `src/ui/store.ts`.
//
// These elements are *passed in*, never looked up. React owns the tree, so the
// mounted refs are the only honest source of them; a `getElementById` at module
// import time forced the first render to be committed synchronously (`flushSync`)
// and gave a missing element no possible recovery. Sizing lives here too, because
// the resize listener has the same lifetime as the surface it measures.

import type { DisposalScope } from './disposal';
import { setViewportSize, viewport } from './viewport';

/** The two elements the runtime is mounted against. */
export interface GameSurfaceRefs {
  canvas: HTMLCanvasElement;
  /** The focusable panel that owns the keyboard and dictates the canvas size. */
  panel: HTMLElement;
}

export interface GameSurface extends GameSurfaceRefs {
  ctx: CanvasRenderingContext2D;
  /** Re-measure the panel and rescale the backing store for the current DPR. */
  resize(): void;
}

function require2dContext(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = target.getContext('2d');
  if (!context) throw new Error('2D canvas rendering context is unavailable.');
  return context;
}

/**
 * Adopt a mounted canvas/panel pair, size it, and keep it sized until the scope
 * is disposed. Throws when the canvas cannot give up a 2D context, which the
 * caller turns into the visible `failed` runtime state.
 */
export function createGameSurface({canvas, panel}: GameSurfaceRefs, scope: DisposalScope): GameSurface {
  const ctx = require2dContext(canvas);

  function resize(): void {
    setViewportSize(
      panel.clientWidth || window.innerWidth,
      panel.clientHeight || window.innerHeight
    );

    const deviceScale = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = Math.round(viewport.widthPx * deviceScale);
    canvas.height = Math.round(viewport.heightPx * deviceScale);
    ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }

  resize();
  scope.onWindow('resize', resize);

  return {canvas, panel, ctx, resize};
}
