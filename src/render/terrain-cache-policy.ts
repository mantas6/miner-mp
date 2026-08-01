// Larger cached terrain blocks cut per-frame canvas blits while keeping a mined
// tile's redraw local enough that drilling feedback remains immediate.
export const TERRAIN_CHUNK_TILES = 4;

/**
 * Cached chunks are rebuilt whenever their resolution changes, so the zoom they
 * are cut for is quantised: a wheel glide crosses two or three steps instead of
 * invalidating the whole cache on every frame it moves.
 */
export const TERRAIN_CACHE_ZOOM_STEP = 0.5;

export function terrainChunkCoordinate(tile: number): number {
  return Math.floor(tile / TERRAIN_CHUNK_TILES);
}

export function terrainChunkKeyForTile(x: number, y: number): string {
  return `${terrainChunkCoordinate(x)},${terrainChunkCoordinate(y)}`;
}

/**
 * Offscreen pixels per world pixel for a cached chunk.
 *
 * The zoom is rounded *up* to the next step so a magnified chunk is never
 * upscaled on screen, and the result stays capped at CSS resolution: high-DPI
 * screens accept the same slight softness they always have rather than paying
 * several times the generation cost.
 */
export function terrainCacheScale(zoom: number, devicePixelsPerCssPx: number): number {
  const quantisedZoom = Math.ceil(Math.max(zoom, TERRAIN_CACHE_ZOOM_STEP) / TERRAIN_CACHE_ZOOM_STEP) * TERRAIN_CACHE_ZOOM_STEP;
  return quantisedZoom * Math.min(1, devicePixelsPerCssPx);
}
