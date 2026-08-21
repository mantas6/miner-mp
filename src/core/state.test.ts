import { describe, it, expect } from 'vitest';
import { STARTING, ECONOMY } from './balance';
import { ORES, START_Y, WORLD_W } from '../../shared/constants';
import { DYNAMITE_ITEM } from './dynamite';
import { INVENTORY_SLOTS, addItem, addOre, countItem, countOres, createInventory } from './inventory';
import { createInitialState, respawnPlayer } from './state';
import { TELEPORTER_ITEM } from './teleporter';
import { GUN_ITEM } from './weapon';

describe('initial game state', () => {
  it('starts a new game with starting capacities, no consumables, and no progress', () => {
    const state = createInitialState();

    expect(state.player.cargoMax).toBe(STARTING.cargoMax);
    expect(state.player.inventory).toHaveLength(INVENTORY_SLOTS);
    expect(countOres(state.player.inventory)).toBe(0);
    expect(countItem(state.player.inventory, DYNAMITE_ITEM.kind)).toBe(0);
    expect(countItem(state.player.inventory, GUN_ITEM.kind)).toBe(0);
    expect(countItem(state.player.inventory, TELEPORTER_ITEM.kind)).toBe(0);
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
    // Ore and equipment share the bay, and only the ore is lost with the ship.
    player.inventory = addItem(
      addItem(
        addItem(addOre(createInventory(), ORES[0], player.cargoMax)!, DYNAMITE_ITEM, 2)!,
        GUN_ITEM
      )!,
      TELEPORTER_ITEM
    )!;

    respawnPlayer(player);

    expect(player).toMatchObject({
      x: Math.floor(WORLD_W / 2),
      y: START_Y,
      fuel: STARTING.fuelMax + ECONOMY.tank.step,
      fuelMax: STARTING.fuelMax + ECONOMY.tank.step,
      hull: player.hullMax,
      cargoMax: STARTING.cargoMax + ECONOMY.cargo.step,
      drill: STARTING.drill + ECONOMY.drill.step
    });
    expect(countItem(player.inventory, DYNAMITE_ITEM.kind)).toBe(2);
    expect(countItem(player.inventory, GUN_ITEM.kind)).toBe(1);
    expect(countItem(player.inventory, TELEPORTER_ITEM.kind)).toBe(1);
    expect(countOres(player.inventory)).toBe(0);
    expect(player.inventory).toHaveLength(INVENTORY_SLOTS);
  });
});
