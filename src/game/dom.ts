// The imperative handles the simulation still needs: the canvas it draws into and
// the panel that sizes it. Everything else the game used to poke — meters, labels,
// buttons, overlays, toasts — is now React reading `src/ui/store.ts`.

import { setViewportSize, viewport } from './viewport';

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required game DOM element #${id}`);
  return element as T;
}

export const canvas = requireElement<HTMLCanvasElement>('game');
export const gamePanel = requireElement<HTMLElement>('game-panel');

function require2dContext(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = target.getContext('2d');
  if (!context) throw new Error('2D canvas rendering context is unavailable.');
  return context;
}

export const ctx = require2dContext(canvas);

function resizeCanvas(): void {
  setViewportSize(
    gamePanel.clientWidth || window.innerWidth,
    gamePanel.clientHeight || window.innerHeight
  );

  const deviceScale = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  canvas.width = Math.round(viewport.widthPx * deviceScale);
  canvas.height = Math.round(viewport.heightPx * deviceScale);
  ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
  ctx.imageSmoothingEnabled = true;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);
