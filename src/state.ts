import { START_Y, WORLD_W } from './constants';
import { STARTING } from './balance';
import type { GameState } from './types';

/**
 * @typedef {Object} Player
 * @property {number} x          Tile column the player occupies.
 * @property {number} y          Tile row the player occupies.
 * @property {number} drawX      Interpolated render column.
 * @property {number} drawY      Interpolated render row.
 * @property {number} facing     Horizontal facing direction (1 or -1).
 * @property {number} bob        Idle bob animation phase.
 * @property {number} drillAnim  Drill animation progress.
 * @property {number} drillDx    Drill direction x-component.
 * @property {number} drillDy    Drill direction y-component.
 * @property {number} fuel       Current fuel.
 * @property {number} fuelMax    Maximum fuel capacity.
 * @property {number} hull       Current hull integrity.
 * @property {number} hullMax    Maximum hull integrity.
 * @property {number} cargoMax   Maximum cargo slots.
 * @property {number} drill      Drill power level.
 * @property {Object[]} cargo    Collected ore objects.
 */

/**
 * @typedef {Object} GameState
 * @property {Array} world         2D array of generated tiles.
 * @property {number} cash         Player currency.
 * @property {number} tick         Frame/tick counter.
 * @property {boolean} gameOver    Whether the run has ended.
 * @property {boolean} introStarted Whether the intro has begun.
 * @property {number} camX         Camera column offset.
 * @property {number} camY         Camera row offset.
 * @property {Array} particles     Active particle effects.
 * @property {Array} enemies       Active enemy entities.
 * @property {Object} input        Input/repeat timing state.
 * @property {Player} player       The player entity.
 * @property {Object} [stats]      Run/progress statistics.
 */

/** @returns {GameState} */
export function createInitialState(): GameState {
  return {
    world: [],
    cash: STARTING.cash,
    tick: 0,
    gameOver: false,
    introStarted: false,
    camX: 0,
    camY: 0,
    particles: [],
    enemies: [],
    stats: {
      maxDepth: 0,
      totalCashEarned: 0,
      oreMined: 0,
      enemiesDestroyed: 0,
      deaths: 0,
      motherlodeClaims: 0,
      motherlodeExtractions: 0
    },
    extractionPhase: 'none',
    input: {
      keyImpulse: null,
      lastKeyboardMove: 0,
      keyboardRepeatMs: 105,
      touchHoldDir: null,
      lastTouchMove: 0,
      touchRepeatMs: 130
    },
    player: {
      x: Math.floor(WORLD_W / 2),
      y: START_Y,
      drawX: Math.floor(WORLD_W / 2),
      drawY: START_Y,
      facing: 1,
      bob: 0,
      drillAnim: 0,
      drillDx: 0,
      drillDy: 1,
      fuel: STARTING.fuel,
      fuelMax: STARTING.fuelMax,
      hull: STARTING.hull,
      hullMax: STARTING.hullMax,
      cargoMax: STARTING.cargoMax,
      drill: STARTING.drill,
      cargo: []
    }
  };
}
