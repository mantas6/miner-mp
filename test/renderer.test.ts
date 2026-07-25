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
    canvas: {width: 1920, height: 1280},
    terrainCanvases: [] as Array<{width: number; height: number}>
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
    mocks.terrainCanvases.length = 0;
    vi.stubGlobal('document', {
      createElement: vi.fn(() => {
        const terrainCanvas = {
          width: 0,
          height: 0,
          getContext: vi.fn(() => mocks.terrainContext)
        };
        mocks.terrainCanvases.push(terrainCanvas);
        return terrainCanvas;
      })
    });
  });

  it('renders only newly exposed chunks while the camera moves', () => {
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
    const initialTileDraws = mocks.terrainContext.fillRect.mock.calls.length;
    expect(initialTileDraws).toBeGreaterThan(0);
    expect(Math.max(...mocks.terrainCanvases.map(canvas => canvas.width))).toBe(68);
    expect(Math.max(...mocks.terrainCanvases.map(canvas => canvas.height))).toBe(68);

    renderer.draw();
    expect(mocks.terrainContext.fillRect).toHaveBeenCalledTimes(initialTileDraws);

    state.camX = 11.2;
    renderer.draw();
    expect(mocks.terrainContext.fillRect.mock.calls.length).toBeGreaterThan(initialTileDraws);

    state.camX = 12.2;
    renderer.draw();
    const exposedTileDraws = mocks.terrainContext.fillRect.mock.calls.length - initialTileDraws;
    expect(exposedTileDraws).toBeGreaterThan(0);
    expect(exposedTileDraws).toBeLessThan(initialTileDraws / 4);
  });

  it('invalidates one changed tile chunk without rebuilding the viewport', () => {
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
    const initialTileDraws = mocks.terrainContext.fillRect.mock.calls.length;

    renderer.invalidateTerrain(12, 22);
    renderer.draw();
    expect(mocks.terrainContext.fillRect).toHaveBeenCalledTimes(initialTileDraws + 1);

    renderer.invalidateTerrain();
    renderer.draw();
    expect(mocks.terrainContext.fillRect.mock.calls.length).toBeGreaterThan(initialTileDraws * 1.5);
  });
});
