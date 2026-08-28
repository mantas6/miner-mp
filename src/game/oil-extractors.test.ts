// Arming, deploying, and running the oil extractors the player leaves in the mine.
//
// The rules themselves are core/oil-extractor.test.ts; what is checked here is the
// wiring: the cargo bay pays for a placement, the extractor claims the patch beside
// it, a parked ship gets refuelled, and a drained patch is written back into the
// world as a depleted tile.

import { describe, expect, it, vi } from 'vitest';
import { explorationIndex } from '../../shared/exploration-codec';
import { addItem, countItem, createInventory } from '../core/inventory';
import { OIL_EXTRACTOR, OIL_EXTRACTOR_ITEM, createOilExtractor } from '../core/oil-extractor';
import { createInitialState } from '../core/state';
import type { GameState } from '../core/types';
import { createOilExtractors, type OilExtractorSim } from './oil-extractors';
import { createAudioStub, createFakeGrid, createToastLog, type AudioStub, type FakeGrid } from './test-support';

interface Harness {
  state: GameState;
  extractors: OilExtractorSim;
  grid: FakeGrid;
  audio: AudioStub;
  toasts: ReturnType<typeof createToastLog>;
  armedUi: boolean[];
  saveProgress: ReturnType<typeof vi.fn>;
}

/**
 * A ship parked on cleared, explored ground at (40,100) with an oil patch on the
 * tile below it and `carried` extractors aboard.
 */
function harness(carried = 1): Harness {
  const state = createInitialState();
  if (carried > 0) state.player.inventory = addItem(createInventory(), OIL_EXTRACTOR_ITEM, carried);
  state.player.x = 40;
  state.player.y = 100;
  state.exploredTiles.add(explorationIndex(40, 100));
  const grid = createFakeGrid((x, y) => (x === 40 && y === 101 ? {type: 'oil', depleted: false} : {type: 'air'}));
  const audio = createAudioStub();
  const toasts = createToastLog();
  const armedUi: boolean[] = [];
  const saveProgress = vi.fn();
  const extractors = createOilExtractors({
    state,
    grid,
    audio,
    toast: toasts.toast,
    saveProgress,
    setArmedUi: value => armedUi.push(value)
  });
  return {state, extractors, grid, audio, toasts, armedUi, saveProgress};
}

describe('arming an oil extractor', () => {
  it('arms from the slot, tells the UI, and stands down on a second press', () => {
    const h = harness();

    h.extractors.toggleArmed();
    expect(h.extractors.armed).toBe(true);
    expect(h.armedUi).toEqual([true]);
    expect(h.toasts.saw('beside an oil patch')).toBe(true);

    h.extractors.toggleArmed();
    expect(h.extractors.armed).toBe(false);
    expect(h.toasts.saw('cancelled')).toBe(true);
  });

  it('refuses to arm with an empty bay, and says where to buy one', () => {
    const h = harness(0);

    h.extractors.toggleArmed();

    expect(h.extractors.armed).toBe(false);
    expect(h.toasts.saw('surface depot')).toBe(true);
    expect(h.audio.played).toContain('alarm');
  });

  it('refuses to arm once the mine is full of them', () => {
    const h = harness();
    h.state.oilExtractors = Array.from({length: OIL_EXTRACTOR.maxPlaced}, (_, i) => createOilExtractor(i, 500, i, 501));

    h.extractors.toggleArmed();

    expect(h.extractors.armed).toBe(false);
    expect(h.toasts.saw(`${OIL_EXTRACTOR.maxPlaced} oil extractors`)).toBe(true);
  });
});

