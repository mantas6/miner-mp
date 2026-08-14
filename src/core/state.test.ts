import { describe, it, expect } from 'vitest';
import { STARTING, ECONOMY } from './balance';
import { ORES, START_Y, WORLD_W } from '../../shared/constants';
import { INVENTORY_SLOTS, addOre, countOres, createInventory } from './inventory';
import { createInitialState, respawnPlayer } from './state';

describe('initial game state', () => {
  it('starts a new game with starting capacities, no consumables, and no progress', () => {
    const state = createInitialState();

    expect(state.player.cargoMax).toBe(STARTING.cargoMax);
    expect(state.player.inventory).toHaveLength(INVENTORY_SLOTS);
    expect(countOres(state.player.inventory)).toBe(0);
    expect(state.player.dynamite).toBe(0);
    expect(state.player.teleporters).toBe(0);
    expect(state.player.gunOwned).toBe(false);
    expect(state.player.bullets).toBe(0);
    expect(state.extractionPhase).toBe('none');
    expect(state.stats.motherlodeExtractions).toBe(0);
    expect(state.input.sprintDirection).toBeNull();
    expect(state.reducedMotion).toBe(false);
  });

  it('gives every new state its own stats object', () => {
    const first = createInitialState();
    first.stats.maxDepth = 500;

    expect(createInitialState().stats.maxDepth).toBe(0);
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
    player.inventory = addOre(createInventory(), ORES[0], player.cargoMax)!;

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
      bullets: 9
    });
    expect(countOres(player.inventory)).toBe(0);
    expect(player.inventory).toHaveLength(INVENTORY_SLOTS);
  });
});
