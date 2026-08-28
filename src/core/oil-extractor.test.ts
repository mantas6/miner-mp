import { describe, expect, it } from 'vitest';
import { MAX_WORLD_ROW, SURFACE_HEIGHT, WORLD_W } from '../../shared/constants';
import { explorationIndex } from '../../shared/exploration-codec';
import {
  OIL_EXTRACTOR,
  OIL_EXTRACTOR_ITEM,
  createOilExtractor,
  findNearbyOilPatch,
  isPatchDepleted,
  isWithinExtractorReach,
  oilExtractorAt,
  oilExtractorPlacementRefusal,
  tickOilExtractor
} from './oil-extractor';

describe('finding the patch to claim', () => {
  it('picks the nearest oil patch within reach, skipping the tile itself', () => {
    // A patch two east (out of reach) and one south (in reach): the near one wins.
    const near = findNearbyOilPatch(40, 100, (x, y) => (x === 40 && y === 101) || (x === 42 && y === 100));
    expect(near).toEqual({x: 40, y: 101});
  });

  it('reports nothing when no patch sits inside the radius', () => {
    expect(findNearbyOilPatch(40, 100, (x, y) => x === 40 && y === 100 + OIL_EXTRACTOR.patchRadius + 1)).toBeNull();
  });

  it('counts a diagonal neighbour as beside the tile', () => {
    expect(findNearbyOilPatch(40, 100, (x, y) => x === 41 && y === 101)).toEqual({x: 41, y: 101});
  });
});

describe('extractor reach', () => {
  it('covers its own tile and one step in any direction', () => {
    const extractor = createOilExtractor(40, 100, 40, 101);
    expect(isWithinExtractorReach(extractor, 40, 100)).toBe(true);
    expect(isWithinExtractorReach(extractor, 41, 99)).toBe(true);
    expect(isWithinExtractorReach(extractor, 42, 100)).toBe(false);
  });

  it('finds the extractor standing on a tile', () => {
    const extractors = [createOilExtractor(3, 3, 3, 4), createOilExtractor(40, 100, 41, 100)];
    expect(oilExtractorAt(extractors, 40, 100)).toBe(extractors[1]);
    expect(oilExtractorAt(extractors, 9, 9)).toBeNull();
  });
});

describe('drawing and pumping oil', () => {
  it('fills the buffer a little each step while the patch lasts', () => {
    const extractor = createOilExtractor(40, 100, 40, 101);
    const result = tickOilExtractor(extractor, {patchAlive: true, shipWithinReach: false, shipFuel: 0, shipFuelMax: 100});

    expect(result.drawFuel).toBe(0);
    expect(result.justDepleted).toBe(false);
    expect(extractor.buffer).toBeCloseTo(OIL_EXTRACTOR.ratePerTick);
    expect(extractor.extracted).toBeCloseTo(OIL_EXTRACTOR.ratePerTick);
  });

  it('never draws the buffer past its cap', () => {
    const extractor = createOilExtractor(40, 100, 40, 101);
    extractor.buffer = OIL_EXTRACTOR.bufferMax;
    tickOilExtractor(extractor, {patchAlive: true, shipWithinReach: false, shipFuel: 0, shipFuelMax: 100});
    expect(extractor.buffer).toBe(OIL_EXTRACTOR.bufferMax);
  });

  it('pumps the buffer into an adjacent thirsty ship', () => {
    const extractor = createOilExtractor(40, 100, 40, 101);
    extractor.buffer = 10;
    const result = tickOilExtractor(extractor, {patchAlive: true, shipWithinReach: true, shipFuel: 50, shipFuelMax: 100});

    expect(result.drawFuel).toBe(OIL_EXTRACTOR.refuelRatePerTick);
    // What it drew this step is gone from the buffer, plus what it pulled from the patch.
    expect(extractor.buffer).toBeCloseTo(10 + OIL_EXTRACTOR.ratePerTick - OIL_EXTRACTOR.refuelRatePerTick);
  });

  it('pumps nothing into a full tank, or when the ship is away', () => {
    const extractor = createOilExtractor(40, 100, 40, 101);
    extractor.buffer = 10;
    expect(tickOilExtractor(extractor, {patchAlive: true, shipWithinReach: true, shipFuel: 100, shipFuelMax: 100}).drawFuel).toBe(0);
    expect(tickOilExtractor(extractor, {patchAlive: true, shipWithinReach: false, shipFuel: 0, shipFuelMax: 100}).drawFuel).toBe(0);
  });

  it('never pours more than the tank has room for', () => {
    const extractor = createOilExtractor(40, 100, 40, 101);
    extractor.buffer = 50;
    const result = tickOilExtractor(extractor, {patchAlive: true, shipWithinReach: true, shipFuel: 99.7, shipFuelMax: 100});
    expect(result.drawFuel).toBeCloseTo(0.3);
  });

  it('announces the patch running dry exactly once, then stays inert', () => {
    const extractor = createOilExtractor(40, 100, 40, 101);
    extractor.extracted = OIL_EXTRACTOR.patchCapacity - OIL_EXTRACTOR.ratePerTick / 2;

    const draining = tickOilExtractor(extractor, {patchAlive: true, shipWithinReach: false, shipFuel: 0, shipFuelMax: 100});
    expect(draining.justDepleted).toBe(true);
    expect(extractor.extracted).toBe(OIL_EXTRACTOR.patchCapacity);

    // A drained patch neither draws nor re-announces.
    const after = tickOilExtractor(extractor, {patchAlive: true, shipWithinReach: false, shipFuel: 0, shipFuelMax: 100});
    expect(after.justDepleted).toBe(false);
    expect(after.drawFuel).toBe(0);
  });

  it('keeps pumping a leftover buffer after the patch is gone', () => {
    const extractor = createOilExtractor(40, 100, 40, 101);
    extractor.buffer = 5;
    const result = tickOilExtractor(extractor, {patchAlive: false, shipWithinReach: true, shipFuel: 0, shipFuelMax: 100});
    expect(result.drawFuel).toBe(OIL_EXTRACTOR.refuelRatePerTick);
    expect(result.justDepleted).toBe(false);
  });
});

