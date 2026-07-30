// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ECONOMY, LIMITS } from './balance';
import { load, save } from '../persistence';
import { createInitialState } from './state';
import { applyPlayerUpgrade, getPlayerUpgradeProgress, updateDeveloperUpgradeControls } from './upgrades';

afterEach(() => vi.unstubAllGlobals());

describe('developer player upgrades', () => {
  it('grants every normal upgrade without changing cash and derives current stats normally', () => {
    const state = createInitialState();
    const cash = state.cash;

    expect(applyPlayerUpgrade(state.player, 'cargo')).toBe(true);
    expect(applyPlayerUpgrade(state.player, 'tank')).toBe(true);
    expect(applyPlayerUpgrade(state.player, 'hull')).toBe(true);
    expect(applyPlayerUpgrade(state.player, 'drill')).toBe(true);
    expect(applyPlayerUpgrade(state.player, 'visibility')).toBe(true);

    expect(state.cash).toBe(cash);
    expect(state.player).toMatchObject({ cargoMax: 15, fuel: 120, fuelMax: 120, hull: 120, hullMax: 120, drill: 2, visibility: 4 });
  });

  it('stops safely at each category cap and reports max levels', () => {
    const state = createInitialState();
    state.player.cargoMax = LIMITS.cargoMax.max;
    state.player.fuelMax = LIMITS.fuelMax.max;
    state.player.hullMax = LIMITS.hullMax.max;
    state.player.drill = LIMITS.drill.max;
    state.player.visibility = LIMITS.visibility.max;

    for (const id of ['cargo', 'tank', 'hull', 'drill', 'visibility'] as const) {
      expect(getPlayerUpgradeProgress(state.player, id).atMax).toBe(true);
      expect(applyPlayerUpgrade(state.player, id)).toBe(false);
    }
    expect(getPlayerUpgradeProgress(state.player, 'cargo')).toMatchObject({ level: 198, maxLevel: 198 });
  });

  it('continues saved fuel and hull progression beyond the former caps', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ version: 3, fuelMax: 1000, hullMax: 1000 }),
      setItem: vi.fn()
    });
    const state = createInitialState();
    load(state);

    expect(getPlayerUpgradeProgress(state.player, 'tank')).toMatchObject({ level: 45, maxLevel: 95, atMax: false });
    expect(getPlayerUpgradeProgress(state.player, 'hull')).toMatchObject({ level: 45, maxLevel: 95, atMax: false });
    expect(applyPlayerUpgrade(state.player, 'tank')).toBe(true);
    expect(applyPlayerUpgrade(state.player, 'hull')).toBe(true);
    expect(state.player).toMatchObject({ fuel: 1020, fuelMax: 1020, hull: 1020, hullMax: 1020 });
  });

  it('reaches the new fuel and hull caps without exceeding them', () => {
    const state = createInitialState();
    state.player.fuelMax = LIMITS.fuelMax.max - ECONOMY.tank.step;
    state.player.hullMax = LIMITS.hullMax.max - ECONOMY.hull.step;

    expect(applyPlayerUpgrade(state.player, 'tank')).toBe(true);
    expect(applyPlayerUpgrade(state.player, 'hull')).toBe(true);
    expect(getPlayerUpgradeProgress(state.player, 'tank')).toMatchObject({ value: 2000, level: 95, maxLevel: 95, atMax: true });
    expect(getPlayerUpgradeProgress(state.player, 'hull')).toMatchObject({ value: 2000, level: 95, maxLevel: 95, atMax: true });
    expect(applyPlayerUpgrade(state.player, 'tank')).toBe(false);
    expect(applyPlayerUpgrade(state.player, 'hull')).toBe(false);
  });

  it('disables a developer control at max and displays current/max level', () => {
    const state = createInitialState();
    state.player.drill = LIMITS.drill.max;
    const container = document.createElement('div');
    container.innerHTML = '<div data-upgrade-row="drill"><span data-upgrade-level></span><button data-developer-upgrade="drill"></button></div>';

    updateDeveloperUpgradeControls(container, state.player);

    expect(container.querySelector('span')?.textContent).toBe('Level 99/99 · 100/100');
    expect(container.querySelector('button')?.disabled).toBe(true);
    expect(container.querySelector('button')?.textContent).toContain('at max');
  });

  it('persists a free upgrade through the regular save path', () => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value)
    });
    const state = createInitialState();
    applyPlayerUpgrade(state.player, 'tank');
    save(state);

    const restored = createInitialState();
    load(restored);

    expect(restored.cash).toBe(state.cash);
    expect(restored.player.fuelMax).toBe(120);
  });
});
