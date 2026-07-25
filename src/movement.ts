import { SPRINT } from './balance';

export function isTraversableTerrain(tileType: string): boolean {
  return tileType === 'air';
}

export function isOpenSpaceDestination(destinationChanged: boolean, tileType: string, activeEnemy: boolean): boolean {
  return destinationChanged && isTraversableTerrain(tileType) && !activeEnemy;
}

export function keyboardMovementRepeatMs(normalRepeatMs: number, sprintRequested: boolean, destinationOpen: boolean): number {
  return sprintRequested && destinationOpen ? normalRepeatMs * SPRINT.repeatMultiplier : normalRepeatMs;
}

export function movementFuelCost(normalCost: number, sprintRequested: boolean, destinationOpen: boolean, movingDownward: boolean): number {
  if (destinationOpen && movingDownward) return 0;
  return sprintRequested && destinationOpen ? normalCost * SPRINT.fuelMultiplier : normalCost;
}

export function fuelAfterMovement(currentFuel: number, normalCost: number, sprintRequested: boolean, destinationOpen: boolean, movingDownward: boolean): number {
  return currentFuel - movementFuelCost(normalCost, sprintRequested, destinationOpen, movingDownward);
}