describe('depletion verdict', () => {
  it('is depleted when the patch is gone or fully drained', () => {
    const fresh = createOilExtractor(40, 100, 40, 101);
    expect(isPatchDepleted(fresh, true)).toBe(false);
    expect(isPatchDepleted(fresh, false)).toBe(true);
    fresh.extracted = OIL_EXTRACTOR.patchCapacity;
    expect(isPatchDepleted(fresh, true)).toBe(true);
  });
});

describe('extractor placement rules', () => {
  const context = (overrides: Partial<Parameters<typeof oilExtractorPlacementRefusal>[2]> = {}) => ({
    explored: new Set([explorationIndex(40, 100)]),
    open: true,
    extractors: [],
    nearOilPatch: true,
    ...overrides
  });

  it('accepts an explored, cleared tile beside an oil patch', () => {
    expect(oilExtractorPlacementRefusal(40, 100, context())).toBeNull();
  });

  it.each([
    ['above the mine', 40, SURFACE_HEIGHT - 1, {}, 'underground'],
    ['past the side wall', WORLD_W, 100, {}, 'underground'],
    ['below the deepest row', 40, MAX_WORLD_ROW + 1, {}, 'underground'],
    ['still under fog', 41, 100, {}, 'already explored'],
    ['inside terrain', 40, 100, {open: false}, 'cleared space'],
    ['already taken', 40, 100, {extractors: [createOilExtractor(40, 100, 40, 101)]}, 'already stands'],
    ['nowhere near a patch', 40, 100, {nearOilPatch: false}, 'beside an oil patch']
  ])('refuses a tile %s', (_name, x, y, overrides, reason) => {
    expect(oilExtractorPlacementRefusal(x, y, context(overrides))).toContain(reason);
  });

  it('stops at the deployment cap, whatever the tile', () => {
    const extractors = Array.from({length: OIL_EXTRACTOR.maxPlaced}, (_, index) => createOilExtractor(index, 500, index, 501));
    expect(oilExtractorPlacementRefusal(40, 100, context({extractors}))).toContain(`${OIL_EXTRACTOR.maxPlaced} oil extractors`);
  });
});

describe('the carried item', () => {
  it('is a bay item with no sale value, so selling cargo leaves it aboard', () => {
    expect(OIL_EXTRACTOR_ITEM).toMatchObject({kind: 'extractor', label: 'Extractor', value: 0});
  });
});
