import { ECONOMY, FUEL } from './balance';
import { MOTHERLODE_ROW, ORES, START_Y } from '../../shared/constants';
import { cheapestUpgrade } from './economy';
import { oreMinimumDepthMeters } from './prospecting';
import type { Ore, Player } from './types';
import type { ExtractionPhase } from './extraction-phase';

type ObjectivePlayer = Pick<Player, 'y' | 'fuel' | 'fuelMax' | 'hull' | 'hullMax' | 'cargoMax' | 'drill'>;

export interface ObjectiveInput {
  player: ObjectivePlayer;
  cash: number;
  cargoCount: number;
  currentCargoValue: number;
  atSurface: boolean;
  extractionPhase?: ExtractionPhase;
  ores?: Ore[];
  startY?: number;
  motherlodeRow?: number;
}

export function currentDepthMeters(playerY: number, startY = START_Y): number {
  return Math.max(0, playerY - startY) * 10;
}

export function motherlodeDepthMeters(motherlodeRow = MOTHERLODE_ROW, startY = START_Y): number {
  return Math.max(0, motherlodeRow - startY) * 10;
}

export function nextOreMilestone(depthMeters: number, ores: Ore[] = ORES, startY = START_Y): { name: string; depthMeters: number } | null {
  const nextOre = ores.find(ore => oreMinimumDepthMeters(ore.min, startY) > depthMeters);
  if (!nextOre) return null;
  return { name: nextOre.name, depthMeters: oreMinimumDepthMeters(nextOre.min, startY) };
}

export function formatExpeditionObjective({
  player,
  cash,
  cargoCount,
  currentCargoValue,
  atSurface,
  extractionPhase = 'none',
  ores = ORES,
  startY = START_Y,
  motherlodeRow = MOTHERLODE_ROW
}: ObjectiveInput): string {
  if (extractionPhase === 'returning') {
    return 'Objective: Motherlode core secured — return alive to the surface depot to complete extraction.';
  }

  const depth = currentDepthMeters(player.y, startY);
  const lowFuel = player.fuel <= player.fuelMax * FUEL.lowFuelFraction;
  const nextUpgrade = cheapestUpgrade(player);
  const projectedCash = cash + currentCargoValue;

  if (!atSurface && lowFuel) {
    return `Objective: return to the surface now — fuel is ${Math.ceil(Math.max(0, player.fuel))}/${player.fuelMax}.`;
  }

  if (atSurface && currentCargoValue > 0) {
    return `Objective: sell cargo for $${currentCargoValue}, then ${projectedCash >= nextUpgrade.cost ? `buy ${nextUpgrade.label}` : `save for ${nextUpgrade.label}`}.`;
  }

  if (atSurface && cash >= nextUpgrade.cost) {
    return `Objective: buy ${nextUpgrade.label} for $${nextUpgrade.cost}, then dig deeper.`;
  }

  if (cargoCount >= player.cargoMax && !atSurface) {
    return `Objective: cargo full — return to sell $${currentCargoValue} and upgrade.`;
  }

  if (!atSurface && currentCargoValue > 0 && projectedCash >= nextUpgrade.cost) {
    return `Objective: return and sell $${currentCargoValue}; ${nextUpgrade.label} is ready after sale.`;
  }

  if (!atSurface && currentCargoValue > 0 && (depth >= 60 || currentCargoValue >= Math.max(24, nextUpgrade.cost - cash))) {
    return `Objective: bank this $${currentCargoValue} cargo at the depot before pushing deeper.`;
  }

  const nextOre = nextOreMilestone(depth, ores, startY);
  if (cargoCount === 0 && depth < 60) {
    return 'Objective: mine the starter Coal/Copper seam below the depot, then return to sell.';
  }

  if (nextOre) {
    return `Objective: dig toward ${nextOre.name} around ${nextOre.depthMeters} m while keeping fuel for the trip home.`;
  }

  const coreDepth = motherlodeDepthMeters(motherlodeRow, startY);
  const remaining = Math.max(0, coreDepth - depth);
  if (remaining > 0) {
    return `Objective: push toward the Motherlode core at ${coreDepth} m (${remaining} m deeper).`;
  }

  return `Objective: crack the Motherlode core, claim $${ECONOMY.artifactReward}, and get home alive.`;
}
