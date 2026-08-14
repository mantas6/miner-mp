import { afterEach, describe, expect, it } from 'vitest';
import { TILE, WORLD_W } from '../../shared/constants';
import { getVisibleTileRange } from '../world/visible-tile-range';
import {
  advanceViewportZoom,
  drawnCamera,
  requestViewportZoom,
  setViewportSize,
  setViewportZoom,
  tileAtViewportPoint,
  viewport
} from './viewport';
import { MAX_ZOOM, MIN_ZOOM } from './zoom';

afterEach(() => {
  setViewportZoom(1);
  setViewportSize(960, 640);
});

describe('viewport sizing', () => {
  it('derives whole visible tiles from the canvas size', () => {
    setViewportSize(960, 640);

    expect(viewport).toMatchObject({
      widthPx: 960,
      heightPx: 640,
      tilesX: Math.floor(960 / TILE),
      tilesY: Math.floor(640 / TILE)
    });
  });

  it('rounds fractional layout sizes and never collapses to zero', () => {
    setViewportSize(1279.4, 0);

    expect(viewport.widthPx).toBe(1279);
    expect(viewport.heightPx).toBe(1);
    expect(viewport.tilesY).toBe(0);
  });

  it('updates in place, so importers always read the current size', () => {
    const observed = viewport;
    setViewportSize(480, 320);

    expect(observed.tilesX).toBe(Math.floor(480 / TILE));
  });
});

describe('viewport zoom', () => {
  it('trades screen pixels for tiles: zooming out shows more of the mine', () => {
    setViewportZoom(0.5);

    expect(viewport.worldWidthPx).toBe(1920);
    expect(viewport.tilesX).toBe(Math.floor(1920 / TILE));
    expect(viewport.tilesY).toBe(Math.floor(1280 / TILE));

    setViewportZoom(2);

    expect(viewport.worldWidthPx).toBe(480);
    expect(viewport.tilesX).toBe(Math.floor(480 / TILE));
  });

  it('refuses levels outside the supported range', () => {
    setViewportZoom(50);
    expect(viewport.zoom).toBe(MAX_ZOOM);

    setViewportZoom(0);
    expect(viewport.zoom).toBe(MIN_ZOOM);
  });

  it('keeps a resize honest about the zoom in force', () => {
    setViewportZoom(2);
    setViewportSize(1280, 720);

    expect(viewport.worldWidthPx).toBe(640);
    expect(viewport.tilesX).toBe(Math.floor(640 / TILE));
  });

  it('eases toward a requested level and reports when it has arrived', () => {
    requestViewportZoom(2);

    expect(viewport.zoom).toBe(1);
    expect(advanceViewportZoom()).toBe(true);
    expect(viewport.zoom).toBeGreaterThan(1);
    expect(viewport.zoom).toBeLessThan(2);

    for (let step = 0; step < 200 && advanceViewportZoom(); step++) { /* settle */ }

    expect(viewport.zoom).toBe(2);
    expect(advanceViewportZoom()).toBe(false);
  });

  it('widens the range the renderer walks, so a zoomed-out view is not cropped', () => {
    setViewportZoom(1);
    const unzoomed = getVisibleTileRange(20, 30, viewport.tilesX, viewport.tilesY, WORLD_W);

    setViewportZoom(0.5);
    const zoomedOut = getVisibleTileRange(20, 30, viewport.tilesX, viewport.tilesY, WORLD_W);

    // The doubled tile span plus one overscan row either side, still clamped to the world.
    expect(zoomedOut.endY - zoomedOut.startY).toBe(viewport.tilesY + 2);
    expect(zoomedOut.endX - zoomedOut.startX).toBe(viewport.tilesX + 2);
    expect(zoomedOut.endY).toBeGreaterThan(unzoomed.endY);
    expect(zoomedOut.endX).toBeGreaterThan(unzoomed.endX);
  });

  it('clamps the requested level too, so a runaway wheel cannot escape the range', () => {
    requestViewportZoom(-4);

    expect(viewport.targetZoom).toBe(MIN_ZOOM);
  });
});

describe('pointing at a tile', () => {
  it('answers with the tile the renderer drew under that point', () => {
    expect(tileAtViewportPoint(0, 0, 10, 20)).toEqual({x: 10, y: 20});
    expect(tileAtViewportPoint(TILE * 2.5, TILE * 3.5, 10, 20)).toEqual({x: 12, y: 23});
  });

  it('undoes the zoom, so a zoomed-out view still hits what was pressed', () => {
    setViewportZoom(0.5);

    // Half scale: one screen pixel covers twice as much mine.
    expect(tileAtViewportPoint(TILE, TILE, 0, 0)).toEqual({x: 2, y: 2});
  });

  it('starts from the clamped camera the mine is actually drawn with', () => {
    expect(drawnCamera(-8, -3)).toEqual({x: 0, y: 0});
    expect(drawnCamera(WORLD_W, 5)).toEqual({x: WORLD_W - viewport.tilesX, y: 5});
    // A camera pushed past the left wall draws column 0 at the left edge, and a
    // press there has to answer with column 0 rather than a negative one.
    expect(tileAtViewportPoint(0, 0, -8, -3)).toEqual({x: 0, y: 0});
  });
});
