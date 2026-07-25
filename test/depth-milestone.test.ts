import { describe, expect, it } from 'vitest';
import { MOTHERLODE_ROW, ORES, START_Y } from '../src/constants';
import { formatDepthMilestone, getDepthMilestone } from '../src/depth-milestone';

describe('expedition depth milestone helper', () => {
  it('guides fresh miners through the Coal/Copper starter seam', () => {
    expect(getDepthMilestone(START_Y)).toEqual({
      kind: 'starter',
      target: 'starter Coal/Copper seam',
      depthMeters: 50,
      remainingMeters: 50
    });
    expect(formatDepthMilestone(START_Y)).toBe('Depth target: starter Coal/Copper seam — 50 m deeper.');
  });

  it('moves to the next locked ore band at the starter-seam boundary', () => {
    expect(getDepthMilestone(START_Y + 5)).toEqual({
      kind: 'ore',
      target: 'Silver',
      depthMeters: 600,
      remainingMeters: 550
    });
  });

  it('uses the Motherlode after the last ore band and never reports negative distance', () => {
    const coreRow = MOTHERLODE_ROW;
    expect(getDepthMilestone(START_Y + 860, ORES, START_Y, MOTHERLODE_ROW)).toMatchObject({
      kind: 'motherlode',
      target: 'Motherlode core',
      depthMeters: 10000,
      remainingMeters: 1400
    });
    expect(formatDepthMilestone(coreRow + 20)).toBe('Depth target: Motherlode core — 0 m deeper.');
  });
});
