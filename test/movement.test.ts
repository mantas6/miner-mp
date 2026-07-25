import { describe, expect, it } from 'vitest';
import { isOpenSpaceDestination, keyboardMovementRepeatMs, movementFuelCost } from '../src/movement';

describe('sprint movement', () => {
  it('repeats open-space movement faster and consumes sprint fuel', () => {
    const destinationOpen = isOpenSpaceDestination(true, 'air', false);

    expect(keyboardMovementRepeatMs(100, true, destinationOpen)).toBeCloseTo(55);
    expect(movementFuelCost(2, true, destinationOpen)).toBe(3.5);
  });

  it('keeps drill timing and fuel ordinary while Shift is held', () => {
    for (const tileType of ['dirt', 'ore', 'rock', 'hazard', 'artifact', 'enemy']) {
      const destinationOpen = isOpenSpaceDestination(true, tileType, false);
      expect(keyboardMovementRepeatMs(100, true, destinationOpen)).toBe(100);
      expect(movementFuelCost(2, true, destinationOpen)).toBe(2);
    }
  });

  it('only starts sprinting after a drilled destination becomes open', () => {
    const drillable = isOpenSpaceDestination(true, 'dirt', false);
    const cleared = isOpenSpaceDestination(true, 'air', false);

    expect(keyboardMovementRepeatMs(100, true, drillable)).toBe(100);
    expect(movementFuelCost(2, true, drillable)).toBe(2);
    expect(keyboardMovementRepeatMs(100, true, cleared)).toBeCloseTo(55);
    expect(movementFuelCost(2, true, cleared)).toBe(3.5);
  });

  it('does not sprint into an active enemy or at a clamped world boundary', () => {
    expect(isOpenSpaceDestination(true, 'air', true)).toBe(false);
    expect(isOpenSpaceDestination(false, 'air', false)).toBe(false);
  });

  it('does not sprint without Shift even in open space', () => {
    expect(keyboardMovementRepeatMs(100, false, true)).toBe(100);
    expect(movementFuelCost(2, false, true)).toBe(2);
  });
});
