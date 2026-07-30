import { describe, expect, it } from 'vitest';
import { WORLD_W } from '../../shared/constants';
import { getVisibleTileRange } from './visible-tile-range';

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

  it('clamps horizontally but continues below 10 km without a bottom boundary', () => {
    expect(getVisibleTileRange(80.9, 1004.2, 15, 10, WORLD_W)).toEqual({
      startX: 79,
      endX: WORLD_W - 1,
      startY: 1003,
      endY: 1015
    });
  });
});
