import { ECONOMY } from './balance';
import { cargoCost, drillCost, hullCost, refuelCost, repairCost, tankCost } from './economy';
import type { Player } from './types';
import { getPlayerUpgradeProgress, type PlayerUpgradeId } from './upgrades';

const upgradeCosts: Record<PlayerUpgradeId, (player: Player) => number> = {
  cargo: cargoCost,
  tank: tankCost,
  hull: hullCost,
  drill: drillCost
};

const upgradeUnits: Record<PlayerUpgradeId, string> = {
  cargo: 'slots',
  tank: 'fuel',
  hull: 'strength',
  drill: 'power'
};

function setPurchaseState(button: HTMLButtonElement | null, status: HTMLElement | null, cash: number, price: number, atSurface: boolean, unavailable = false): void {
  if (!button || !status) return;
  button.disabled = !atSurface || unavailable || cash < price;
  status.textContent = !atSurface ? 'Surface depot only' : unavailable ? 'Maximum' : cash >= price ? 'Ready' : `Need $${price - cash}`;
}

export function updateShopControls(container: HTMLElement, player: Player, cash: number, atSurface: boolean): void {
  const cashDisplay = container.querySelector<HTMLElement>('[data-shop-cash]');
  const location = container.querySelector<HTMLElement>('[data-shop-location]');
  if (cashDisplay) cashDisplay.textContent = `$${Math.floor(cash)} available`;
  if (location) location.textContent = atSurface ? 'Surface depot' : 'Return to surface';

  for (const id of ['cargo', 'tank', 'hull', 'drill'] as const) {
    const row = container.querySelector<HTMLElement>(`[data-shop-upgrade="${id}"]`);
    const progress = getPlayerUpgradeProgress(player, id);
    const price = upgradeCosts[id](player);
    const stepValue = Math.min(progress.maxValue, progress.value + (id === 'cargo' ? ECONOMY.cargo.step : id === 'tank' ? ECONOMY.tank.step : id === 'hull' ? ECONOMY.hull.step : ECONOMY.drill.step));
    const current = row?.querySelector<HTMLElement>('[data-shop-current]');
    const benefit = row?.querySelector<HTMLElement>('[data-shop-benefit]');
    const button = row?.querySelector<HTMLButtonElement>('button');
    const status = row?.querySelector<HTMLElement>('[data-shop-status]');
    if (current) current.textContent = `Level ${progress.level}/${progress.maxLevel} · ${progress.value}/${progress.maxValue} ${upgradeUnits[id]}`;
    if (benefit) benefit.textContent = progress.atMax ? `Maximum ${progress.maxValue} ${upgradeUnits[id]}` : `Next: ${progress.value} → ${stepValue} ${upgradeUnits[id]}`;
    if (button) button.textContent = progress.atMax ? 'Maximum' : `Buy · $${price}`;
    setPurchaseState(button ?? null, status ?? null, cash, price, atSurface, progress.atMax);
  }

  const services = [
    { id: 'fuel', value: player.fuel, max: player.fuelMax, price: refuelCost(player) },
    { id: 'repair', value: player.hull, max: player.hullMax, price: repairCost(player) }
  ] as const;
  for (const service of services) {
    const row = container.querySelector<HTMLElement>(`[data-shop-service="${service.id}"]`);
    const full = service.value >= service.max;
    const current = row?.querySelector<HTMLElement>('[data-shop-current]');
    const button = row?.querySelector<HTMLButtonElement>('button');
    const status = row?.querySelector<HTMLElement>('[data-shop-status]');
    if (current) current.textContent = `${Math.ceil(service.value)}/${service.max} · full service $${service.price}`;
    if (button) button.textContent = service.id === 'fuel' ? `Refuel · $${service.price}` : `Repair · $${service.price}`;
    if (button) button.disabled = !atSurface || full || cash <= 0;
    if (status) status.textContent = !atSurface ? 'Surface depot only' : full ? 'Full' : cash > 0 ? (cash >= service.price ? 'Ready' : 'Partial service') : 'No cash';
  }

  const equipment = [
    { id: 'dynamite', count: player.dynamite, price: ECONOMY.dynamite.price },
    { id: 'teleporter', count: player.teleporters, price: ECONOMY.teleporter.price }
  ] as const;
  for (const item of equipment) {
    const row = container.querySelector<HTMLElement>(`[data-shop-item="${item.id}"]`);
    const current = row?.querySelector<HTMLElement>('[data-shop-current]');
    const button = row?.querySelector<HTMLButtonElement>('button');
    const status = row?.querySelector<HTMLElement>('[data-shop-status]');
    if (current) current.textContent = `Carried: ${item.count}`;
    if (button) button.textContent = `Buy one · $${item.price}`;
    setPurchaseState(button ?? null, status ?? null, cash, item.price, atSurface);
  }
}
