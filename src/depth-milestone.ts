import { MOTHERLODE_ROW, ORES, START_Y } from './constants';
import { oreMinimumDepthMeters } from './prospecting';
import type { Ore } from './types';

export type DepthMilestoneKind = 'starter' | 'ore' | 'motherlode';

export interface DepthMilestone {
  kind: DepthMilestoneKind;
  target: string;
  depthMeters: number;
  remainingMeters: number;
}

/**
 * Finds the next depth landmark from shared ore/world data. The first two ore
 * bands form the deliberately generated Coal/Copper starter seam; after that,
 * each locked ore band becomes the next target before the Motherlode core.
 */
export function getDepthMilestone(
  playerY: number,
  ores: Ore[] = ORES,
  startY = START_Y,
  motherlodeRow = MOTHERLODE_ROW
): DepthMilestone {
  const depthMeters = Math.max(0, playerY - startY) * 10;
  const starterOres = ores.slice(0, 2);
  const starterDepth = Math.max(0, ...starterOres.map(ore => oreMinimumDepthMeters(ore.min, startY)));

  if (starterOres.length > 0 && depthMeters < starterDepth) {
    return {
      kind: 'starter',
      target: `starter ${starterOres.map(ore => ore.name).join('/') } seam`,
      depthMeters: starterDepth,
      remainingMeters: Math.max(0, starterDepth - depthMeters)
    };
  }

  const nextOre = ores.slice(starterOres.length).find(ore => oreMinimumDepthMeters(ore.min, startY) > depthMeters);
  if (nextOre) {
    const targetDepth = oreMinimumDepthMeters(nextOre.min, startY);
    return {
      kind: 'ore',
      target: nextOre.name,
      depthMeters: targetDepth,
      remainingMeters: Math.max(0, targetDepth - depthMeters)
    };
  }

  const targetDepth = Math.max(0, motherlodeRow - startY) * 10;
  return {
    kind: 'motherlode',
    target: 'Motherlode core',
    depthMeters: targetDepth,
    remainingMeters: Math.max(0, targetDepth - depthMeters)
  };
}

/** Formats the compact, always-visible progress readout used by the HUD. */
export function formatDepthMilestone(playerY: number, ores: Ore[] = ORES, startY = START_Y, motherlodeRow = MOTHERLODE_ROW): string {
  const milestone = getDepthMilestone(playerY, ores, startY, motherlodeRow);
  return `Depth target: ${milestone.target} — ${milestone.remainingMeters} m deeper.`;
}
