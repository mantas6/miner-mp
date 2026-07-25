import { SPRINT } from './balance';

export function keyboardMovementRepeatMs(normalRepeatMs: number, sprinting: boolean): number {
  return sprinting ? normalRepeatMs * SPRINT.repeatMultiplier : normalRepeatMs;
}

export function movementFuelCost(normalCost: number, sprinting: boolean): number {
  return sprinting ? normalCost * SPRINT.fuelMultiplier : normalCost;
}
