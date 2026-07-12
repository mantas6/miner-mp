import { describe, expect, it } from 'vitest';
import { ORES, START_Y } from '../src/constants';
import { buildProspectingGuideRows, formatOreDepthLabel, oreMinimumDepthMeters } from '../src/prospecting';

describe('prospecting guide helpers', () => {
  it('converts ore minimum rows into player-facing depth labels from the start row', () => {
    expect(oreMinimumDepthMeters(START_Y)).toBe(0);
    expect(formatOreDepthLabel(START_Y)).toBe('starter seam');
    expect(formatOreDepthLabel(START_Y + 5)).toBe('≈50 m+');
  });

  it('formats guide rows from the ore constants without stale copied values', () => {
    const rows = buildProspectingGuideRows();

    expect(rows).toHaveLength(ORES.length);
    expect(rows[0]).toEqual({
      name: 'Coal',
      color: '#343434',
      valueLabel: '$8',
      depthLabel: 'starter seam'
    });
    expect(rows[1]).toMatchObject({
      name: 'Copper',
      color: '#c47b45',
      valueLabel: '$16',
      depthLabel: '≈50 m+'
    });
    expect(rows.at(-1)).toMatchObject({
      name: 'Core Shard',
      valueLabel: '$980',
      depthLabel: '≈2380 m+'
    });
  });
});
