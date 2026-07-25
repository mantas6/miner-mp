import { SPRINT } from './balance';
import type { Direction } from './types';

export function isTraversableTerrain(tileType: string): boolean {
  return tileType === 'air';
}

export function isOpenSpaceDestination(destinationChanged: boolean, tileType: string, activeEnemy: boolean): boolean {
  return destinationChanged && isTraversableTerrain(tileType) && !activeEnemy;
}

export function isSprintActive(sprintRequested: boolean, destinationOpen: boolean): boolean {
  return sprintRequested && destinationOpen;
}

export function activeSprintDirection(sprintRequested: boolean, destinationOpen: boolean, dx: number, dy: number): Direction | null {
  return isSprintActive(sprintRequested, destinationOpen) && (dx !== 0 || dy !== 0) ? [dx, dy] : null;
}

export function keyboardMovementRepeatMs(normalRepeatMs: number, sprintRequested: boolean, destinationOpen: boolean): number {
  return isSprintActive(sprintRequested, destinationOpen) ? normalRepeatMs * SPRINT.repeatMultiplier : normalRepeatMs;
}

export function movementFuelCost(normalCost: number, sprintRequested: boolean, destinationOpen: boolean, movingDownward: boolean): number {
  if (destinationOpen && movingDownward) return 0;
  return isSprintActive(sprintRequested, destinationOpen) ? normalCost * SPRINT.fuelMultiplier : normalCost;
}

export function fuelAfterMovement(currentFuel: number, normalCost: number, sprintRequested: boolean, destinationOpen: boolean, movingDownward: boolean): number {
  return currentFuel - movementFuelCost(normalCost, sprintRequested, destinationOpen, movingDownward);
}
