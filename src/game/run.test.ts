import { describe, expect, it, vi } from 'vitest';
import { ORES, START_Y, WORLD_W } from '../../shared/constants';
import { ECONOMY, STARTING } from '../core/balance';
import { createInitialState } from '../core/state';
import type { GameState } from '../core/types';
import { createRun, type GameRun } from './run';
import {
  createAudioStub,
  createEnemySimStub,
  createInputStub,
  createSessionStub,
  createToastLog,
  type AudioStub,
  type EnemySimStub,
  type SessionStub
} from './test-support';

interface Harness {
  state: GameState;
  session: SessionStub;
  enemies: EnemySimStub;
  audio: AudioStub;
  input: ReturnType<typeof createInputStub>;
  toasts: ReturnType<typeof createToastLog>;
  saveProgress: ReturnType<typeof vi.fn>;
  invalidateFog: ReturnType<typeof vi.fn>;
  invalidateTerrain: ReturnType<typeof vi.fn>;
  run: GameRun;
}

/** A miner mid-run: upgraded, loaded with cargo, and away from the depot. */
function harness(): Harness {
  const state = createInitialState();
  Object.assign(state.player, {
    x: 12, y: 60, drawX: 12, drawY: 60,
    fuel: 30, hull: 25,
    fuelMax: STARTING.fuelMax + ECONOMY.tank.step,
    cargoMax: STARTING.cargoMax + ECONOMY.cargo.step,
    drill: STARTING.drill + 1,
    dynamite: 2,
    teleporters: 1,
    gunOwned: true,
    bullets: 4,
    visibility: 5,
    cargo: [ORES[0], ORES[1]]
  });
  state.cash = 900;
  state.stats.maxDepth = 570;
  state.stats.oreMined = 7;
  state.exploredTiles.add(1234);
  const context = {
    state,
    session: createSessionStub(),
    enemies: createEnemySimStub(),
    audio: createAudioStub(),
    input: createInputStub(),
    toasts: createToastLog(),
    saveProgress: vi.fn(),
    invalidateFog: vi.fn(),
    invalidateTerrain: vi.fn()
  };
  const run = createRun({
    state,
    session: context.session,
    audio: context.audio,
    enemies: () => context.enemies,
    input: () => context.input,
    toast: context.toasts.toast,
    saveProgress: context.saveProgress,
    revealAtPlayer: vi.fn(),
    spawnExplosion: vi.fn(),
    invalidateTerrain: context.invalidateTerrain,
    invalidateFog: context.invalidateFog
  });
  return {...context, run};
}

describe('hull damage', () => {
  it('subtracts hull, clamps at zero, and ends the run when the hull is gone', () => {
    const h = harness();

    h.run.damage(5);
    expect(h.state.player.hull).toBe(20);
    expect(h.state.gameOver).toBe(false);

    h.run.damage(999);
    expect(h.state.player.hull).toBe(0);
    expect(h.state.gameOver).toBe(true);
    expect(h.toasts.saw('Ship destroyed')).toBe(true);
  });
});

describe('death consequences', () => {
  it('banks the death, disarms the ship, and cancels a carried extraction', () => {
    const h = harness();
    h.state.input.gunArmed = true;
    h.state.extractionPhase = 'returning';
    h.state.teleportEffect = {
      originScreenX: 1, originScreenY: 2, destinationX: 3, destinationY: 4,
      frame: 1, duration: 30, reducedMotion: false
    };

    h.run.gameOver();

    expect(h.state).toMatchObject({
      gameOver: true,
      extractionPhase: 'none',
      teleportEffect: null
    });
    expect(h.state.input.gunArmed).toBe(false);
    expect(h.state.stats.deaths).toBe(1);
    expect(h.saveProgress).toHaveBeenCalled();
    expect(h.audio.played).toContain('alarm');
  });

  it('counts a death only once, no matter how many killers pile on', () => {
    const h = harness();

    h.run.gameOver('First');
    h.run.gameOver('Second');

    expect(h.state.stats.deaths).toBe(1);
    expect(h.toasts.messages).toEqual(['First']);
  });

  it('tells a paired peer about the death, but says nothing while solo', () => {
    const h = harness();

    h.run.gameOver();
    expect(h.session.sent).toEqual([]);

    h.state.gameOver = false;
    h.state.connected = true;
    h.session.role.paired = true;
    h.run.gameOver();
    expect(h.session.sent).toEqual([{type: 'died'}]);
  });
});

