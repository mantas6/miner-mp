import { SPRINT } from './balance';

export function isOpenSpaceDestination(destinationChanged: boolean, tileType: string, activeEnemy: boolean): boolean {
  return destinationChanged && tileType === 'air' && !activeEnemy;
}

export function keyboardMovementRepeatMs(normalRepeatMs: number, sprintRequested: boolean, destinationOpen: boolean): number {
  return sprintRequested && destinationOpen ? normalRepeatMs * SPRINT.repeatMultiplier : normalRepeatMs;
}

export function movementFuelCost(normalCost: number, sprintRequested: boolean, destinationOpen: boolean): number {
  return sprintRequested && destinationOpen ? normalCost * SPRINT.fuelMultiplier : normalCost;
}
