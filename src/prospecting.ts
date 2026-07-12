import { ORES, START_Y } from './constants';
import type { Ore } from './types';

export interface ProspectingGuideRow {
  name: string;
  color: string;
  valueLabel: string;
  depthLabel: string;
}

export function oreMinimumDepthMeters(oreMinRow: number, startY = START_Y): number {
  return Math.max(0, (oreMinRow - startY) * 10);
}

export function formatOreDepthLabel(oreMinRow: number, startY = START_Y): string {
  const meters = oreMinimumDepthMeters(oreMinRow, startY);
  return meters === 0 ? 'starter seam' : `≈${meters} m+`;
}

export function buildProspectingGuideRows(ores: Ore[] = ORES, startY = START_Y): ProspectingGuideRow[] {
  return ores.map(ore => ({
    name: ore.name,
    color: ore.color,
    valueLabel: `$${ore.value}`,
    depthLabel: formatOreDepthLabel(ore.min, startY)
  }));
}

export const PROSPECTING_TIP = 'Early goal: follow the starting shaft into the first Coal/Copper seam, sell it, then save toward Cargo +10.';
