import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEVELOPER_CASH_GRANT, grantDeveloperCash } from '../src/developer';
import { load, save } from '../src/persistence';
import { createInitialState } from '../src/state';

afterEach(() => vi.unstubAllGlobals());

describe('developer money cheat', () => {
  it('grants exactly $1,000 to local cash without changing earned-cash stats', () => {
    const state = createInitialState();
    const startingCash = state.cash;

    grantDeveloperCash(state);

    expect(DEVELOPER_CASH_GRANT).toBe(1_000);
    expect(state.cash).toBe(startingCash + 1_000);
    expect(state.stats.totalCashEarned).toBe(0);
  });

  it('allows repeated grants', () => {
    const state = createInitialState();

    grantDeveloperCash(state);
    grantDeveloperCash(state);
    grantDeveloperCash(state);

    expect(state.cash).toBe(3_060);
  });

  it('persists granted cash through the regular save path', () => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value)
    });
    const state = createInitialState();
    grantDeveloperCash(state);
    save(state);

    const restored = createInitialState();
    load(restored);

    expect(restored.cash).toBe(1_060);
  });
});
