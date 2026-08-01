// The UI's single source of truth.
//
// The simulation still owns `GameState` and the canvas is still drawn
// imperatively; this store holds only what the React tree needs to paint the
// chrome around it. The game pushes into it, the components subscribe to it, and
// nothing in `src/game/` ever reads the DOM to find out what the UI is doing.
//
// The HUD slice is written once per animation frame, so `syncHud()` takes a
// caller-owned scratch snapshot and copies it into the store *only* when a field
// actually changed: one allocation per visible change instead of one per frame.
// Components then subscribe to individual fields (`s => s.hud.fuel`), so a cash
// change never re-renders the fuel meter.

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand/react';
import { ECONOMY } from '../core/balance';
import { getDepthMilestone, type DepthMilestoneKind } from '../core/depth-milestone';
import { type FuelReserveStatus } from '../core/fuel-reserve';
import { formatExtractionPresentation } from '../core/extraction-presentation';
import { formatExpeditionObjective } from '../core/objective';
import { formatTerrainScanner } from '../core/scanner';
import { createInitialState } from '../core/state';
import { formatExpeditionStats, type ExpeditionStatRow } from '../core/stats';
import type { Ore, Player } from '../core/types';
import { INFO_NAVIGATION_SECTIONS } from './info-navigation';

/** Everything the HUD paints every frame. Primitives only, so diffing is cheap. */
export interface HudSnapshot {
  cash: number;
  depthMeters: number;
  fuel: number;
  fuelMax: number;
  hull: number;
  hullMax: number;
  cargo: number;
  cargoMax: number;
  cargoValue: number;
  fuelAlert: boolean;
  hullAlert: boolean;
  cargoAlert: boolean;
  objective: string;
  extractionHud: string | null;
  extractionInfo: string;
  atSurface: boolean;
  gameOver: boolean;
  gunArmed: boolean;
  gunOwned: boolean;
  bullets: number;
  dynamite: number;
  teleporters: number;
  /** A stored underground return point exists. */
  teleportReturn: boolean;
  /** The ship is deep enough to teleport up. */
  teleportDepthReached: boolean;
  /** The teleport button would do something right now. */
  teleportUsable: boolean;
  /** Adjacent drill/flight target readout, refreshed when the target changes. */
  scanner: string;
  /** Return-fuel forecast for the climb home. */
  fuelReserveStatus: FuelReserveStatus;
  fuelReserveNeeded: number;
  fuelReserveMargin: number;
  /** Next depth landmark: its name, kind, and how much deeper it is. */
  depthTarget: string;
  depthTargetKind: DepthMilestoneKind;
  depthTargetRemaining: number;
}

const HUD_KEYS = [
  'cash', 'depthMeters', 'fuel', 'fuelMax', 'hull', 'hullMax', 'cargo', 'cargoMax', 'cargoValue',
  'fuelAlert', 'hullAlert', 'cargoAlert', 'objective', 'extractionHud', 'extractionInfo',
  'atSurface', 'gameOver', 'gunArmed', 'gunOwned', 'bullets', 'dynamite', 'teleporters',
  'teleportReturn', 'teleportDepthReached', 'teleportUsable',
  'scanner', 'fuelReserveStatus', 'fuelReserveNeeded', 'fuelReserveMargin',
  'depthTarget', 'depthTargetKind', 'depthTargetRemaining'
] as const satisfies readonly (keyof HudSnapshot)[];

/** The ship stats the shop and the developer panel price and label their rows from. */
export type PlayerSnapshot = Pick<
  Player,
  'fuel' | 'fuelMax' | 'hull' | 'hullMax' | 'cargoMax' | 'drill' | 'visibility' | 'dynamite' | 'teleporters' | 'gunOwned' | 'bullets'
>;

const PLAYER_KEYS = [
  'fuel', 'fuelMax', 'hull', 'hullMax', 'cargoMax', 'drill', 'visibility', 'dynamite', 'teleporters', 'gunOwned', 'bullets'
] as const satisfies readonly (keyof PlayerSnapshot)[];

export interface CargoRow {
  name: string;
  color: string;
  count: number;
  value: number;
}

export interface ToastMessage {
  id: number;
  message: string;
}

