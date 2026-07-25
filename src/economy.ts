// Pure economy math. DOM-free / testable. No imports from dom.js or game.js.
import { STARTING, ECONOMY } from './balance';
import type { Player } from './types';

type FuelUpgradePlayer = Pick<Player, 'fuelMax'>;
type RepairPlayer = Pick<Player, 'hullMax' | 'hull'>;
type CargoUpgradePlayer = Pick<Player, 'cargoMax'>;
type HullUpgradePlayer = Pick<Player, 'hullMax'>;
type DrillUpgradePlayer = Pick<Player, 'drill'>;
type CargoValueOre = { value: number };
type UpgradeGuidancePlayer = Pick<Player, 'cargoMax' | 'fuelMax' | 'hullMax' | 'drill'>;
type ServiceGuidancePlayer = Pick<Player, 'fuel' | 'fuelMax' | 'hull' | 'hullMax'>;

export interface ServiceGuidanceInput {
  player: ServiceGuidancePlayer;
  cash: number;
  currentCargoValue: number;
  atSurface: boolean;
}

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

export function hullCost(player: HullUpgradePlayer): number {
  return Math.ceil(ECONOMY.hull.base * Math.pow(ECONOMY.hull.growth, Math.max(0, (player.hullMax - STARTING.hullMax) / ECONOMY.hull.step)));
}

/** @param {import('./state').Player} player @returns {number} */
export function drillCost(player: DrillUpgradePlayer): number {
  return Math.ceil(ECONOMY.drill.base * Math.pow(ECONOMY.drill.growth, Math.max(0, player.drill - STARTING.drill)));
}

export function cargoValue(cargo: CargoValueOre[]): number {
  return cargo.reduce((sum, ore) => sum + ore.value, 0);
}

export function cheapestUpgrade(player: UpgradeGuidancePlayer): {label: string; cost: number} {
  const upgrades = [
    {label: `Cargo +${ECONOMY.cargo.step}`, cost: cargoCost(player)},
    {label: `Tank +${ECONOMY.tank.step}`, cost: tankCost(player)},
    {label: `Hull +${ECONOMY.hull.step}`, cost: hullCost(player)},
    {label: `Drill +${ECONOMY.drill.step}`, cost: drillCost(player)}
  ];

  return upgrades.reduce((best, candidate) => candidate.cost < best.cost ? candidate : best);
}

export function formatCargoUpgradeFeedback(player: UpgradeGuidancePlayer, cash: number, currentCargoValue: number): string {
  const next = cheapestUpgrade(player);
  const projectedCash = cash + currentCargoValue;
  const remaining = Math.max(0, next.cost - projectedCash);
  const upgradeStatus = remaining === 0 ? 'ready after sell' : `need $${remaining} more`;

  return `Cargo value $${currentCargoValue} · Next ${next.label} $${next.cost} (${upgradeStatus})`;
}

export function formatSurfaceServiceGuidance({ player, cash, currentCargoValue, atSurface }: ServiceGuidanceInput): string {
  if (!atSurface) {
    return 'Underground: return to the surface depot to sell cargo, repair, refuel, and buy upgrades.';
  }

  if (currentCargoValue > 0) {
    return `At depot: press Enter or Sell to unload cargo for $${currentCargoValue}.`;
  }

  if (player.fuel < player.fuelMax) {
    if (cash <= 0) return 'At depot: fuel is low, but you need cash before refueling.';
    return `At depot: press Space or Refuel to top up fuel for $${refuelCost(player)}.`;
  }

  if (player.hull < player.hullMax) {
    if (cash <= 0) return 'At depot: hull needs repairs, but you need cash first.';
    return `At depot: press Space or Repair to fix hull for $${repairCost(player)}.`;
  }

  return 'At depot: cargo empty, fuel full, hull repaired — upgrades are available when you have enough cash.';
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
