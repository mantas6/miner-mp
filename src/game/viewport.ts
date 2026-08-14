// Canvas viewport dimensions and zoom level.
//
// These live apart from `dom.ts` for two reasons: they are plain numbers with no
// DOM dependency (so gameplay modules can read them without pulling the element
// graph in), and they change on every resize. Exporting one frozen-shape object
// keeps every reader looking at the *current* size — a re-exported `let` is
// copied at import time by bundlers and cannot be updated.
//
// Zoom is expressed twice on purpose. `zoom` is the scale the renderer applies
// this frame; `targetZoom` is where the wheel asked it to go. `advanceViewportZoom()`
// walks one toward the other so a mouse notch reads as a glide rather than a jump.

import { TILE, WORLD_W } from '../../shared/constants';
import { clampZoom, DEFAULT_ZOOM } from './zoom';

const DEFAULT_WIDTH_PX = 960;
const DEFAULT_HEIGHT_PX = 640;

/** Fraction of the remaining zoom distance covered per simulation step. */
const ZOOM_EASE = 0.22;
/** Below this the ease snaps, so `zoom` reaches the target exactly. */
const ZOOM_SETTLE = 0.0005;

export interface Viewport {
  /** Canvas width in CSS pixels. */
  widthPx: number;
  /** Canvas height in CSS pixels. */
  heightPx: number;
  /** CSS pixels per world pixel; 1 is the unzoomed baseline. */
  zoom: number;
  /** Zoom the input layer asked for; `zoom` eases toward it. */
  targetZoom: number;
  /** Canvas width in world pixels — the space the renderer draws inside the zoom transform. */
  worldWidthPx: number;
  /** Canvas height in world pixels. */
  worldHeightPx: number;
  /** Whole tiles that fit across the viewport at the current zoom. */
  tilesX: number;
  /** Whole tiles that fit down the viewport at the current zoom. */
  tilesY: number;
}

export const viewport: Viewport = {
  widthPx: DEFAULT_WIDTH_PX,
  heightPx: DEFAULT_HEIGHT_PX,
  zoom: DEFAULT_ZOOM,
  targetZoom: DEFAULT_ZOOM,
  worldWidthPx: DEFAULT_WIDTH_PX,
  worldHeightPx: DEFAULT_HEIGHT_PX,
  tilesX: Math.floor(DEFAULT_WIDTH_PX / TILE),
  tilesY: Math.floor(DEFAULT_HEIGHT_PX / TILE)
};

function recomputeExtents(): void {
  viewport.worldWidthPx = viewport.widthPx / viewport.zoom;
  viewport.worldHeightPx = viewport.heightPx / viewport.zoom;
  viewport.tilesX = Math.floor(viewport.worldWidthPx / TILE);
  viewport.tilesY = Math.floor(viewport.worldHeightPx / TILE);
}

/** Adopt a new canvas size, recomputing the tile extents. */
export function setViewportSize(widthPx: number, heightPx: number): void {
  viewport.widthPx = Math.max(1, Math.round(widthPx));
  viewport.heightPx = Math.max(1, Math.round(heightPx));
  recomputeExtents();
}

/** Jump straight to a zoom level, cancelling any glide in progress. */
export function setViewportZoom(zoom: number): void {
  viewport.zoom = clampZoom(zoom);
  viewport.targetZoom = viewport.zoom;
  recomputeExtents();
}

/** Ask for a zoom level; `advanceViewportZoom()` eases toward it. */
export function requestViewportZoom(zoom: number): void {
  viewport.targetZoom = clampZoom(zoom);
}

/**
 * The camera the mine is actually drawn with: the eased camera, clamped to the
 * world the way `renderer.draw()` clamps it. Anything converting a screen point
 * back into a tile has to start from this, or a view pushed against the left
 * wall or the sky would answer with the tile next door.
 */
export function drawnCamera(camX: number, camY: number): {x: number; y: number} {
  return {
    x: Math.max(0, Math.min(WORLD_W - viewport.tilesX, camX)),
    y: Math.max(0, camY)
  };
}

/**
 * The tile under a point given in canvas CSS pixels. The inverse of the
 * renderer's world transform: undo the zoom, then the camera.
 */
export function tileAtViewportPoint(x: number, y: number, camX: number, camY: number): {x: number; y: number} {
  const camera = drawnCamera(camX, camY);
  return {
    x: Math.floor(camera.x + x / viewport.zoom / TILE),
    y: Math.floor(camera.y + y / viewport.zoom / TILE)
  };
}

/**
 * Move one step toward the requested zoom. Reports whether anything moved, so
 * the caller can keep the camera anchored on the view centre while it does.
 */
export function advanceViewportZoom(): boolean {
  const remaining = viewport.targetZoom - viewport.zoom;
  if (remaining === 0) return false;
  viewport.zoom = Math.abs(remaining) < ZOOM_SETTLE
    ? viewport.targetZoom
    : viewport.zoom + remaining * ZOOM_EASE;
  recomputeExtents();
  return true;
}
