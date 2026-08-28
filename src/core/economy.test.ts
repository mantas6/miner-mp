import { describe, it, expect } from 'vitest';
import { refuelCost, repairCost, cargoCost, tankCost, hullCost, drillCost, partialFill, cargoValue, cheapestUpgrade, formatCargoUpgradeFeedback, formatSurfaceServiceGuidance } from './economy';
import { STARTING, ECONOMY } from './balance';
import { ORES } from '../../shared/constants';
import { addOre, createInventory } from './inventory';

describe('cost functions', () => {
  it.each([
    ['cargoCost', (level: number) => cargoCost({ cargoMax: STARTING.cargoMax + level * ECONOMY.cargo.step })],
    ['tankCost', (level: number) => tankCost({ fuelMax: STARTING.fuelMax + level * ECONOMY.tank.step })],
    ['hullCost', (level: number) => hullCost({ hullMax: STARTING.hullMax + level * ECONOMY.hull.step })],
    ['drillCost', (level: number) => drillCost({ drill: STARTING.drill + level })]
  ])('%s is a positive whole price that grows with every upgrade level', (_name, costAtLevel) => {
    let previous = 0;
    for (let level = 0; level < 6; level++) {
      const cost = costAtLevel(level);
      expect(Number.isInteger(cost)).toBe(true);
      expect(cost).toBeGreaterThan(previous);
      previous = cost;
    }
  });

  it('refuelCost grows with tank capacity and never drops below the base fee', () => {
    const base = refuelCost({ fuelMax: STARTING.fuelMax });
    expect(base).toBeGreaterThan(0);
    expect(refuelCost({ fuelMax: STARTING.fuelMax + ECONOMY.tank.step })).toBeGreaterThan(base);
  });

  it('repairCost grows with hull damage and is lowest at full hull', () => {
    const undamaged = repairCost({ hullMax: STARTING.hullMax, hull: STARTING.hullMax });
    expect(undamaged).toBeGreaterThan(0);
    expect(repairCost({ hullMax: STARTING.hullMax, hull: STARTING.hullMax / 2 })).toBeGreaterThan(undamaged);
    expect(repairCost({ hullMax: STARTING.hullMax, hull: 0 }))
      .toBeGreaterThan(repairCost({ hullMax: STARTING.hullMax, hull: STARTING.hullMax / 2 }));
  });
});

describe('cargo and upgrade feedback', () => {
  const baselinePlayer = { cargoMax: STARTING.cargoMax, fuelMax: STARTING.fuelMax, hullMax: STARTING.hullMax, drill: STARTING.drill };

  it('sums current cargo value from the inventory ore stacks', () => {
    let inventory = createInventory();
    inventory = addOre(inventory, ORES[0], 99)!;
    inventory = addOre(inventory, ORES[0], 99)!;
    inventory = addOre(inventory, ORES[1], 99)!;

    expect(cargoValue(inventory)).toBe(ORES[0].value * 2 + ORES[1].value);
    expect(cargoValue(createInventory())).toBe(0);
  });

  it('selects the cheapest next ship upgrade', () => {
    expect(cheapestUpgrade(baselinePlayer)).toEqual({ label: 'Cargo +10', cost: 120 });
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
    expect(formatCargoUpgradeFeedback(baselinePlayer, 40, 25)).toBe('Cargo value $25 · Next Cargo +10 $120 (need $55 more)');
  });

  it('formats ready feedback when selling cargo would afford the next upgrade', () => {
    expect(formatCargoUpgradeFeedback(baselinePlayer, 70, 55)).toBe('Cargo value $55 · Next Cargo +10 $120 (ready after sell)');
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
