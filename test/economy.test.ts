import { describe, it, expect } from 'vitest';
import { refuelCost, repairCost, cargoCost, tankCost, hullCost, drillCost, partialFill, cargoValue, cheapestUpgrade, formatCargoUpgradeFeedback, formatSurfaceServiceGuidance } from '../src/economy';
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

  it('hullCost at baseline and one step up', () => {
    expect(hullCost({ hullMax: STARTING.hullMax })).toBe(180);
    expect(hullCost({ hullMax: STARTING.hullMax + ECONOMY.hull.step })).toBe(249);
  });

  it('drillCost at baseline and one level up', () => {
    expect(drillCost({ drill: STARTING.drill })).toBe(200);
    expect(drillCost({ drill: STARTING.drill + 1 })).toBe(310);
  });
});

describe('cargo and upgrade feedback', () => {
  const baselinePlayer = { cargoMax: STARTING.cargoMax, fuelMax: STARTING.fuelMax, hullMax: STARTING.hullMax, drill: STARTING.drill };

  it('sums current cargo value from ore entries', () => {
    expect(cargoValue([{ value: 6 }, { value: 12 }, { value: 6 }])).toBe(24);
  });

  it('selects the cheapest next ship upgrade', () => {
    expect(cheapestUpgrade(baselinePlayer)).toEqual({ label: 'Cargo +5', cost: 120 });
  });

  it('recommends hull reinforcement when it is the cheapest next upgrade', () => {
    const upgradedPlayer = {
      cargoMax: STARTING.cargoMax + ECONOMY.cargo.step * 2,
      fuelMax: STARTING.fuelMax + ECONOMY.tank.step,
      hullMax: STARTING.hullMax,
      drill: STARTING.drill + ECONOMY.drill.step
    };

    expect(cheapestUpgrade(upgradedPlayer)).toEqual({ label: 'Hull +20', cost: 180 });
  });

  it('formats remaining progress when cargo plus cash cannot yet afford the cheapest upgrade', () => {
    expect(formatCargoUpgradeFeedback(baselinePlayer, 40, 25)).toBe('Cargo value $25 · Next Cargo +5 $120 (need $55 more)');
  });

  it('formats ready feedback when selling cargo would afford the next upgrade', () => {
    expect(formatCargoUpgradeFeedback(baselinePlayer, 70, 55)).toBe('Cargo value $55 · Next Cargo +5 $120 (ready after sell)');
  });
});

describe('surface service guidance', () => {
  const servicedPlayer = { fuel: 100, fuelMax: 100, hull: 100, hullMax: 100 };

  it('explains disabled depot and shop actions while underground', () => {
    expect(formatSurfaceServiceGuidance({ player: servicedPlayer, cash: 60, currentCargoValue: 0, atSurface: false }))
      .toBe('Underground: return to the surface depot to sell cargo, repair, refuel, and buy upgrades.');
  });

  it('prioritizes selling cargo at the surface', () => {
    expect(formatSurfaceServiceGuidance({ player: { ...servicedPlayer, fuel: 40, hull: 65 }, cash: 60, currentCargoValue: 32, atSurface: true }))
      .toBe('At depot: press Enter or Sell to unload cargo for $32.');
  });

  it('prioritizes refueling before repairs after cargo is empty', () => {
    expect(formatSurfaceServiceGuidance({ player: { ...servicedPlayer, fuel: 72, hull: 50 }, cash: 60, currentCargoValue: 0, atSurface: true }))
      .toBe('At depot: press Space or Refuel to top up fuel for $20.');
  });

  it('prompts repair when fuel is full and hull is damaged', () => {
    expect(formatSurfaceServiceGuidance({ player: { ...servicedPlayer, hull: 70 }, cash: 60, currentCargoValue: 0, atSurface: true }))
      .toBe('At depot: press Space or Repair to fix hull for $44.');
  });

  it('confirms full service state at the depot', () => {
    expect(formatSurfaceServiceGuidance({ player: servicedPlayer, cash: 60, currentCargoValue: 0, atSurface: true }))
      .toBe('At depot: cargo empty, fuel full, hull repaired — upgrades are available when you have enough cash.');
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
