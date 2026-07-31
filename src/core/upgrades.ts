import { ECONOMY, LIMITS, STARTING } from './balance';
import type { Player } from './types';

export const PLAYER_UPGRADES = [
  { id: 'cargo', label: 'Cargo Bay', stat: 'cargoMax', currentStat: null, start: STARTING.cargoMax, max: LIMITS.cargoMax.max, step: ECONOMY.cargo.step },
  { id: 'tank', label: 'Fuel Tank', stat: 'fuelMax', currentStat: 'fuel', start: STARTING.fuelMax, max: LIMITS.fuelMax.max, step: ECONOMY.tank.step },
  { id: 'hull', label: 'Hull', stat: 'hullMax', currentStat: 'hull', start: STARTING.hullMax, max: LIMITS.hullMax.max, step: ECONOMY.hull.step },
  { id: 'drill', label: 'Drill', stat: 'drill', currentStat: null, start: STARTING.drill, max: LIMITS.drill.max, step: ECONOMY.drill.step },
  { id: 'visibility', label: 'Sensor Array', stat: 'visibility', currentStat: null, start: STARTING.visibility, max: LIMITS.visibility.max, step: ECONOMY.visibility.step }
] as const;

export type PlayerUpgradeId = typeof PLAYER_UPGRADES[number]['id'];

/** The upgraded maxima; enough to price and label an upgrade without a full Player. */
export type UpgradeProgressPlayer = Pick<Player, typeof PLAYER_UPGRADES[number]['stat']>;

export function getPlayerUpgrade(id: PlayerUpgradeId) {
  return PLAYER_UPGRADES.find(upgrade => upgrade.id === id)!;
}

export function getPlayerUpgradeProgress(player: UpgradeProgressPlayer, id: PlayerUpgradeId) {
  const upgrade = getPlayerUpgrade(id);
  const value = player[upgrade.stat];
  return {
    value,
    maxValue: upgrade.max,
    level: Math.max(0, Math.round((value - upgrade.start) / upgrade.step)),
    maxLevel: Math.ceil((upgrade.max - upgrade.start) / upgrade.step),
    atMax: value >= upgrade.max
  };
}

export function applyPlayerUpgrade(player: Player, id: PlayerUpgradeId): boolean {
  const upgrade = getPlayerUpgrade(id);
  const progress = getPlayerUpgradeProgress(player, id);
  if (progress.atMax) return false;

  player[upgrade.stat] = Math.min(upgrade.max, progress.value + upgrade.step);
  if (upgrade.currentStat) player[upgrade.currentStat] = player[upgrade.stat];
  return true;
}

export interface DeveloperControl {
  /** Current level / value readout next to the control. */
  level: string;
  buttonLabel: string;
  buttonDisabled: boolean;
}

/** Copy and disabled state for one free developer upgrade grant. */
export function formatDeveloperUpgradeControl(player: UpgradeProgressPlayer, id: PlayerUpgradeId): DeveloperControl {
  const upgrade = getPlayerUpgrade(id);
  const progress = getPlayerUpgradeProgress(player, id);
  return {
    level: `Level ${progress.level}/${progress.maxLevel} · ${progress.value}/${progress.maxValue}`,
    buttonLabel: progress.atMax
      ? `Developer: ${upgrade.label} at max`
      : `Developer: Grant ${upgrade.label} +${upgrade.step} · $0`,
    buttonDisabled: progress.atMax
  };
}
