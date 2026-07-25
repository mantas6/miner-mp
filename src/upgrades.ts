import { ECONOMY, LIMITS, STARTING } from './balance';
import type { Player } from './types';

export const PLAYER_UPGRADES = [
  { id: 'cargo', label: 'Cargo Bay', stat: 'cargoMax', currentStat: null, start: STARTING.cargoMax, max: LIMITS.cargoMax.max, step: ECONOMY.cargo.step },
  { id: 'tank', label: 'Fuel Tank', stat: 'fuelMax', currentStat: 'fuel', start: STARTING.fuelMax, max: LIMITS.fuelMax.max, step: ECONOMY.tank.step },
  { id: 'hull', label: 'Hull', stat: 'hullMax', currentStat: 'hull', start: STARTING.hullMax, max: LIMITS.hullMax.max, step: ECONOMY.hull.step },
  { id: 'drill', label: 'Drill', stat: 'drill', currentStat: null, start: STARTING.drill, max: LIMITS.drill.max, step: ECONOMY.drill.step }
] as const;

export type PlayerUpgradeId = typeof PLAYER_UPGRADES[number]['id'];

export function getPlayerUpgrade(id: PlayerUpgradeId) {
  return PLAYER_UPGRADES.find(upgrade => upgrade.id === id)!;
}

export function getPlayerUpgradeProgress(player: Player, id: PlayerUpgradeId) {
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

export function updateDeveloperUpgradeControls(container: HTMLElement, player: Player): void {
  for (const upgrade of PLAYER_UPGRADES) {
    const progress = getPlayerUpgradeProgress(player, upgrade.id);
    const row = container.querySelector<HTMLElement>(`[data-upgrade-row="${upgrade.id}"]`);
    const level = row?.querySelector<HTMLElement>('[data-upgrade-level]');
    const button = row?.querySelector<HTMLButtonElement>('[data-developer-upgrade]');
    if (level) level.textContent = `Level ${progress.level}/${progress.maxLevel} · ${progress.value}/${progress.maxValue}`;
    if (button) {
      button.disabled = progress.atMax;
      button.textContent = progress.atMax
        ? `Developer: ${upgrade.label} at max`
        : `Developer: Grant ${upgrade.label} +${upgrade.step} · $0`;
    }
  }
}
