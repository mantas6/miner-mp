// The one-way door from the React tree back into the game.
//
// Components never import `game.ts` (that would drag the whole simulation into
// the UI module graph and back again through the store). Instead the game
// registers a flat command table during `initGame()`, and buttons dispatch into
// it. Every command is a no-op until registration, so rendering the UI without a
// running game — in tests, or during the first frame — is harmless.

import type { DeveloperServiceId } from '../core/developer';
import type { PlayerUpgradeId } from '../core/upgrades';

export interface UiCommands {
  sell(): void;
  refuel(): void;
  repair(): void;
  buyUpgrade(id: PlayerUpgradeId): void;
  buyDynamite(): void;
  buyTeleporter(): void;
  buyGun(): void;
  buyBullets(): void;
  detonateDynamite(): void;
  useTeleporter(): void;
  toggleGunArmed(): void;
  openShop(): void;
  closeShop(): void;
  openInfo(): void;
  closeInfo(): void;
  toggleSound(): void;
  /** Leave the splash for the lobby; the press doubles as the audio gesture. */
  dismissIntro(event?: Event): void;
  connect(url: string): void;
  playSolo(event?: Event): void;
  grantDeveloperCash(): void;
  runDeveloperService(id: DeveloperServiceId): void;
  grantDeveloperUpgrade(id: PlayerUpgradeId): void;
  resetPlayerData(): void;
  resetWorldState(): void;
}

function noop(): void {
  /* no game is wired up yet */
}

export const uiCommands: UiCommands = {
  sell: noop,
  refuel: noop,
  repair: noop,
  buyUpgrade: noop,
  buyDynamite: noop,
  buyTeleporter: noop,
  buyGun: noop,
  buyBullets: noop,
  detonateDynamite: noop,
  useTeleporter: noop,
  toggleGunArmed: noop,
  openShop: noop,
  closeShop: noop,
  openInfo: noop,
  closeInfo: noop,
  toggleSound: noop,
  dismissIntro: noop,
  connect: noop,
  playSolo: noop,
  grantDeveloperCash: noop,
  runDeveloperService: noop,
  grantDeveloperUpgrade: noop,
  resetPlayerData: noop,
  resetWorldState: noop
};

/** Install (or override, in tests) the command implementations. */
export function setUiCommands(commands: Partial<UiCommands>): void {
  Object.assign(uiCommands, commands);
}
