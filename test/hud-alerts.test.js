import { describe, it, expect } from 'vitest';
import { STARTING, FUEL, HULL } from '../src/balance.js';
import { createInitialState } from '../src/state.js';
import { isBelowWarningFraction, shouldFuelBarFlash, shouldHullBarFlash } from '../src/hud-alerts.js';

function alertState(overrides = {}) {
  const state = createInitialState();
  Object.assign(state.player, overrides);
  return state;
}

describe('HUD alert flashing thresholds', () => {
  it('uses the existing low-fuel threshold for fuel bar flashing', () => {
    expect(FUEL.lowFuelFraction).toBe(0.25);
    expect(shouldFuelBarFlash(alertState({ fuel: 24, fuelMax: STARTING.fuelMax }))).toBe(true);
    expect(shouldFuelBarFlash(alertState({ fuel: 25, fuelMax: STARTING.fuelMax }))).toBe(false);
    expect(shouldFuelBarFlash(alertState({ fuel: 80, fuelMax: STARTING.fuelMax }))).toBe(false);
  });

  it('flashes hull only below the low-hull threshold', () => {
    expect(HULL.lowHullFraction).toBe(0.30);
    expect(shouldHullBarFlash(alertState({ hull: 29, hullMax: STARTING.hullMax }))).toBe(true);
    expect(shouldHullBarFlash(alertState({ hull: 30, hullMax: STARTING.hullMax }))).toBe(false);
    expect(shouldHullBarFlash(alertState({ hull: 70, hullMax: STARTING.hullMax }))).toBe(false);
  });

  it('does not flash bars while the game is over or max values are invalid', () => {
    const gameOver = alertState({ fuel: 1, hull: 1 });
    gameOver.gameOver = true;
    expect(shouldFuelBarFlash(gameOver)).toBe(false);
    expect(shouldHullBarFlash(gameOver)).toBe(false);
    expect(isBelowWarningFraction(0, 0, 0.25)).toBe(false);
  });
});
