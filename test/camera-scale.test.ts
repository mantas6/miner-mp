import { describe, expect, it } from 'vitest';
import { BASE_CAMERA_TILE, CAMERA_ZOOM_OUT, TILE } from '../src/constants';

describe('shared camera scale', () => {
  it('zooms the mine out by 25% from the verified 64px baseline', () => {
    expect(BASE_CAMERA_TILE).toBe(64);
    expect(CAMERA_ZOOM_OUT).toBe(0.25);
    expect(TILE).toBe(48);
    expect(TILE / BASE_CAMERA_TILE).toBe(0.75);
  });

  it('shows more whole world tiles in the live desktop baseline viewport', () => {
    const liveBaselineViewport = { width: 932, height: 469 };
    const previousCoverage = {
      columns: Math.floor(liveBaselineViewport.width / BASE_CAMERA_TILE),
      rows: Math.floor(liveBaselineViewport.height / BASE_CAMERA_TILE)
    };
    const zoomedOutCoverage = {
      columns: Math.floor(liveBaselineViewport.width / TILE),
      rows: Math.floor(liveBaselineViewport.height / TILE)
    };

    expect(previousCoverage).toEqual({columns: 14, rows: 7});
    expect(zoomedOutCoverage).toEqual({columns: 19, rows: 9});
    expect(zoomedOutCoverage.columns).toBeGreaterThan(previousCoverage.columns);
    expect(zoomedOutCoverage.rows).toBeGreaterThan(previousCoverage.rows);
  });
});