describe('deploying an oil extractor', () => {
  it('spends one from the bay and claims the patch beside it', () => {
    const h = harness(2);
    h.extractors.toggleArmed();

    expect(h.extractors.placeAt(40, 100)).toBe(true);
    expect(h.state.oilExtractors).toHaveLength(1);
    expect(h.state.oilExtractors[0]).toMatchObject({x: 40, y: 100, patchX: 40, patchY: 101, buffer: 0, extracted: 0});
    expect(countItem(h.state.player.inventory, OIL_EXTRACTOR_ITEM.kind)).toBe(1);
    expect(h.extractors.armed).toBe(false);
    expect(h.saveProgress).toHaveBeenCalled();
    expect(h.toasts.saw('deployed')).toBe(true);
  });

  it('refuses a tile with no oil patch beside it, keeping the extractor', () => {
    const h = harness();
    h.state.exploredTiles.add(explorationIndex(5, 100));
    h.extractors.toggleArmed();

    expect(h.extractors.placeAt(5, 100)).toBe(false);
    expect(h.state.oilExtractors).toEqual([]);
    expect(countItem(h.state.player.inventory, OIL_EXTRACTOR_ITEM.kind)).toBe(1);
    expect(h.extractors.armed).toBe(true);
    expect(h.toasts.saw('beside an oil patch')).toBe(true);
  });

  it('refuses a tile still under fog', () => {
    const h = harness();
    h.extractors.toggleArmed();

    // (41,100) sits beside the same patch diagonally, but has never been explored.
    expect(h.extractors.placeAt(41, 100)).toBe(false);
    expect(h.state.oilExtractors).toEqual([]);
    expect(h.toasts.saw('already explored')).toBe(true);
  });

  it('drops the armed pointer with the ship', () => {
    const h = harness();
    h.extractors.toggleArmed();
    h.state.gameOver = true;

    expect(h.extractors.placeAt(40, 100)).toBe(false);
    expect(h.extractors.armed).toBe(false);
  });
});

describe('a deployed oil extractor at work', () => {
  it('tops the tank off while the ship is parked alongside', () => {
    const h = harness();
    h.state.player.fuel = 50;
    h.state.player.fuelMax = 100;
    h.extractors.toggleArmed();
    h.extractors.placeAt(40, 100);

    for (let step = 0; step < 100; step++) h.extractors.tick();

    expect(h.state.player.fuel).toBeGreaterThan(50);
    expect(h.state.player.fuel).toBeLessThanOrEqual(100);
  });

  it('leaves a distant ship untouched but keeps drawing into the buffer', () => {
    const h = harness();
    h.state.player.fuel = 50;
    h.extractors.toggleArmed();
    h.extractors.placeAt(40, 100);
    // Fly the ship well out of reach.
    h.state.player.x = 10;
    h.state.player.y = 10;

    for (let step = 0; step < 20; step++) h.extractors.tick();

    expect(h.state.player.fuel).toBe(50);
    expect(h.state.oilExtractors[0].buffer).toBeGreaterThan(0);
  });

  it('drains the patch dry, writes it back as depleted, and announces it once', () => {
    const h = harness();
    h.state.player.fuel = h.state.player.fuelMax; // a full tank never pulls from the buffer
    h.extractors.toggleArmed();
    h.extractors.placeAt(40, 100);
    // Jump the meter to just shy of the cap so one tick tips it over.
    h.state.oilExtractors[0].extracted = OIL_EXTRACTOR.patchCapacity - OIL_EXTRACTOR.ratePerTick / 2;

    h.extractors.tick();

    const drained = h.grid.writes.find(write => write.x === 40 && write.y === 101);
    expect(drained?.tile).toEqual({type: 'oil', depleted: true});
    expect(h.toasts.messages.filter(message => message.includes('drained dry'))).toHaveLength(1);
    expect(h.saveProgress).toHaveBeenCalled();

    // A drained patch is never written back a second time.
    const writes = h.grid.writes.length;
    h.extractors.tick();
    expect(h.grid.writes.length).toBe(writes);
  });

  it('costs nothing at all while the mine holds no extractors', () => {
    const h = harness();

    for (let step = 0; step < 10; step++) h.extractors.tick();

    expect(h.grid.writes).toEqual([]);
  });
});