/**
 * Which screen the player is on. The whole boot flow is this one field:
 *
 *   intro --(any press)--> lobby --(solo | paired)--> playing
 *
 * React renders the overlay for the current phase and nothing else, so the
 * splash and the lobby can never be on screen at the same time, and the game
 * only takes input once the run is live.
 */
export type UiPhase = 'intro' | 'lobby' | 'playing';

export interface UiState {
  hud: HudSnapshot;
  player: PlayerSnapshot;
  cargoRows: CargoRow[];
  statRows: ExpeditionStatRow[];
  shopOpen: boolean;
  infoOpen: boolean;
  infoTab: string;
  phase: UiPhase;
  connectionStatus: string;
  connectionInHud: boolean;
  /** Soundtrack and sound effects mute independently, one button each. */
  musicOn: boolean;
  musicLabel: string;
  sfxOn: boolean;
  sfxLabel: string;
  /** Queue of transient status lines; the newest one is the one on screen. */
  toasts: ToastMessage[];

  syncHud(next: Readonly<HudSnapshot>): void;
  syncPlayer(next: Readonly<PlayerSnapshot>): void;
  setCargoRows(rows: CargoRow[]): void;
  setStatRows(rows: ExpeditionStatRow[]): void;
  setShopOpen(open: boolean): void;
  setInfoOpen(open: boolean): void;
  setInfoTab(tab: string): void;
  setPhase(phase: UiPhase): void;
  setConnection(status: string, showInHud: boolean): void;
  setMusic(on: boolean, label: string): void;
  setSfx(on: boolean, label: string): void;
  pushToast(message: string): void;
  dismissToast(id: number): void;
}

/** Visible lifetime of one toast, matching the pre-store CSS timing. */
export const TOAST_VISIBLE_MS = 1800;

const initialState = createInitialState();

function initialHud(): HudSnapshot {
  const player = initialState.player;
  const milestone = getDepthMilestone(player.y);
  return {
    cash: initialState.cash,
    depthMeters: 0,
    fuel: player.fuel,
    fuelMax: player.fuelMax,
    hull: player.hull,
    hullMax: player.hullMax,
    cargo: 0,
    cargoMax: player.cargoMax,
    cargoValue: 0,
    fuelAlert: false,
    hullAlert: false,
    cargoAlert: false,
    objective: formatExpeditionObjective({
      player,
      cash: initialState.cash,
      cargoCount: 0,
      currentCargoValue: 0,
      atSurface: true,
      extractionPhase: 'none'
    }),
    extractionHud: null,
    extractionInfo: formatExtractionPresentation({
      phase: 'none',
      motherlodeExtractions: 0,
      reward: ECONOMY.artifactReward
    }).info,
    atSurface: true,
    gameOver: false,
    gunArmed: false,
    gunOwned: player.gunOwned,
    bullets: player.bullets,
    dynamite: player.dynamite,
    teleporters: player.teleporters,
    teleportReturn: false,
    teleportDepthReached: false,
    teleportUsable: false,
    // Nothing has been scanned before the first frame, which is exactly what the
    // scanner says about terrain it has not mapped yet.
    scanner: formatTerrainScanner({tile: {type: 'air'}, direction: [0, 1], explored: false}),
    fuelReserveStatus: 'safe',
    fuelReserveNeeded: 0,
    fuelReserveMargin: Math.floor(player.fuel),
    depthTarget: milestone.target,
    depthTargetKind: milestone.kind,
    depthTargetRemaining: milestone.remainingMeters
  };
}

function initialPlayer(): PlayerSnapshot {
  const player = initialState.player;
  return {
    fuel: player.fuel,
    fuelMax: player.fuelMax,
    hull: player.hull,
    hullMax: player.hullMax,
    cargoMax: player.cargoMax,
    drill: player.drill,
    visibility: player.visibility,
    dynamite: player.dynamite,
    teleporters: player.teleporters,
    gunOwned: player.gunOwned,
    bullets: player.bullets
  };
}

function sameCargoRows(a: CargoRow[], b: CargoRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, index) => {
    const other = b[index];
    return row.name === other.name && row.count === other.count && row.value === other.value && row.color === other.color;
  });
}

function sameStatRows(a: ExpeditionStatRow[], b: ExpeditionStatRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, index) => {
    const other = b[index];
    return row.label === other.label && row.value === other.value && row.detail === other.detail;
  });
}

let nextToastId = 1;
let toastTimer = 0;

