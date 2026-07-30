import { describe, expect, it } from 'vitest';
import { claimArtifact } from './artifacts';
import { ARTIFACTS } from '../../shared/constants';
import { createInitialState } from './state';

describe('artifact rewards', () => {
  it('pays cash immediately, records earnings, and consumes no cargo', () => {
    const state = createInitialState();
    const cargo = [{name:'Coal', color:'#333', value:8, min:2, max:182, chance:.1}];
    state.player.cargo = cargo;
    const cashBefore = state.cash;

    expect(claimArtifact(state, ARTIFACTS[1])).toBe(450);
    expect(state.cash).toBe(cashBefore + 450);
    expect(state.stats.totalCashEarned).toBe(450);
    expect(state.stats.artifactsFound).toBe(1);
    expect(state.player.cargo).toBe(cargo);
    expect(state.player.cargo).toHaveLength(1);
  });
});
