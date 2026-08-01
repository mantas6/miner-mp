import { describe, expect, it } from 'vitest';
import { terrainCacheScale, terrainChunkCoordinate, terrainChunkKeyForTile, TERRAIN_CHUNK_TILES } from './terrain-cache-policy';

describe('chunk addressing', () => {
  it('groups tiles into fixed blocks', () => {
    expect(terrainChunkCoordinate(0)).toBe(0);
    expect(terrainChunkCoordinate(TERRAIN_CHUNK_TILES)).toBe(1);
    expect(terrainChunkKeyForTile(TERRAIN_CHUNK_TILES + 1, TERRAIN_CHUNK_TILES * 2)).toBe('1,2');
  });
});

describe('terrainCacheScale', () => {
  it('caps at CSS resolution while unzoomed, whatever the display density', () => {
    expect(terrainCacheScale(1, 1)).toBe(1);
    expect(terrainCacheScale(1, 3)).toBe(1);
  });

  it('follows a canvas smaller than its CSS box down', () => {
    expect(terrainCacheScale(1, 0.5)).toBe(0.5);
  });

  it('cuts magnified chunks at or above their on-screen size', () => {
    expect(terrainCacheScale(2, 1)).toBe(2);
    expect(terrainCacheScale(1.2, 1)).toBeGreaterThanOrEqual(1.2);
  });

  it('quantises the zoom, so an easing glide rebuilds the cache a few times, not every frame', () => {
    const glide = [1, 1.05, 1.1, 1.2, 1.35, 1.45, 1.5].map(zoom => terrainCacheScale(zoom, 1));

    expect(new Set(glide).size).toBe(2);
  });

  it('never asks for less than the widest view needs', () => {
    expect(terrainCacheScale(0.5, 1)).toBe(0.5);
    expect(terrainCacheScale(0.1, 1)).toBe(0.5);
  });
});
