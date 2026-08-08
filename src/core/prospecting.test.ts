import { describe, expect, it } from 'vitest';
import { ARTIFACTS, MAX_WORLD_ROW, ORES, START_Y } from '../../shared/constants';
import { buildArtifactGuideRows, buildProspectingGuideRows, formatDepthBandLabel, oreMinimumDepthMeters } from './prospecting';

describe('prospecting guide helpers', () => {
  it('converts ore minimum rows into player-facing depth labels from the start row', () => {
    expect(oreMinimumDepthMeters(START_Y)).toBe(0);
    expect(formatDepthBandLabel(START_Y, START_Y + 180)).toBe('starter–≈1800 m');
    expect(formatDepthBandLabel(START_Y + 5, START_Y + 320)).toBe('≈50–3200 m');
  });

  it('spells the bottomless world sentinel as an open band instead of its raw row', () => {
    const label = formatDepthBandLabel(START_Y + 700, MAX_WORLD_ROW);

    expect(label).toBe('≈7000 m and deeper');
    expect(label).not.toContain(String(MAX_WORLD_ROW));
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

  it('formats artifact rows in the same rounded metres as the ore table', () => {
    const rows = buildArtifactGuideRows();

    expect(rows).toHaveLength(ARTIFACTS.length);
    expect(rows[0]).toEqual({
      name: 'Ancient Coin Cache',
      color: '#ffd166',
      valueLabel: '$180 cash now',
      depthLabel: '≈2000–5000 m'
    });
    // The Alien Reliquary spawns down to `MAX_WORLD_ROW`, which used to leak into
    // the guide as a 1,000,799,917,193,410 m band.
    expect(rows.at(-1)).toEqual({
      name: 'Alien Reliquary',
      color: '#ff78e1',
      valueLabel: '$900 cash now',
      depthLabel: '≈7000 m and deeper'
    });
    for (const row of rows) expect(row.depthLabel).toMatch(/^≈\d{1,4}(–\d{1,4} m| m and deeper)$/);
  });
});
