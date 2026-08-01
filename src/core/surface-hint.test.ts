import { describe, expect, it } from 'vitest';
import { formatSurfaceActionHint, type SurfaceHintInput } from './surface-hint';

/** A ship parked at the depot with a full tank, an intact hull and empty holds. */
const parked: SurfaceHintInput = {
  atSurface: true,
  gameOver: false,
  cargoValue: 0,
  cash: 100,
  fuel: 80,
  fuelMax: 80,
  hull: 100,
  hullMax: 100
};

function hint(patch: Partial<SurfaceHintInput>): string | null {
  return formatSurfaceActionHint({...parked, ...patch});
}

describe('depot Space prompt', () => {
  it('says nothing away from the depot or after the ship is lost', () => {
    expect(hint({atSurface: false, cargoValue: 40, fuel: 10})).toBeNull();
    expect(hint({gameOver: true, cargoValue: 40, fuel: 10})).toBeNull();
  });

  it('stays quiet when a topped-up ship has nothing to trade', () => {
    expect(hint({})).toBeNull();
  });

  it('names one job when only one is waiting', () => {
    expect(hint({cargoValue: 40})).toBe('Space: sell');
    expect(hint({fuel: 12})).toBe('Space: refuel');
    expect(hint({hull: 60})).toBe('Space: repair');
  });

  it('lists every waiting job in the order the key runs them', () => {
    expect(hint({cargoValue: 40, fuel: 12})).toBe('Space: sell & refuel');
    expect(hint({cargoValue: 40, hull: 60})).toBe('Space: sell & repair');
    expect(hint({fuel: 12, hull: 60})).toBe('Space: refuel & repair');
    expect(hint({cargoValue: 40, fuel: 12, hull: 60})).toBe('Space: sell, refuel & repair');
  });

  it('drops services the wallet cannot pay for', () => {
    expect(hint({cash: 0, fuel: 12, hull: 60})).toBeNull();
    expect(hint({cash: 0, cargoValue: 40})).toBe('Space: sell');
  });

  it('keeps offering paid services while a sale is still ahead of them', () => {
    expect(hint({cash: 0, cargoValue: 40, fuel: 12, hull: 60})).toBe('Space: sell, refuel & repair');
  });
});
