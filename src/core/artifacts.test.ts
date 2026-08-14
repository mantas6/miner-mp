import { describe, expect, it } from 'vitest';
import { claimArtifact } from './artifacts';
import { ARTIFACTS, ORES } from '../../shared/constants';
import { addOre, countOres, createInventory } from './inventory';
import { createInitialState } from './state';

describe('artifact rewards', () => {
  it('pays cash immediately, records earnings, and consumes no cargo', () => {
    const state = createInitialState();
    const inventory = addOre(createInventory(), ORES[0], 10)!;
    state.player.inventory = inventory;
    const cashBefore = state.cash;

    expect(claimArtifact(state, ARTIFACTS[1])).toBe(450);
    expect(state.cash).toBe(cashBefore + 450);
    expect(state.stats.totalCashEarned).toBe(450);
    expect(state.stats.artifactsFound).toBe(1);
    expect(state.player.inventory).toBe(inventory);
    expect(countOres(state.player.inventory)).toBe(1);
  });
});
