import { describe, expect, it } from 'vitest';
import { WORLD_H, WORLD_W } from '../src/constants';
import { getVisibleTileRange } from '../src/visible-tile-range';

describe('getVisibleTileRange', () => {
  it('includes one overscan tile around a fractional camera viewport', () => {
    expect(getVisibleTileRange(12.75, 20.25, 15, 10, 90, 320)).toEqual({
      startX: 11,
      endX: 28,
      startY: 19,
      endY: 31
    });
  });

  it('clamps the range at the top-left world boundary', () => {
    expect(getVisibleTileRange(0, 0, 15, 10, 90, 320)).toEqual({
      startX: 0,
      endX: 16,
      startY: 0,
      endY: 11
    });
  });

  it('clamps the range at the bottom-right world boundary', () => {
    expect(getVisibleTileRange(80.9, WORLD_H - 4.2, 15, 10, WORLD_W, WORLD_H)).toEqual({
      startX: 79,
      endX: WORLD_W - 1,
      startY: WORLD_H - 6,
      endY: WORLD_H - 1
    });
  });
});
