import type { Player } from './types';

export const DEVELOPER_CASH_GRANT = 1_000;

/** Developer tooling requires both Vite's development mode and an exact explicit opt-in. */
export function isDeveloperToolsEnabled(isDevelopment: boolean, flag?: string): boolean {
  return isDevelopment && flag === 'true';
}

export const DEVELOPER_SERVICES = [
  { id: 'fuel', label: 'Refuel', resourceLabel: 'Fuel', current: 'fuel', max: 'fuelMax' },
  { id: 'hull', label: 'Repair Hull', resourceLabel: 'Hull', current: 'hull', max: 'hullMax' }
] as const;

export type DeveloperServiceId = typeof DEVELOPER_SERVICES[number]['id'];

export function grantDeveloperCash(state: { cash: number }): void {
  state.cash += DEVELOPER_CASH_GRANT;
}

export function developerRefuel(player: Pick<Player, 'fuel' | 'fuelMax'>): boolean {
  if (player.fuel >= player.fuelMax) return false;
  player.fuel = player.fuelMax;
  return true;
}

export function developerRepairHull(player: Pick<Player, 'hull' | 'hullMax'>): boolean {
  if (player.hull >= player.hullMax) return false;
  player.hull = player.hullMax;
  return true;
}

export function updateDeveloperServiceControls(container: HTMLElement, player: Player): void {
  for (const service of DEVELOPER_SERVICES) {
    const current = player[service.current];
    const max = player[service.max];
    const full = current >= max;
    const row = container.querySelector<HTMLElement>(`[data-developer-service-row="${service.id}"]`);
    const status = row?.querySelector<HTMLElement>('[data-developer-service-level]');
    const button = row?.querySelector<HTMLButtonElement>('[data-developer-service]');
    if (status) status.textContent = `${service.resourceLabel} ${current}/${max}`;
    if (button) {
      button.disabled = full;
      button.textContent = full
        ? `Developer: ${service.label} (already full)`
        : `Developer: ${service.label} · $0`;
    }
  }
}
