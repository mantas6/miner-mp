import { describe, expect, it } from 'vitest';
import { formatExpeditionStats } from '../src/stats';

describe('expedition stats formatting', () => {
  it('formats a fresh save with encouraging zero-state copy', () => {
    expect(formatExpeditionStats({})).toEqual([
      { label: 'Max depth', value: '0 m', detail: 'Start digging to set a record' },
      { label: 'Cash earned', value: '$0', detail: 'Sell your first haul to begin' },
      { label: 'Ore mined', value: '0 ores', detail: 'Coal and Copper await below' },
      { label: 'Enemies destroyed', value: '0 fiends', detail: 'No fiends defeated yet' },
      { label: 'Deaths', value: '0 losses', detail: 'No ships lost' },
      { label: 'Motherlode claims', value: '0 claims', detail: 'Ultimate prize still waiting' }
    ]);
  });

  it('formats progressed career metrics with labels and separators', () => {
    expect(formatExpeditionStats({
      maxDepth: 1230,
      totalCashEarned: 98765,
      oreMined: 42,
      enemiesDestroyed: 1,
      deaths: 2,
      motherlodeClaims: 3
    })).toEqual([
      { label: 'Max depth', value: '1,230 m', detail: 'Deepest descent saved' },
      { label: 'Cash earned', value: '$98,765', detail: 'From cargo, bounties, and relics' },
      { label: 'Ore mined', value: '42 ores', detail: 'Total pieces extracted' },
      { label: 'Enemies destroyed', value: '1 fiend', detail: 'Tunnel fiends defeated' },
      { label: 'Deaths', value: '2 losses', detail: 'Replacement ships deployed' },
      { label: 'Motherlode claims', value: '3 claims', detail: 'Core cracked and banked' }
    ]);
  });

  it('coerces invalid or negative saved values to zero', () => {
    const rows = formatExpeditionStats({ maxDepth: -5, totalCashEarned: Number.NaN, oreMined: 1.9 });

    expect(rows[0].value).toBe('0 m');
    expect(rows[1].value).toBe('$0');
    expect(rows[2].value).toBe('1 ore');
  });
});
