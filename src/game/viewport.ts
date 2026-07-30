// Canvas viewport dimensions.
//
// These live apart from `dom.ts` for two reasons: they are plain numbers with no
// DOM dependency (so gameplay modules can read them without pulling the element
// graph in), and they change on every resize. Exporting one frozen-shape object
// keeps every reader looking at the *current* size — a re-exported `let` is
// copied at import time by bundlers and cannot be updated.

import { TILE } from '../../shared/constants';

const DEFAULT_WIDTH_PX = 960;
const DEFAULT_HEIGHT_PX = 640;

export interface Viewport {
  /** Canvas width in CSS pixels. */
  widthPx: number;
  /** Canvas height in CSS pixels. */
  heightPx: number;
  /** Whole tiles that fit across the viewport. */
  tilesX: number;
  /** Whole tiles that fit down the viewport. */
  tilesY: number;
}

export const viewport: Viewport = {
  widthPx: DEFAULT_WIDTH_PX,
  heightPx: DEFAULT_HEIGHT_PX,
  tilesX: Math.floor(DEFAULT_WIDTH_PX / TILE),
  tilesY: Math.floor(DEFAULT_HEIGHT_PX / TILE)
};

/** Adopt a new canvas size, recomputing the tile extents. */
export function setViewportSize(widthPx: number, heightPx: number): void {
  viewport.widthPx = Math.max(1, Math.round(widthPx));
  viewport.heightPx = Math.max(1, Math.round(heightPx));
  viewport.tilesX = Math.floor(viewport.widthPx / TILE);
  viewport.tilesY = Math.floor(viewport.heightPx / TILE);
}