describe('restarting after a death', () => {
  it('keeps cash, upgrades and stats but loses cargo, position and fuel burn', () => {
    const h = harness();
    h.run.gameOver();

    h.run.restartGame();

    expect(h.state.cash).toBe(900);
    expect(h.state.stats).toMatchObject({maxDepth: 570, oreMined: 7, deaths: 1});
    expect(h.state.exploredTiles.has(1234)).toBe(true);
    expect(h.state.player).toMatchObject({
      x: Math.floor(WORLD_W / 2),
      y: START_Y,
      fuel: STARTING.fuelMax + ECONOMY.tank.step,
      hull: STARTING.hullMax,
      cargo: [],
      dynamite: 2,
      teleporters: 1,
      gunOwned: true,
      bullets: 4,
      visibility: 5
    });
    expect(h.state.gameOver).toBe(false);
    expect(h.input.reset).toHaveBeenCalled();
    expect(h.toasts.saw('Replacement ship')).toBe(true);
  });

  it('regenerates the whole world offline, but only the ship while online', () => {
    const h = harness();
    h.state.world = [[{type: 'air'}]];

    h.run.restartGame();
    expect(h.state.world).toEqual([]);
    expect(h.enemies.resetExposure).toHaveBeenCalled();

    h.state.world = [[{type: 'air'}]];
    h.state.connected = true;
    h.run.restartGame();
    expect(h.state.world).toEqual([[{type: 'air'}]]);
  });

  it('announces the replacement ship to a paired peer', () => {
    const h = harness();
    h.state.connected = true;
    h.session.role.paired = true;
    h.run.gameOver();
    h.session.sent.length = 0;

    h.run.restartGame();

    expect(h.session.sent).toEqual([{type: 'respawned', x: Math.floor(WORLD_W / 2), y: START_Y}]);
  });

  it('stays quiet when a live run is reset by hand instead of by dying', () => {
    const h = harness();
    h.state.connected = true;
    h.session.role.paired = true;

    h.run.restartGame();

    expect(h.session.sent).toEqual([]);
    expect(h.toasts.saw('Replacement ship')).toBe(false);
  });
});

describe('a full player reset', () => {
  it('returns every upgrade, the wallet, the fog and the stats to their starting values', () => {
    const h = harness();

    h.run.resetPlayer(true);

    expect(h.state.cash).toBe(STARTING.cash);
    expect(h.state.player).toMatchObject({
      fuelMax: STARTING.fuelMax,
      hullMax: STARTING.hullMax,
      cargoMax: STARTING.cargoMax,
      drill: STARTING.drill,
      visibility: STARTING.visibility,
      dynamite: STARTING.dynamite,
      teleporters: STARTING.teleporters,
      gunOwned: STARTING.gunOwned,
      bullets: STARTING.bullets,
      cargo: []
    });
    expect(h.state.exploredTiles.size).toBe(0);
    expect(h.state.stats).toMatchObject({maxDepth: 0, oreMined: 0, deaths: 0});
    expect(h.invalidateFog).toHaveBeenCalled();
  });
});

describe('a shared-world reset', () => {
  it('rebuilds terrain and drops render caches without touching player progress', () => {
    const h = harness();
    h.state.world = [[{type: 'air'}]];
    h.state.enemyIdCounter = 42;

    h.run.clearWorldRuntime();

    expect(h.state.cash).toBe(900);
    expect(h.state.player.cargo).toHaveLength(2);
    expect(h.state.enemyIdCounter).toBe(1);
    expect(h.session.resetTileDiff).toHaveBeenCalled();
    expect(h.enemies.clearExposure).toHaveBeenCalled();
    expect(h.input.clearKeys).toHaveBeenCalled();
    expect(h.invalidateTerrain).toHaveBeenCalled();
    expect(h.invalidateFog).toHaveBeenCalled();
  });
});
