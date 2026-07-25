import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const gradient = {addColorStop: vi.fn()};
  const createContext = () => ({
    arc: vi.fn(),
    arcTo: vi.fn(),
    beginPath: vi.fn(),
    bezierCurveTo: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    createRadialGradient: vi.fn(() => gradient),
    drawImage: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn()
  });

  return {
    mainContext: createContext(),
    terrainContext: createContext(),
    canvas: {width: 1920, height: 1280}
  };
});

vi.mock('../src/dom', () => ({
  canvas: mocks.canvas,
  ctx: mocks.mainContext,
  H: 10,
  VIEW_HEIGHT: 640,
  VIEW_WIDTH: 960,
  W: 15
}));

import { createRenderer } from '../src/renderer';

describe('terrain cache lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => mocks.terrainContext)
      }))
    });
  });

  it('clears same-sized backing pixels on invalidation and tile-range changes', () => {
    const state = {
      world: {},
      camX: 10.2,
      camY: 20.2,
      tick: 0,
      gameOver: false,
      particles: [],
      enemies: [],
      remotePlayers: [],
      player: {
        x: 12,
        y: 22,
        drawX: 12,
        drawY: 22,
        facing: 1,
        bob: 0,
        drillAnim: 0,
        drillDx: 0,
        drillDy: 1
      }
    };
    const renderer = createRenderer({
      state,
      get: () => ({type: 'air'}),
      rand: () => 0
    });

    renderer.draw();
    expect(mocks.terrainContext.setTransform).toHaveBeenNthCalledWith(1, 1, 0, 0, 1, 0, 0);
    expect(mocks.terrainContext.clearRect).toHaveBeenLastCalledWith(0, 0, 2304, 1664);
    expect(mocks.terrainContext.setTransform).toHaveBeenNthCalledWith(2, 2, 0, 0, 2, 0, 0);

    renderer.draw();
    expect(mocks.terrainContext.clearRect).toHaveBeenCalledTimes(1);

    renderer.invalidateTerrain();
    renderer.draw();
    expect(mocks.terrainContext.clearRect).toHaveBeenCalledTimes(2);

    state.camX = 11.2;
    renderer.draw();
    expect(mocks.terrainContext.clearRect).toHaveBeenCalledTimes(3);
    expect(mocks.terrainContext.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
  });
});
