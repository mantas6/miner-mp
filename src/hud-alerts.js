import { FUEL, HULL } from './balance.js';

/**
 * Return true while a current resource value is below its warning fraction.
 * Empty or invalid max values are treated as safe to avoid false warning flashes.
 *
 * @param {number} current
 * @param {number} max
 * @param {number} fraction
 * @returns {boolean}
 */
export function isBelowWarningFraction(current, max, fraction) {
  return Number.isFinite(max) && max > 0 && (current / max) < fraction;
}

/**
 * Return true while cargo slots are full or overfilled.
 * Empty or invalid max values are treated as safe to avoid false warning flashes.
 *
 * @param {number} current
 * @param {number} max
 * @returns {boolean}
 */
export function isAtOrAboveCapacity(current, max) {
  return Number.isFinite(max) && max > 0 && current >= max;
}

/** @param {import('./state.js').GameState} state @returns {boolean} */
export function shouldFuelBarFlash(state) {
  return !state.gameOver && isBelowWarningFraction(state.player.fuel, state.player.fuelMax, FUEL.lowFuelFraction);
}

/** @param {import('./state.js').GameState} state @returns {boolean} */
export function shouldHullBarFlash(state) {
  return !state.gameOver && isBelowWarningFraction(state.player.hull, state.player.hullMax, HULL.lowHullFraction);
}

/** @param {import('./state.js').GameState} state @returns {boolean} */
export function shouldCargoBarFlash(state) {
  return !state.gameOver && isAtOrAboveCapacity(state.player.cargo.length, state.player.cargoMax);
}