export const uiStore = createStore<UiState>((set, get) => ({
  hud: initialHud(),
  player: initialPlayer(),
  cargoRows: [],
  statRows: formatExpeditionStats({}),
  shopOpen: false,
  infoOpen: false,
  infoTab: INFO_NAVIGATION_SECTIONS[0].id,
  phase: 'intro',
  connectionStatus: 'Disconnected',
  connectionInHud: false,
  musicOn: false,
  musicLabel: 'Enable music',
  sfxOn: false,
  sfxLabel: 'Enable sound effects',
  toasts: [],

  syncHud(next) {
    const current = get().hud;
    if (HUD_KEYS.every(key => current[key] === next[key])) return;
    set({hud: {...next}});
  },

  syncPlayer(next) {
    const current = get().player;
    if (PLAYER_KEYS.every(key => current[key] === next[key])) return;
    set({player: {...next}});
  },

  setCargoRows(rows) {
    if (sameCargoRows(get().cargoRows, rows)) return;
    set({cargoRows: rows});
  },

  setStatRows(rows) {
    if (sameStatRows(get().statRows, rows)) return;
    set({statRows: rows});
  },

  setShopOpen(open) {
    if (get().shopOpen !== open) set({shopOpen: open});
  },

  setInfoOpen(open) {
    if (get().infoOpen === open) return;
    set(open ? {infoOpen: true, infoTab: INFO_NAVIGATION_SECTIONS[0].id} : {infoOpen: false});
  },

  setInfoTab(tab) {
    if (get().infoTab !== tab) set({infoTab: tab});
  },

  setPhase(phase) {
    if (get().phase !== phase) set({phase});
  },

  setConnection(status, showInHud) {
    const state = get();
    if (state.connectionStatus === status && state.connectionInHud === showInHud) return;
    set({connectionStatus: status, connectionInHud: showInHud});
  },

  setMusic(on, label) {
    const state = get();
    if (state.musicOn === on && state.musicLabel === label) return;
    set({musicOn: on, musicLabel: label});
  },

  setSfx(on, label) {
    const state = get();
    if (state.sfxOn === on && state.sfxLabel === label) return;
    set({sfxOn: on, sfxLabel: label});
  },

  /** A newer message takes over the toast slot; the older one never reappears. */
  pushToast(message) {
    const entry = {id: nextToastId++, message};
    set({toasts: [entry]});
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => get().dismissToast(entry.id), TOAST_VISIBLE_MS) as unknown as number;
  },

  dismissToast(id) {
    const toasts = get().toasts.filter(toast => toast.id !== id);
    if (toasts.length !== get().toasts.length) set({toasts});
  }
}));

/** Subscribe a component to one slice of UI state. */
export function useUiStore<T>(selector: (state: UiState) => T): T {
  return useStore(uiStore, selector);
}

/** Build the cargo-bay rows shown in the Info overlay from the raw cargo list. */
export function buildCargoRows(cargo: readonly Ore[]): CargoRow[] {
  const rows = new Map<string, CargoRow>();
  for (const ore of cargo) {
    const row = rows.get(ore.name);
    if (row) {
      row.count++;
      row.value += ore.value;
      continue;
    }
    rows.set(ore.name, {name: ore.name, color: ore.color, count: 1, value: ore.value});
  }
  return [...rows.values()];
}

/** Push a transient status line. The game's `toast()` entry point. */
export function pushToast(message: string): void {
  uiStore.getState().pushToast(message);
}

/** Music button state, written by the audio controller. */
export function setMusicIcon(on: boolean): void {
  uiStore.getState().setMusic(on, on ? 'Mute music' : 'Enable music');
}

/** Sound-effects button state, written by the audio controller. */
export function setSfxIcon(on: boolean): void {
  uiStore.getState().setSfx(on, on ? 'Mute sound effects' : 'Enable sound effects');
}

export function setSoundUnavailableStatus(message = 'Sound unavailable in this browser'): void {
  const store = uiStore.getState();
  store.setMusic(store.musicOn, message);
  store.setSfx(store.sfxOn, message);
}

export function setSoundBlockedStatus(): void {
  const store = uiStore.getState();
  store.setMusic(false, 'Music blocked — press Music after a tap/click');
  store.setSfx(false, 'Sound blocked — press Sound after a tap/click');
}
