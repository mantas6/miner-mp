import { afterEach, describe, expect, it } from 'vitest';
import { TILE } from '../../shared/constants';
import { setViewportSize, viewport } from './viewport';

afterEach(() => {
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
