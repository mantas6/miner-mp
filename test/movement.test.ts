import { describe, expect, it } from 'vitest';
import { FUEL } from '../src/balance';
import { partialFill } from '../src/economy';
import { activeSprintDirection, fuelAfterMovement, isOpenSpaceDestination, isSprintActive, keyboardMovementRepeatMs, movementDestination, movementFuelCost } from '../src/movement';

describe('world boundaries', () => {
  it('keeps horizontal and surface boundaries but allows downward travel beyond 10,000 m', () => {
    expect(movementDestination(45, 1002, 0, 1, 90, 2)).toEqual({x:45, y:1003});
    expect(movementDestination(45, 1205, 0, 1, 90, 2)).toEqual({x:45, y:1206});
    expect(movementDestination(1, 2, -1, -1, 90, 2)).toEqual({x:1, y:2});
  });
});

describe('surface fuel', () => {
  it('charges lateral open-space flight without passively refueling', () => {
    const flyCost = FUEL.baseMove * FUEL.flyMult;
    const fuel = fuelAfterMovement(50, flyCost, false, true, false);

    expect(fuel).toBeCloseTo(49.875);
    expect(fuel).toBeLessThan(50);
  });

  it('still allows explicit paid refueling at the depot', () => {
    expect(partialFill(50, 100, 20, 20)).toEqual({ value: 100, pay: 20, ratio: 1 });
  });
});

describe('sprint movement', () => {
  it('exposes active sprint direction only from the movement sprint truth', () => {
    expect(isSprintActive(true, true)).toBe(true);
    expect(activeSprintDirection(true, true, -1, 0)).toEqual([-1, 0]);
    expect(activeSprintDirection(true, false, 1, 0)).toBeNull();
    expect(activeSprintDirection(false, true, 1, 0)).toBeNull();
    expect(activeSprintDirection(true, true, 0, 0)).toBeNull();
  });

  it('repeats open-space movement faster and consumes sprint fuel', () => {
    const destinationOpen = isOpenSpaceDestination(true, 'air', false);

    expect(keyboardMovementRepeatMs(100, true, destinationOpen)).toBeCloseTo(55);
    expect(movementFuelCost(2, true, destinationOpen, false)).toBe(3.5);
  });

  it('keeps drill timing and fuel ordinary while Shift is held', () => {
    for (const tileType of ['dirt', 'ore', 'rock', 'hazard', 'artifact', 'motherlode', 'enemy']) {
      const destinationOpen = isOpenSpaceDestination(true, tileType, false);
      expect(keyboardMovementRepeatMs(100, true, destinationOpen)).toBe(100);
      expect(movementFuelCost(2, true, destinationOpen, false)).toBe(2);
    }
  });

  it('only starts sprinting after a drilled destination becomes open', () => {
    const drillable = isOpenSpaceDestination(true, 'dirt', false);
    const cleared = isOpenSpaceDestination(true, 'air', false);

    expect(keyboardMovementRepeatMs(100, true, drillable)).toBe(100);
    expect(movementFuelCost(2, true, drillable, false)).toBe(2);
    expect(keyboardMovementRepeatMs(100, true, cleared)).toBeCloseTo(55);
    expect(movementFuelCost(2, true, cleared, false)).toBe(3.5);
  });

  it('does not sprint into an active enemy or at a clamped world boundary', () => {
    expect(isOpenSpaceDestination(true, 'air', true)).toBe(false);
    expect(isOpenSpaceDestination(false, 'air', false)).toBe(false);
  });

  it('does not sprint without Shift even in open space', () => {
    expect(keyboardMovementRepeatMs(100, false, true)).toBe(100);
    expect(movementFuelCost(2, false, true, false)).toBe(2);
  });

  it('uses no fuel to move downward through open space, with or without Shift', () => {
    const destinationOpen = isOpenSpaceDestination(true, 'air', false);

    expect(movementFuelCost(2, false, destinationOpen, true)).toBe(0);
    expect(movementFuelCost(2, true, destinationOpen, true)).toBe(0);
    expect(keyboardMovementRepeatMs(100, true, destinationOpen)).toBeCloseTo(55);
    expect(activeSprintDirection(true, destinationOpen, 0, 1)).toEqual([0, 1]);
  });

  it('retains ordinary drill fuel when moving downward into terrain, with or without Shift', () => {
    const destinationOpen = isOpenSpaceDestination(true, 'dirt', false);

    expect(movementFuelCost(2, false, destinationOpen, true)).toBe(2);
    expect(movementFuelCost(2, true, destinationOpen, true)).toBe(2);
    expect(keyboardMovementRepeatMs(100, true, destinationOpen)).toBe(100);
  });

  it('does not waive downward fuel for enemies or blocked boundaries', () => {
    const activeEnemy = isOpenSpaceDestination(true, 'air', true);
    const clampedBoundary = isOpenSpaceDestination(false, 'air', false);

    expect(movementFuelCost(2, false, activeEnemy, true)).toBe(2);
    expect(movementFuelCost(2, true, activeEnemy, true)).toBe(2);
    expect(movementFuelCost(2, false, clampedBoundary, true)).toBe(2);
    expect(movementFuelCost(2, true, clampedBoundary, true)).toBe(2);
  });
});
