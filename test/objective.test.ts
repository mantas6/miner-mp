import { describe, expect, it } from 'vitest';
import { STARTING } from '../src/balance';
import { formatExpeditionObjective, motherlodeDepthMeters, nextOreMilestone } from '../src/objective';
import { ORES, START_Y, WORLD_H } from '../src/constants';

const player = {
  y: START_Y,
  fuel: STARTING.fuel,
  fuelMax: STARTING.fuelMax,
  hull: STARTING.hull,
  hullMax: STARTING.hullMax,
  cargoMax: STARTING.cargoMax,
  drill: STARTING.drill
};

describe('expedition objective helper', () => {
  it('starts new runs with starter seam guidance', () => {
    expect(formatExpeditionObjective({
      player,
      cash: STARTING.cash,
      cargoCount: 0,
      currentCargoValue: 0,
      atSurface: true
    })).toBe('Objective: mine the starter Coal/Copper seam below the depot, then return to sell.');
  });

  it('turns starter Coal/Copper cargo into return-and-upgrade guidance', () => {
    const cargoValue = ORES[0].value + ORES[1].value;

    expect(formatExpeditionObjective({
      player: { ...player, y: START_Y + 4 },
      cash: 96,
      cargoCount: 2,
      currentCargoValue: cargoValue,
      atSurface: false
    })).toBe('Objective: return and sell $24; Cargo +10 is ready after sale.');
  });

  it('prioritizes low fuel return warnings underground', () => {
    expect(formatExpeditionObjective({
      player: { ...player, y: START_Y + 12, fuel: 20 },
      cash: 20,
      cargoCount: 0,
      currentCargoValue: 0,
      atSurface: false
    })).toBe('Objective: return to the surface now — fuel is 20/100.');
  });

  it('points deeper players toward the next ore band', () => {
    expect(nextOreMilestone(80)).toEqual({ name: 'Silver', depthMeters: 600 });
    expect(formatExpeditionObjective({
      player: { ...player, y: START_Y + 8 },
      cash: 20,
      cargoCount: 0,
      currentCargoValue: 0,
      atSurface: false
    })).toBe('Objective: dig toward Silver around 600 m while keeping fuel for the trip home.');
  });

  it('prioritizes taking a secured Motherlode core back to the depot', () => {
    expect(formatExpeditionObjective({
      player: { ...player, y: START_Y + 100, fuel: 10 },
      cash: 20,
      cargoCount: 0,
      currentCargoValue: 0,
      atSurface: false,
      extractionPhase: 'returning'
    })).toBe('Objective: Motherlode core secured — return alive to the surface depot to complete extraction.');
  });

  it('uses Motherlode progress once all ore bands are unlocked', () => {
    expect(motherlodeDepthMeters(WORLD_H, START_Y)).toBe(10000);
    expect(formatExpeditionObjective({
      player: { ...player, y: START_Y + 860 },
      cash: 200,
      cargoCount: 0,
      currentCargoValue: 0,
      atSurface: false
    })).toBe('Objective: push toward the Motherlode core at 10000 m (1400 m deeper).');
  });
});
