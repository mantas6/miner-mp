import { describe, it, expect } from 'vitest';
import { refuelCost, repairCost, cargoCost, tankCost, drillCost, partialFill, cargoValue, cheapestUpgrade, formatCargoUpgradeFeedback } from '../src/economy';
import { STARTING, ECONOMY } from '../src/balance';

describe('cost functions', () => {
  it('refuelCost at baseline and upgraded', () => {
    expect(refuelCost({ fuelMax: 100 })).toBe(20);
    expect(refuelCost({ fuelMax: 200 })).toBe(55);
  });

  it('repairCost at full and damaged hull', () => {
    expect(repairCost({ hullMax: 100, hull: 100 })).toBe(30);
    expect(repairCost({ hullMax: 100, hull: 50 })).toBe(53);
  });

  it('cargoCost at baseline and one step up', () => {
    expect(cargoCost({ cargoMax: STARTING.cargoMax })).toBe(120);
    expect(cargoCost({ cargoMax: STARTING.cargoMax + ECONOMY.cargo.step })).toBe(159);
  });

  it('tankCost at baseline', () => {
    expect(tankCost({ fuelMax: STARTING.fuelMax })).toBe(150);
  });

  it('drillCost at baseline and one level up', () => {
    expect(drillCost({ drill: STARTING.drill })).toBe(200);
    expect(drillCost({ drill: STARTING.drill + 1 })).toBe(310);
  });
});

describe('cargo and upgrade feedback', () => {
  const baselinePlayer = { cargoMax: STARTING.cargoMax, fuelMax: STARTING.fuelMax, drill: STARTING.drill };

  it('sums current cargo value from ore entries', () => {
    expect(cargoValue([{ value: 6 }, { value: 12 }, { value: 6 }])).toBe(24);
  });

  it('selects the cheapest next ship upgrade', () => {
    expect(cheapestUpgrade(baselinePlayer)).toEqual({ label: 'Cargo +10', cost: 120 });
  });

  it('formats remaining progress when cargo plus cash cannot yet afford the cheapest upgrade', () => {
    expect(formatCargoUpgradeFeedback(baselinePlayer, 40, 25)).toBe('Cargo value $25 · Next Cargo +10 $120 (need $55 more)');
  });

  it('formats ready feedback when selling cargo would afford the next upgrade', () => {
    expect(formatCargoUpgradeFeedback(baselinePlayer, 70, 55)).toBe('Cargo value $55 · Next Cargo +10 $120 (ready after sell)');
  });
});

describe('partialFill', () => {
  it('full cash fills completely', () => {
    const { value, pay } = partialFill(0, 100, 1000, 20);
    expect(value).toBe(100);
    expect(pay).toBe(20);
  });

  it('half-cost cash fills halfway', () => {
    const { value, pay } = partialFill(0, 100, 10, 20);
    expect(value).toBe(50);
    expect(pay).toBe(10);
  });

  it('fractional case', () => {
    const { value, pay } = partialFill(50, 100, 5, 30);
    expect(pay).toBe(5);
    expect(value).toBeCloseTo(58.333, 3);
  });
});
