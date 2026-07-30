import { describe, expect, it } from 'vitest';
import { ORES, START_Y } from '../../shared/constants';
import { buildProspectingGuideRows, formatOreDepthLabel, oreMinimumDepthMeters } from './prospecting';

describe('prospecting guide helpers', () => {
  it('converts ore minimum rows into player-facing depth labels from the start row', () => {
    expect(oreMinimumDepthMeters(START_Y)).toBe(0);
    expect(formatOreDepthLabel(START_Y, START_Y + 180)).toBe('starter–≈1800 m');
    expect(formatOreDepthLabel(START_Y + 5, START_Y + 320)).toBe('≈50–3200 m');
  });

  it('formats guide rows from the ore constants without stale copied values', () => {
    const rows = buildProspectingGuideRows();

    expect(rows).toHaveLength(ORES.length);
    expect(rows[0]).toEqual({
      name: 'Coal',
      color: '#343434',
      valueLabel: '$8',
      depthLabel: 'starter–≈1800 m'
    });
    expect(rows[1]).toMatchObject({
      name: 'Copper',
      color: '#c47b45',
      valueLabel: '$16',
      depthLabel: '≈50–3200 m'
    });
    expect(rows.at(-1)).toMatchObject({
      name: 'Core Shard',
      valueLabel: '$980',
      depthLabel: '≈8500 m and deeper'
    });
  });
});
