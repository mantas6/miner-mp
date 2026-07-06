import { describe, it, expect } from 'vitest';
import { STARTING, LIMITS, ECONOMY } from '../src/balance';
import { cargoCost } from '../src/economy';
import { createInitialState } from '../src/state';

describe('starting cargo capacity', () => {
  it('starts new games with 10 cargo slots and empty cargo', () => {
    const state = createInitialState();

    expect(STARTING.cargoMax).toBe(10);
    expect(state.player.cargoMax).toBe(10);
    expect(state.player.cargo).toHaveLength(0);
  });

  it('uses 10 as the minimum saved cargo capacity while preserving upgrade increments', () => {
    expect(LIMITS.cargoMax.min).toBe(10);
    expect(ECONOMY.cargo.step).toBe(10);
    expect(cargoCost({ cargoMax: STARTING.cargoMax })).toBe(120);
    expect(cargoCost({ cargoMax: STARTING.cargoMax + ECONOMY.cargo.step })).toBe(159);
  });
});
