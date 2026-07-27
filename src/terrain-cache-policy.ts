// Larger cached terrain blocks cut per-frame canvas blits while keeping a mined
// tile's redraw local enough that drilling feedback remains immediate.
export const TERRAIN_CHUNK_TILES = 4;

export function terrainChunkCoordinate(tile: number): number {
  return Math.floor(tile / TERRAIN_CHUNK_TILES);
}

export function terrainChunkKeyForTile(x: number, y: number): string {
  return `${terrainChunkCoordinate(x)},${terrainChunkCoordinate(y)}`;
}
