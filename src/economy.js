// Pure economy math. DOM-free / testable. No imports from dom.js or game.js.
import { STARTING, ECONOMY } from './balance.js';

export function refuelCost(player) {
  return Math.ceil(ECONOMY.refuel.base + (player.fuelMax - STARTING.fuelMax) * ECONOMY.refuel.perTank);
}

export function repairCost(player) {
  return Math.ceil(ECONOMY.repair.base + (player.hullMax - player.hull) * ECONOMY.repair.perHull);
}

export function cargoCost(player) {
  return Math.ceil(ECONOMY.cargo.base * Math.pow(ECONOMY.cargo.growth, Math.max(0, (player.cargoMax - STARTING.cargoMax) / ECONOMY.cargo.step)));
}

export function tankCost(player) {
  return Math.ceil(ECONOMY.tank.base * Math.pow(ECONOMY.tank.growth, Math.max(0, (player.fuelMax - STARTING.fuelMax) / ECONOMY.tank.step)));
}

export function drillCost(player) {
  return Math.ceil(ECONOMY.drill.base * Math.pow(ECONOMY.drill.growth, Math.max(0, player.drill - STARTING.drill)));
}

// Spend up to `cash` toward a full top-up costing `fullCost`, filling `current` toward `max` proportionally.
export function partialFill(current, max, cash, fullCost) {
  const pay = Math.min(cash, fullCost);
  const ratio = fullCost > 0 ? pay / fullCost : 1;
  const value = Math.min(max, current + (max - current) * ratio);
  return { value, pay, ratio };
}
