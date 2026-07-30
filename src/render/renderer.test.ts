import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TILE } from '../../shared/constants';
import { explorationIndex } from '../../shared/exploration-codec';
import type { Direction } from '../core/types';

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
    shadowColor: '',
    stroke: vi.fn(),
    translate: vi.fn()
  });

  return {
    gradient,
    mainContext: createContext(),
    terrainContext: createContext(),
    canvas: {width: 1920, height: 1280},
    terrainCanvases: [] as Array<{width: number; height: number}>
  };
});

vi.mock('../game/dom', () => ({
  canvas: mocks.canvas,
  ctx: mocks.mainContext
}));

vi.mock('../game/viewport', () => ({
  viewport: {widthPx: 960, heightPx: 640, tilesX: 15, tilesY: 10}
}));

import { createRenderer } from './renderer';

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
      world: [],
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
    expect(Math.max(...mocks.terrainCanvases.map(canvas => canvas.width))).toBe(296);
    expect(Math.max(...mocks.terrainCanvases.map(canvas => canvas.height))).toBe(296);

    renderer.draw();
    expect(mocks.terrainContext.fillRect).toHaveBeenCalledTimes(initialTileDraws);

    // Four-by-four blocks keep the cache stable during short camera interpolation.
    state.camX = 14.2;
    renderer.draw();
    expect(mocks.terrainContext.fillRect.mock.calls.length).toBeGreaterThan(initialTileDraws);

    state.camX = 18.2;
    renderer.draw();
    const exposedTileDraws = mocks.terrainContext.fillRect.mock.calls.length - initialTileDraws;
    expect(exposedTileDraws).toBeGreaterThan(0);
    expect(exposedTileDraws).toBeLessThan(initialTileDraws / 2);
  });

  it('invalidates one changed tile chunk without rebuilding the viewport', () => {
    const state = {
      world: [],
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
    expect(mocks.terrainContext.fillRect).toHaveBeenCalledTimes(initialTileDraws + 16);

    renderer.invalidateTerrain();
    renderer.draw();
    expect(mocks.terrainContext.fillRect.mock.calls.length).toBeGreaterThan(initialTileDraws * 1.5);
  });

  it('marks rare artifacts with a visually distinct cash glyph', () => {
    const state = {
      world: [], camX: 10, camY: 200, tick: 0, gameOver: false,
      particles: [], enemies: [], remotePlayers: [],
      player: {x:12, y:202, drawX:12, drawY:202, facing:1, bob:0, drillAnim:0, drillDx:0, drillDy:1}
    };
    const renderer = createRenderer({
      state,
      get: () => ({type:'artifact', artifact:{name:'Ancient Coin Cache', color:'#ffd166', value:180, min:202, max:502, chance:.00045}, hp:5, maxHp:5}),
      rand: () => 0
    });

    renderer.draw();

    expect(mocks.terrainContext.fillText).toHaveBeenCalledWith('$', expect.any(Number), expect.any(Number));
    expect(mocks.terrainContext.createRadialGradient).toHaveBeenCalled();
  });

  it('renders a buried enemy as ordinary dirt', () => {
    const state = {
      world: [], camX: 10, camY: 20, tick: 0, gameOver: false,
      particles: [], enemies: [], remotePlayers: [],
      player: {x:12, y:22, drawX:12, drawY:22, facing:1, bob:0, drillAnim:0, drillDx:0, drillDy:1}
    };
    const renderer = createRenderer({
      state,
      get: () => ({type:'enemy', kind:'tunnelFiend' as const, hp:4, maxHp:4}),
      rand: () => 0
    });

    renderer.draw();

    expect(mocks.terrainContext.createLinearGradient).toHaveBeenCalled();
    expect(mocks.terrainContext.createRadialGradient).not.toHaveBeenCalled();
  });

  it('renders active variants with distinct deep-mine palettes', () => {
    const state = {
      world: [], camX: 10, camY: 1000, tick: 0, gameOver: false,
      particles: [], remotePlayers: [],
      enemies: [{id:1, kind:'abyssStalker' as const, x:12, y:1002, drawX:12, drawY:1002, hp:8, maxHp:8, alive:true, moveTick:0, biteTick:0, flash:0}],
      player: {x:12, y:1002, drawX:12, drawY:1002, facing:1, bob:0, drillAnim:0, drillDx:0, drillDy:1}
    };
    const renderer = createRenderer({state, get: () => ({type:'air'}), rand: () => 0});

    renderer.draw();

    expect(mocks.mainContext.createRadialGradient).toHaveBeenCalled();
    expect(mocks.mainContext.shadowColor).toBe('#df76ff');
    expect(mocks.gradient.addColorStop).toHaveBeenCalledWith(.45, '#8749ba');
  });

  it('renders departure and arrival feedback across a camera jump', () => {
    const state = {
      world: [], camX: 37.5, camY: 0, tick: 0, gameOver: false,
      particles: [], enemies: [], remotePlayers: [],
      teleportEffect: {
        originScreenX: 480, originScreenY: 320,
        destinationX: 45, destinationY: 2,
        frame: 2, duration: 36, reducedMotion: false
      },
      player: {x:45, y:2, drawX:45, drawY:2, facing:1, bob:0, drillAnim:0, drillDx:0, drillDy:1}
    };
    const renderer = createRenderer({state, get: () => ({type:'air'}), rand: () => 0});

    renderer.draw();

    expect(mocks.mainContext.arc).toHaveBeenCalledWith(480, 320, expect.any(Number), 0, Math.PI*2);
    expect(mocks.mainContext.createRadialGradient).toHaveBeenCalled();
    expect(mocks.mainContext.fillRect).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 4, 4);
  });

  it('paints textured unexplored tiles without leaking enemies, peers, or particles', () => {
    const state = {
      world: [], camX: 10, camY: 20, tick: 0, gameOver: false,
      exploredTiles: new Set<number>(), teleportEffect: null,
      particles: [{x:12.5, y:22.5, vx:0, vy:0, life:20, color:'#fff', size:.1}],
      enemies: [{id:1, kind:'tunnelFiend' as const, x:12, y:22, drawX:12, drawY:22, hp:4, maxHp:4, alive:true, moveTick:0, biteTick:0, flash:0}],
      remotePlayers: [{x:13, y:22, drawX:13, drawY:22, facing:1, bob:0, drillAnim:0, drillDx:0, drillDy:1}],
      player: {x:12, y:22, drawX:12, drawY:22, facing:1, bob:0, drillAnim:0, drillDx:0, drillDy:1}
    };
    const renderer = createRenderer({state, get: () => ({type:'artifact', artifact:{name:'Cache', color:'#ffd166', value:900, min:20, max:30, chance:.1}, hp:5, maxHp:5}), rand: () => 0});

    renderer.draw();

    // TILE + 2 is the fog tile's overdrawn base rect; it now lands in a cached
    // chunk canvas rather than straight on the visible context.
    expect(mocks.terrainContext.fillRect).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), TILE + 2, TILE + 2);
    expect(mocks.mainContext.fillRect).not.toHaveBeenCalledWith(expect.any(Number), expect.any(Number), TILE + 2, TILE + 2);
    expect(mocks.terrainContext.bezierCurveTo).toHaveBeenCalled();
    expect(mocks.mainContext.fillText).not.toHaveBeenCalledWith('PARTNER', expect.any(Number), expect.any(Number));
    expect(mocks.mainContext.createRadialGradient).not.toHaveBeenCalled();
  });

  it('keeps cached fog chunks until exploration marks them dirty', () => {
    const state = {
      world: [], camX: 10.2, camY: 20.2, tick: 0, gameOver: false,
      exploredTiles: new Set<number>(), teleportEffect: null,
      particles: [], enemies: [], remotePlayers: [],
      player: {x:12, y:22, drawX:12, drawY:22, facing:1, bob:0, drillAnim:0, drillDx:0, drillDy:1}
    };
    const renderer = createRenderer({state, get: () => ({type:'dirt', hp:1, maxHp:1}), rand: () => 0});
    // The fog base rect is the only draw sized TILE + 2, so it isolates fog work
    // from the terrain tiles sharing the offscreen context mock.
    const fogTileDraws = () => mocks.terrainContext.fillRect.mock.calls
      .filter(([, , width]) => width === TILE + 2).length;

    renderer.draw();
    const initial = fogTileDraws();
    expect(initial).toBeGreaterThan(0);

    renderer.draw();
    expect(fogTileDraws()).toBe(initial);

    // One newly explored tile repaints only its own 4x4 chunk, minus that tile.
    state.exploredTiles.add(explorationIndex(12, 22));
    renderer.invalidateFog(12, 22);
    renderer.draw();
    expect(fogTileDraws()).toBe(initial + 15);

    renderer.invalidateFog();
    renderer.draw();
    expect(fogTileDraws()).toBe(initial * 2 + 14);

    // A fully explored chunk caches "nothing to draw": no canvas, no blit, no paint.
    const canvasesBefore = mocks.terrainCanvases.length;
    for (let y = 20; y < 24; y++) for (let x = 12; x < 16; x++) state.exploredTiles.add(explorationIndex(x, y));
    renderer.invalidateFog(12, 22);
    renderer.draw();
    expect(fogTileDraws()).toBe(initial * 2 + 14);
    expect(mocks.terrainCanvases.length).toBe(canvasesBefore);
  });

  it('draws boost jets opposite the active travel direction only', () => {
    const state = {
      world: [], camX: 10, camY: 20, tick: 4, gameOver: false, reducedMotion: false,
      exploredTiles: new Set<number>(), teleportEffect: null,
      particles: [], enemies: [], remotePlayers: [],
      input: {sprintDirection: [0, -1] as Direction | null},
      player: {x:12, y:22, drawX:12, drawY:22, facing:1, bob:0, drillAnim:0, drillDx:0, drillDy:1}
    };
    const renderer = createRenderer({state, get: () => ({type:'air'}), rand: () => 0});

    renderer.draw();

    expect(mocks.mainContext.rotate).toHaveBeenCalledWith(-Math.PI/2);
    expect(mocks.mainContext.shadowColor).toBe('#43d9ff');

    vi.clearAllMocks();
    mocks.mainContext.shadowColor = '';
    state.input.sprintDirection = null;
    renderer.draw();
    expect(mocks.mainContext.shadowColor).not.toBe('#43d9ff');
  });

  it('keeps reduced-motion boost flames static across render frames', () => {
    const state = {
      world: [], camX: 10, camY: 20, tick: 1, gameOver: false, reducedMotion: true,
      exploredTiles: new Set<number>(), teleportEffect: null,
      particles: [], enemies: [], remotePlayers: [], input: {sprintDirection: [1, 0] as Direction | null},
      player: {x:12, y:22, drawX:12, drawY:22, facing:1, bob:0, drillAnim:0, drillDx:0, drillDy:1}
    };
    const renderer = createRenderer({state, get: () => ({type:'air'}), rand: () => 0});
    const flameTips = () => mocks.mainContext.lineTo.mock.calls
      .filter(([, y]) => Math.abs(y) === TILE*.17)
      .map(([x, y]) => [x, y]);

    renderer.draw();
    const firstFrame = flameTips();
    vi.clearAllMocks();
    state.tick = 17;
    renderer.draw();
    const secondFrame = flameTips();

    expect(firstFrame).not.toHaveLength(0);
    expect(firstFrame).toEqual(secondFrame);
  });
});
