import { FUEL, HULL } from './balance';
import { totalItems } from './inventory';
import type { GameState } from './types';

/**
 * Return true while a current resource value is below its warning fraction.
 * Empty or invalid max values are treated as safe to avoid false warning flashes.
 *
 * @param {number} current
 * @param {number} max
 * @param {number} fraction
 * @returns {boolean}
 */
export function isBelowWarningFraction(current: number, max: number, fraction: number): boolean {
  return Number.isFinite(max) && max > 0 && (current / max) < fraction;
}

/**
 * Return true while the cargo bay is full or overfilled, measured in items.
 * Empty or invalid max values are treated as safe to avoid false warning flashes.
 *
 * @param {number} current
 * @param {number} max
 * @returns {boolean}
 */
export function isAtOrAboveCapacity(current: number, max: number): boolean {
  return Number.isFinite(max) && max > 0 && current >= max;
}

/** @param {import('./state').GameState} state @returns {boolean} */
export function shouldFuelBarFlash(state: GameState): boolean {
  return !state.gameOver && isBelowWarningFraction(state.player.fuel, state.player.fuelMax, FUEL.lowFuelFraction);
}

/** @param {import('./state').GameState} state @returns {boolean} */
export function shouldHullBarFlash(state: GameState): boolean {
  return !state.gameOver && isBelowWarningFraction(state.player.hull, state.player.hullMax, HULL.lowHullFraction);
}

/** @param {import('./state').GameState} state @returns {boolean} */
export function shouldCargoBarFlash(state: GameState): boolean {
  return !state.gameOver && isAtOrAboveCapacity(totalItems(state.player.inventory), state.player.cargoMax);
}
