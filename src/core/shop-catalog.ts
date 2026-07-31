// The one description of everything the depot sells.
//
// Prices come from `economy.ts`, mechanical limits from `upgrades.ts`/`balance.ts`,
// and the shelf copy lives here — previously the same five upgrades were spelled
// out in the shop's DOM updater, the JSX template, and the upgrade table. Each
// `*RowState()` function is pure: give it a ship snapshot, the wallet, and whether
// the ship is docked, and it returns exactly the strings and the disabled flag the
// shop row paints.

import { ECONOMY, LIMITS } from './balance';
import { cargoCost, drillCost, hullCost, refuelCost, repairCost, tankCost, visibilityCost } from './economy';
import { MIN_TELEPORT_DEPTH_METERS } from './teleporter';
import type { Player } from './types';
import { PLAYER_UPGRADES, getPlayerUpgradeProgress, type PlayerUpgradeId } from './upgrades';

type ShopPlayer = Pick<
  Player,
  'fuel' | 'fuelMax' | 'hull' | 'hullMax' | 'cargoMax' | 'drill' | 'visibility' | 'dynamite' | 'teleporters' | 'gunOwned' | 'bullets'
>;

export interface ShopRowState {
  /** Sprite class suffix in `styles/icons.css`. */
  icon: string;
  title: string
  copy: string;
  /** The live "what you own now" line. */
  current: string;
  /** Upgrades only: what the next level buys. */
  benefit?: string;
  /** Short availability badge. */
  status: string;
  buttonLabel: string;
  buttonDisabled: boolean;
}

export interface ShopUpgradeEntry {
  id: PlayerUpgradeId;
  label: string;
  icon: string;
  purpose: string;
  unit: string;
  cost(player: ShopPlayer): number;
}

const UPGRADE_PRESENTATION: Record<PlayerUpgradeId, Omit<ShopUpgradeEntry, 'id' | 'label'>> = {
  cargo: {
    icon: 'cargo',
    purpose: 'Carry more ore before returning to sell.',
    unit: 'slots',
    cost: cargoCost
  },
  tank: {
    icon: 'tank',
    purpose: 'Extend safe range between depot refuels.',
    unit: 'fuel',
    cost: tankCost
  },
  hull: {
    icon: 'hull',
    purpose: 'Survive more rock, magma, and fiend damage.',
    unit: 'strength',
    cost: hullCost
  },
  drill: {
    icon: 'drill',
    purpose: 'Break tougher terrain and enemies faster.',
    unit: 'power',
    cost: drillCost
  },
  visibility: {
    icon: 'visibility',
    purpose: 'Reveal a larger persistent square around the ship. Even sizes extend one extra tile right and down.',
    unit: 'tiles wide',
    cost: visibilityCost
  }
};

export const SHOP_UPGRADES: readonly ShopUpgradeEntry[] = PLAYER_UPGRADES.map(upgrade => ({
  id: upgrade.id,
  label: upgrade.label,
  ...UPGRADE_PRESENTATION[upgrade.id]
}));

export const SHOP_SERVICES = [
  {
    id: 'fuel',
    icon: 'fuel',
    title: 'Refuel',
    copy: 'Restore the current tank before descending.',
    verb: 'Refuel'
  },
  {
    id: 'repair',
    icon: 'repair',
    title: 'Hull Repair',
    copy: 'Restore damage without changing maximum strength.',
    verb: 'Repair'
  }
] as const;

export type ShopServiceId = typeof SHOP_SERVICES[number]['id'];

export const SHOP_ITEMS = [
  {
    id: 'dynamite',
    icon: 'dynamite',
    title: 'Dynamite',
    copy: 'Clears nearby terrain underground. Destroys ore and artifacts without rewards.',
    price: ECONOMY.dynamite.price
  },
  {
    id: 'teleporter',
    icon: 'teleporter',
    title: 'Teleporter',
    copy: `Emergency round trip from ${MIN_TELEPORT_DEPTH_METERS} m or deeper to the depot without unloading or servicing the ship.`,
    price: ECONOMY.teleporter.price
  }
] as const;

export type ShopItemId = typeof SHOP_ITEMS[number]['id'];

export const SHOP_GUN = {
  icon: 'gun',
  title: 'Linebreaker Gun',
  copy: `Permanent precision weapon. Fires one round up to ${ECONOMY.gun.range} tiles; rock, depot structure, boundaries, and Motherlode are protected.`,
  price: ECONOMY.gun.price
} as const;

export const SHOP_AMMO = {
  icon: 'bullets',
  title: 'Gun Ammunition',
  copy: 'Six precision rounds. Requires the permanent Linebreaker Gun.',
  price: ECONOMY.gun.ammoPrice,
  bundle: ECONOMY.gun.ammoBundle
} as const;

