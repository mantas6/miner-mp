import { describe, expect, it } from 'vitest';
import { keyboardMovementRepeatMs, movementFuelCost } from '../src/movement';

describe('sprint movement', () => {
  it('repeats movement meaningfully faster while sprinting', () => {
    expect(keyboardMovementRepeatMs(100, false)).toBe(100);
    expect(keyboardMovementRepeatMs(100, true)).toBeCloseTo(55);
  });

  it('consumes more fuel per sprint movement', () => {
    expect(movementFuelCost(2, false)).toBe(2);
    expect(movementFuelCost(2, true)).toBe(3.5);
  });
});
