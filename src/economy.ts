// Pure economy math. DOM-free / testable. No imports from dom.js or game.js.
import { STARTING, ECONOMY } from './balance';
import type { Player } from './types';

type FuelUpgradePlayer = Pick<Player, 'fuelMax'>;
type RepairPlayer = Pick<Player, 'hullMax' | 'hull'>;
type CargoUpgradePlayer = Pick<Player, 'cargoMax'>;
type DrillUpgradePlayer = Pick<Player, 'drill'>;

/** @param {import('./state').Player} player @returns {number} */
export function refuelCost(player: FuelUpgradePlayer): number {
  return Math.ceil(ECONOMY.refuel.base + (player.fuelMax - STARTING.fuelMax) * ECONOMY.refuel.perTank);
}

/** @param {import('./state').Player} player @returns {number} */
export function repairCost(player: RepairPlayer): number {
  return Math.ceil(ECONOMY.repair.base + (player.hullMax - player.hull) * ECONOMY.repair.perHull);
}

/** @param {import('./state').Player} player @returns {number} */
export function cargoCost(player: CargoUpgradePlayer): number {
  return Math.ceil(ECONOMY.cargo.base * Math.pow(ECONOMY.cargo.growth, Math.max(0, (player.cargoMax - STARTING.cargoMax) / ECONOMY.cargo.step)));
}

/** @param {import('./state').Player} player @returns {number} */
export function tankCost(player: FuelUpgradePlayer): number {
  return Math.ceil(ECONOMY.tank.base * Math.pow(ECONOMY.tank.growth, Math.max(0, (player.fuelMax - STARTING.fuelMax) / ECONOMY.tank.step)));
}

/** @param {import('./state').Player} player @returns {number} */
export function drillCost(player: DrillUpgradePlayer): number {
  return Math.ceil(ECONOMY.drill.base * Math.pow(ECONOMY.drill.growth, Math.max(0, player.drill - STARTING.drill)));
}

/**
 * Spend up to `cash` toward a full top-up costing `fullCost`, filling `current` toward `max` proportionally.
 * @param {number} current   Current resource amount.
 * @param {number} max       Maximum resource amount.
 * @param {number} cash      Available cash to spend.
 * @param {number} fullCost  Cost of a complete top-up.
 * @returns {{value:number, pay:number, ratio:number}}
 */
export function partialFill(current: number, max: number, cash: number, fullCost: number): {value: number; pay: number; ratio: number} {
  const pay = Math.min(cash, fullCost);
  const ratio = fullCost > 0 ? pay / fullCost : 1;
  const value = Math.min(max, current + (max - current) * ratio);
  return { value, pay, ratio };
}