/** The shared "can I buy this right now?" verdict for a fixed-price purchase. */
function purchaseState(cash: number, price: number, atSurface: boolean, unavailable = false): Pick<ShopRowState, 'status' | 'buttonDisabled'> {
  return {
    status: !atSurface ? 'Surface depot only' : unavailable ? 'Maximum' : cash >= price ? 'Ready' : `Need $${price - cash}`,
    buttonDisabled: !atSurface || unavailable || cash < price
  };
}

export function shopSummary(cash: number, atSurface: boolean): {cash: string; location: string} {
  return {
    cash: `$${Math.floor(cash)} available`,
    location: atSurface ? 'Surface depot' : 'Return to surface'
  };
}

export function upgradeRowState(id: PlayerUpgradeId, player: ShopPlayer, cash: number, atSurface: boolean): ShopRowState {
  const entry = SHOP_UPGRADES.find(upgrade => upgrade.id === id)!;
  const progress = getPlayerUpgradeProgress(player as Player, id);
  const price = entry.cost(player);
  const stepValue = Math.min(progress.maxValue, progress.value + ECONOMY[id].step);
  return {
    icon: entry.icon,
    title: entry.label,
    copy: entry.purpose,
    current: `Level ${progress.level}/${progress.maxLevel} · ${progress.value}/${progress.maxValue} ${entry.unit}`,
    benefit: progress.atMax
      ? `Maximum ${progress.maxValue} ${entry.unit}`
      : `Next: ${progress.value} → ${stepValue} ${entry.unit}`,
    buttonLabel: progress.atMax ? 'Maximum' : `Buy · $${price}`,
    ...purchaseState(cash, price, atSurface, progress.atMax)
  };
}

export function serviceRowState(id: ShopServiceId, player: ShopPlayer, cash: number, atSurface: boolean): ShopRowState {
  const service = SHOP_SERVICES.find(entry => entry.id === id)!;
  const value = id === 'fuel' ? player.fuel : player.hull;
  const max = id === 'fuel' ? player.fuelMax : player.hullMax;
  const price = id === 'fuel' ? refuelCost(player) : repairCost(player);
  const full = value >= max;
  return {
    icon: service.icon,
    title: service.title,
    copy: service.copy,
    current: `${Math.ceil(value)}/${max} · full service $${price}`,
    status: !atSurface ? 'Surface depot only' : full ? 'Full' : cash > 0 ? (cash >= price ? 'Ready' : 'Partial service') : 'No cash',
    buttonLabel: `${service.verb} · $${price}`,
    buttonDisabled: !atSurface || full || cash <= 0
  };
}

export function itemRowState(id: ShopItemId, player: ShopPlayer, cash: number, atSurface: boolean): ShopRowState {
  const item = SHOP_ITEMS.find(entry => entry.id === id)!;
  const count = id === 'dynamite' ? player.dynamite : player.teleporters;
  return {
    icon: item.icon,
    title: item.title,
    copy: item.copy,
    current: `Carried: ${count}`,
    buttonLabel: `Buy one · $${item.price}`,
    ...purchaseState(cash, item.price, atSurface)
  };
}

export function gunRowState(player: ShopPlayer, cash: number, atSurface: boolean): ShopRowState {
  const state = purchaseState(cash, SHOP_GUN.price, atSurface, player.gunOwned);
  return {
    icon: SHOP_GUN.icon,
    title: SHOP_GUN.title,
    copy: SHOP_GUN.copy,
    current: player.gunOwned ? `Owned · Ammo: ${player.bullets}` : 'Not owned · Ammo: 0',
    buttonLabel: player.gunOwned ? 'Installed' : `Buy · $${SHOP_GUN.price}`,
    buttonDisabled: state.buttonDisabled,
    status: player.gunOwned ? (atSurface ? 'Owned' : 'Surface depot only') : state.status
  };
}

export function ammoRowState(player: ShopPlayer, cash: number, atSurface: boolean): ShopRowState {
  const ammoFull = player.bullets + SHOP_AMMO.bundle > LIMITS.bullets.max;
  const state = purchaseState(cash, SHOP_AMMO.price, atSurface, !player.gunOwned || ammoFull);
  return {
    icon: SHOP_AMMO.icon,
    title: SHOP_AMMO.title,
    copy: SHOP_AMMO.copy,
    current: `Ammo: ${player.bullets} · +${SHOP_AMMO.bundle} per bundle`,
    buttonLabel: `Buy ${SHOP_AMMO.bundle} · $${SHOP_AMMO.price}`,
    buttonDisabled: state.buttonDisabled,
    status: atSurface && !player.gunOwned ? 'Gun required' : atSurface && ammoFull ? 'Ammo full' : state.status
  };
}
