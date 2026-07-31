import { describe, expect, it } from 'vitest';
import { MOTHERLODE_ROW, ORES, START_Y } from '../../shared/constants';
import { formatDepthMilestone, formatDepthMilestoneReached, getDepthMilestone } from './depth-milestone';

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

  it('announces a cleared landmark by depth, naming what the seam holds', () => {
    const starter = formatDepthMilestoneReached(getDepthMilestone(START_Y));
    expect(starter).toContain('Depth 50 m');
    expect(starter).toContain('starter Coal/Copper seam');

    const ore = formatDepthMilestoneReached(getDepthMilestone(START_Y + 5));
    expect(ore).toContain('Depth 600 m');
    expect(ore).toContain('Silver band');

    expect(formatDepthMilestoneReached(getDepthMilestone(START_Y + 860)))
      .toContain('Depth 10000 m — Motherlode core');
  });
});
