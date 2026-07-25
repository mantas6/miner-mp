import { describe, it, expect } from 'vitest';
import { STARTING, LIMITS, ECONOMY } from '../src/balance';
import { START_Y, WORLD_W } from '../src/constants';
import { cargoCost } from '../src/economy';
import { createInitialState, respawnPlayer } from '../src/state';

describe('starting cargo capacity', () => {
  it('starts new games with 10 cargo slots and empty cargo', () => {
    const state = createInitialState();

    expect(STARTING.cargoMax).toBe(10);
    expect(state.player.cargoMax).toBe(10);
    expect(state.player.cargo).toHaveLength(0);
    expect(state.player.dynamite).toBe(0);
    expect(state.player.teleporters).toBe(0);
    expect(state.player.gunOwned).toBe(false);
    expect(state.player.bullets).toBe(0);
    expect(state.extractionPhase).toBe('none');
    expect(state.stats.motherlodeExtractions).toBe(0);
    expect(state.input.sprintDirection).toBeNull();
    expect(state.reducedMotion).toBe(false);
  });

  it('uses 10 as the minimum saved cargo capacity with incremental five-slot upgrades', () => {
    expect(LIMITS.cargoMax.min).toBe(10);
    expect(ECONOMY.cargo.step).toBe(5);
    expect(cargoCost({ cargoMax: STARTING.cargoMax })).toBe(120);
    expect(cargoCost({ cargoMax: STARTING.cargoMax + ECONOMY.cargo.step })).toBe(159);
  });
});

describe('player respawn', () => {
  it('restores the ship and clears cargo without losing purchased upgrades', () => {
    const state = createInitialState();
    const player = state.player;
    player.x = 4;
    player.y = 80;
    player.fuel = 0;
    player.hull = 0;
    player.fuelMax += ECONOMY.tank.step;
    player.cargoMax += ECONOMY.cargo.step;
    player.drill += ECONOMY.drill.step;
    player.dynamite = 2;
    player.teleporters = 1;
    player.gunOwned = true;
    player.bullets = 9;
    player.cargo = [{ name: 'Coal' }];

    respawnPlayer(player);

    expect(player).toMatchObject({
      x: Math.floor(WORLD_W / 2),
      y: START_Y,
      fuel: STARTING.fuelMax + ECONOMY.tank.step,
      fuelMax: STARTING.fuelMax + ECONOMY.tank.step,
      hull: player.hullMax,
      cargoMax: STARTING.cargoMax + ECONOMY.cargo.step,
      drill: STARTING.drill + ECONOMY.drill.step,
      dynamite: 2,
      teleporters: 1,
      gunOwned: true,
      bullets: 9,
      cargo: []
    });
  });
});
