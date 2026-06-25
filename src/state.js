import { START_Y, WORLD_W } from './constants.js';

export function createInitialState() {
  return {
    world: [],
    cash: 60,
    tick: 0,
    gameOver: false,
    introStarted: false,
    camX: 0,
    camY: 0,
    particles: [],
    enemies: [],
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
      fuel: 100,
      fuelMax: 100,
      hull: 100,
      hullMax: 100,
      cargoMax: 15,
      drill: 1,
      cargo: []
    }
  };
}
