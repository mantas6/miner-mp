import { ECONOMY, LIMITS } from './balance';
import { cargoCost, drillCost, hullCost, refuelCost, repairCost, tankCost, visibilityCost } from './economy';
import type { Player } from './types';
import { getPlayerUpgradeProgress, type PlayerUpgradeId } from './upgrades';

const upgradeCosts: Record<PlayerUpgradeId, (player: Player) => number> = {
  cargo: cargoCost,
  tank: tankCost,
  hull: hullCost,
  drill: drillCost,
  visibility: visibilityCost
};

const upgradeUnits: Record<PlayerUpgradeId, string> = {
  cargo: 'slots',
  tank: 'fuel',
  hull: 'strength',
  drill: 'power',
  visibility: 'tiles wide'
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

  for (const id of ['cargo', 'tank', 'hull', 'drill', 'visibility'] as const) {
    const row = container.querySelector<HTMLElement>(`[data-shop-upgrade="${id}"]`);
    const progress = getPlayerUpgradeProgress(player, id);
    const price = upgradeCosts[id](player);
    const stepValue = Math.min(progress.maxValue, progress.value + ECONOMY[id].step);
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

  const gun = container.querySelector<HTMLElement>('[data-shop-gun]');
  const gunCurrent = gun?.querySelector<HTMLElement>('[data-shop-current]');
  const gunButton = gun?.querySelector<HTMLButtonElement>('button');
  const gunStatus = gun?.querySelector<HTMLElement>('[data-shop-status]');
  if (gunCurrent) gunCurrent.textContent = player.gunOwned ? `Owned · Ammo: ${player.bullets}` : 'Not owned · Ammo: 0';
  if (gunButton) gunButton.textContent = player.gunOwned ? 'Installed' : `Buy · $${ECONOMY.gun.price}`;
  setPurchaseState(gunButton ?? null, gunStatus ?? null, cash, ECONOMY.gun.price, atSurface, player.gunOwned);
  if (player.gunOwned && gunStatus) gunStatus.textContent = atSurface ? 'Owned' : 'Surface depot only';

  const ammo = container.querySelector<HTMLElement>('[data-shop-item="bullets"]');
  const ammoCurrent = ammo?.querySelector<HTMLElement>('[data-shop-current]');
  const ammoButton = ammo?.querySelector<HTMLButtonElement>('button');
  const ammoStatus = ammo?.querySelector<HTMLElement>('[data-shop-status]');
  if (ammoCurrent) ammoCurrent.textContent = `Ammo: ${player.bullets} · +${ECONOMY.gun.ammoBundle} per bundle`;
  if (ammoButton) ammoButton.textContent = `Buy ${ECONOMY.gun.ammoBundle} · $${ECONOMY.gun.ammoPrice}`;
  const ammoUnavailable = !player.gunOwned || player.bullets + ECONOMY.gun.ammoBundle > LIMITS.bullets.max;
  setPurchaseState(ammoButton ?? null, ammoStatus ?? null, cash, ECONOMY.gun.ammoPrice, atSurface, ammoUnavailable);
  if (atSurface && !player.gunOwned && ammoStatus) ammoStatus.textContent = 'Gun required';
  else if (atSurface && player.bullets + ECONOMY.gun.ammoBundle > LIMITS.bullets.max && ammoStatus) ammoStatus.textContent = 'Ammo full';
}
