import { ECONOMY, ENEMY, FUEL, HULL } from './balance';
import { DANGER, MOTHERLODE_ROW, START_Y } from './constants';

export interface DangerGuideRow {
  title: string;
  detail: string;
}

function depthLabel(row: number, startY = START_Y): string {
  return `≈${Math.max(0, row - startY) * 10} m`;
}

/**
 * Player-facing survival guidance derived exclusively from the world and
 * balance configuration, so the overlay remains accurate as tuning changes.
 */
export function buildDangerGuideRows(): DangerGuideRow[] {
  const coreRow = MOTHERLODE_ROW;
  return [
    {
      title: 'Solid rock',
      detail: `Starts around ${depthLabel(DANGER.rockMinRow)}. It cannot be drilled; detour through dirt or air instead of taking its ${HULL.rockBump}-hull impact.`
    },
    {
      title: 'Magma pockets',
      detail: `Start around ${depthLabel(DANGER.hazardMinRow)}. Vent them with repeated drilling, but each hit burns extra fuel and scorches hull; damage rises with depth.`
    },
    {
      title: 'Dormant tunnel fiends',
      detail: `Appear from about ${depthLabel(DANGER.enemyMinRow)}. Drilling nearby blocks can wake one, so leave room to retreat.`
    },
    {
      title: 'Active fiends',
      detail: `Drill them back before they chew the hull. Their bites start at ${HULL.enemyBite.base} hull damage and grow deeper down.`
    },
    {
      title: 'Fiend bounties',
      detail: `A destroyed fiend pays $${ENEMY.bounty.base}, plus $${ENEMY.bounty.step} for every ${ENEMY.bounty.depthDivisor} rows of depth.`
    },
    {
      title: 'Fuel discipline',
      detail: `At ${Math.round(FUEL.lowFuelFraction * 100)}% fuel, turn back toward the surface depot. Sell, refuel, and repair before the next deep push.`
    },
    {
      title: 'Motherlode core',
      detail: `Near ${depthLabel(coreRow)}, the core needs repeated drilling. Claiming it pays $${ECONOMY.artifactReward}; make a safe route home alive.`
    }
  ];
}
