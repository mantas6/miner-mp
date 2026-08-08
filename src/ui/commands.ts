// The one-way door from the React tree back into the game.
//
// Components never import `game.ts` (that would drag the whole simulation into
// the UI module graph and back again through the store). Instead the game
// registers a flat command table while it boots, and buttons dispatch into it.
// Every command is a no-op until registration and again after teardown, so
// rendering the UI without a running game — in tests, between a StrictMode
// double-mount, after a crash — is harmless.

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
  toggleMusic(): void;
  toggleSfx(): void;
  /** Leave the splash for the relay panel; the press doubles as the audio gesture. */
  openMultiplayer(event?: Event): void;
  /** Begin the lyric voice-over that loops for as long as the splash is up. */
  startIntroVoice(): void;
  stopIntroVoice(): void;
  connect(url: string): void;
  /** Leave the relay panel for the splash, dropping any pending connection. */
  leaveMultiplayer(): void;
  /** Start the run alone. The splash's default: any press on the card lands here. */
  playSolo(event?: Event): void;
  grantDeveloperCash(): void;
  runDeveloperService(id: DeveloperServiceId): void;
  grantDeveloperUpgrade(id: PlayerUpgradeId): void;
  resetPlayerData(): void;
  resetWorldState(): void;
  /**
   * Wipe every stored key and reload. The Settings tab asks for confirmation
   * first; by the time this is called the player has already agreed.
   */
  resetGame(): void;
}

function noop(): void {
  /* no game is wired up yet */
}

/**
 * A fresh table of no-ops. Also what teardown restores: a disposed runtime must
 * not stay reachable through the buttons, or a click would drive a simulation
 * whose listeners, timers and animation frames are already gone.
 */
function noopCommands(): UiCommands {
  return {
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
    toggleMusic: noop,
    toggleSfx: noop,
    openMultiplayer: noop,
    startIntroVoice: noop,
    stopIntroVoice: noop,
    connect: noop,
    leaveMultiplayer: noop,
    playSolo: noop,
    grantDeveloperCash: noop,
    runDeveloperService: noop,
    grantDeveloperUpgrade: noop,
    resetPlayerData: noop,
    resetWorldState: noop,
    resetGame: noop
  };
}

/** The live table. Mutated in place, so every holder sees the current game. */
export const uiCommands: UiCommands = noopCommands();

/** Install (or override, in tests) the command implementations. */
export function setUiCommands(commands: Partial<UiCommands>): void {
  Object.assign(uiCommands, commands);
}

/** Point every command back at a no-op (runtime teardown). */
export function resetUiCommands(): void {
  Object.assign(uiCommands, noopCommands());
}
