// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEVELOPER_CASH_GRANT, developerRefuel, developerRepairHull, grantDeveloperCash, isDeveloperToolsEnabled, updateDeveloperServiceControls } from '../src/developer';
import { load, save } from '../src/persistence';
import { createInitialState, respawnPlayer } from '../src/state';

afterEach(() => vi.unstubAllGlobals());

describe('developer tools activation gate', () => {
  it('requires both Vite development mode and the exact explicit flag', () => {
    expect(isDeveloperToolsEnabled(true, 'true')).toBe(true);
    expect(isDeveloperToolsEnabled(true)).toBe(false);
    expect(isDeveloperToolsEnabled(true, 'false')).toBe(false);
    expect(isDeveloperToolsEnabled(true, '1')).toBe(false);
    expect(isDeveloperToolsEnabled(false, 'true')).toBe(false);
  });
});

describe('developer money cheat', () => {
  it('grants exactly $1,000 to local cash without changing earned-cash stats', () => {
    const state = createInitialState();
    const startingCash = state.cash;

    grantDeveloperCash(state);

    expect(DEVELOPER_CASH_GRANT).toBe(1_000);
    expect(state.cash).toBe(startingCash + 1_000);
    expect(state.stats.totalCashEarned).toBe(0);
  });

  it('allows repeated grants', () => {
    const state = createInitialState();

    grantDeveloperCash(state);
    grantDeveloperCash(state);
    grantDeveloperCash(state);

    expect(state.cash).toBe(3_060);
  });

  it('persists granted cash through the regular save path', () => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value)
    });
    const state = createInitialState();
    grantDeveloperCash(state);
    save(state);

    const restored = createInitialState();
    load(restored);

    expect(restored.cash).toBe(1_060);
  });
});

describe('developer ship services', () => {
  it('restores base and upgraded resources exactly to their current maxima', () => {
    const state = createInitialState();
    state.player.fuel = 1;
    state.player.hull = 2;

    expect(developerRefuel(state.player)).toBe(true);
    expect(developerRepairHull(state.player)).toBe(true);
    expect(state.player).toMatchObject({ fuel: 100, fuelMax: 100, hull: 100, hullMax: 100 });

    state.player.fuelMax = 240;
    state.player.hullMax = 360;
    state.player.fuel = 12;
    state.player.hull = 34;
    developerRefuel(state.player);
    developerRepairHull(state.player);

    expect(state.player).toMatchObject({ fuel: 240, fuelMax: 240, hull: 360, hullMax: 360 });
  });

  it('charges no cash, changes no statistics, and does not affect peers', () => {
    const state = createInitialState();
    state.cash = 0;
    state.player.fuel = 10;
    state.player.hull = 20;
    state.stats.maxDepth = 80;
    const stats = { ...state.stats };
    state.remotePlayers = [{ x: 1, y: 2, drawX: 1, drawY: 2, facing: 1, drillAnim: 0, drillDx: 0, drillDy: 1, bob: 0 }];
    const peers = structuredClone(state.remotePlayers);

    developerRefuel(state.player);
    developerRepairHull(state.player);

    expect(state.cash).toBe(0);
    expect(state.stats).toEqual(stats);
    expect(state.remotePlayers).toEqual(peers);
  });

  it('is a no-op at full and disables controls with clear full-state copy', () => {
    const state = createInitialState();
    const container = document.createElement('div');
    container.innerHTML = `
      <div data-developer-service-row="fuel"><span data-developer-service-level></span><button data-developer-service="fuel"></button></div>
      <div data-developer-service-row="hull"><span data-developer-service-level></span><button data-developer-service="hull"></button></div>
    `;

    expect(developerRefuel(state.player)).toBe(false);
    expect(developerRepairHull(state.player)).toBe(false);
    updateDeveloperServiceControls(container, state.player);

    expect(container.querySelector<HTMLButtonElement>('[data-developer-service="fuel"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('[data-developer-service="fuel"]')?.textContent).toContain('already full');
    expect(container.querySelector<HTMLButtonElement>('[data-developer-service="hull"]')?.disabled).toBe(true);
  });

  it('updates controls immediately and follows normal persisted upgrade maxima on restart', () => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value)
    });
    const state = createInitialState();
    state.player.fuelMax = 220;
    state.player.hullMax = 180;
    state.player.fuel = 20;
    state.player.hull = 30;
    const container = document.createElement('div');
    container.innerHTML = `
      <div data-developer-service-row="fuel"><span data-developer-service-level></span><button data-developer-service="fuel"></button></div>
      <div data-developer-service-row="hull"><span data-developer-service-level></span><button data-developer-service="hull"></button></div>
    `;

    developerRefuel(state.player);
    developerRepairHull(state.player);
    save(state);
    updateDeveloperServiceControls(container, state.player);

    expect(container.querySelector('[data-developer-service-row="fuel"] span')?.textContent).toBe('Fuel 220/220');
    expect(container.querySelector<HTMLButtonElement>('[data-developer-service="hull"]')?.disabled).toBe(true);
    const restored = createInitialState();
    load(restored);
    respawnPlayer(restored.player);
    expect(restored.player).toMatchObject({ fuel: 220, fuelMax: 220, hull: 180, hullMax: 180 });
  });
});
