import { describe, expect, it } from 'vitest';
import { TERRAIN_CHUNK_TILES, terrainChunkCoordinate, terrainChunkKeyForTile } from '../src/terrain-cache-policy';

describe('terrain cache policy', () => {
  it('groups a compact four-by-four tile block into one cache entry', () => {
    expect(TERRAIN_CHUNK_TILES).toBe(4);
    expect(terrainChunkCoordinate(0)).toBe(0);
    expect(terrainChunkCoordinate(3)).toBe(0);
    expect(terrainChunkCoordinate(4)).toBe(1);
    expect(terrainChunkKeyForTile(5, 7)).toBe('1,1');
  });
});
