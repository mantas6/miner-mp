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
import { formatShipStatusAnnouncement } from '../core/ship-status';
import { createInitialState } from '../core/state';
import { formatExpeditionStats, type ExpeditionStatRow } from '../core/stats';
import { formatSurfaceActionHint } from '../core/surface-hint';
import type { Ore, Player } from '../core/types';
import { DEFAULT_INFO_TAB, type InfoTab } from './info-navigation';

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
  /** What one press of Space would do at the depot, or null when it would do nothing. */
  surfaceHint: string | null;
  /** Return-fuel forecast for the climb home. */
  fuelReserveStatus: FuelReserveStatus;
  fuelReserveNeeded: number;
  fuelReserveMargin: number;
  /** Next depth landmark: its name, kind, and how much deeper it is. */
  depthTarget: string;
  depthTargetKind: DepthMilestoneKind;
  depthTargetRemaining: number;
  /**
   * The canvas state a sighted player reads off the pixels, as one spoken line.
   * Deliberately built from thresholds only, never from a continuous value: it
   * feeds a live region, so it must change when the ship crosses something and
   * stay put for every frame in between.
   */
  announcement: string;
}

const HUD_KEYS = [
  'cash', 'depthMeters', 'fuel', 'fuelMax', 'hull', 'hullMax', 'cargo', 'cargoMax', 'cargoValue',
  'fuelAlert', 'hullAlert', 'cargoAlert', 'objective', 'extractionHud', 'extractionInfo',
  'atSurface', 'gameOver', 'gunArmed', 'gunOwned', 'bullets', 'dynamite', 'teleporters',
  'teleportReturn', 'teleportDepthReached', 'teleportUsable',
  'scanner', 'surfaceHint', 'fuelReserveStatus', 'fuelReserveNeeded', 'fuelReserveMargin',
  'depthTarget', 'depthTargetKind', 'depthTargetRemaining', 'announcement'
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
 *   intro --(any press)---> playing
 *         --(MP button)---> lobby --(paired)--> playing
 *                                 --(back)----> intro
 *
 * Solo is what a press on the splash does, so there is no mode picker between the
 * two: `lobby` is the relay panel and nothing else. React renders the overlay for
 * the current phase and nothing else, so the splash and the relay panel can never
 * be on screen at the same time, and the game only takes input once the run is live.
 */
export type UiPhase = 'intro' | 'lobby' | 'playing';

/**
 * Whether the simulation behind the canvas is alive.
 *
 *   booting --(runtime constructed)--> ready
 *          --(constructor threw)-----> failed
 *
 * The phase machine above describes a *running* game; this describes whether
 * there is one at all. It exists because the runtime is now mounted by a React
 * effect that can fail (no canvas, no 2D context, a save that will not load), and
 * a silent failure used to leave a dead black rectangle with no explanation.
 */
export type RuntimeStatus = 'booting' | 'ready' | 'failed';

/** The modal overlays that cover the mine. Exactly one of them, or none. */
export type OverlayId = 'shop' | 'info';

/**
 * Which overlay is up. One field rather than a flag per overlay, because
 * "shop and info at the same time" is not a state the game has any answer for:
 * they are both modal `<dialog>`s over the same canvas, so the second one to open
 * would steal focus while the first still claimed the top of the stack.
 */
export type ActiveOverlay = OverlayId | null;

export interface UiState {
  hud: HudSnapshot;
  player: PlayerSnapshot;
  cargoRows: CargoRow[];
  statRows: ExpeditionStatRow[];
  activeOverlay: ActiveOverlay;
  infoTab: InfoTab;
  phase: UiPhase;
  runtimeStatus: RuntimeStatus;
  /** Why the runtime failed, when it did. Shown verbatim in the failure notice. */
  runtimeError: string | null;
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
  /** Show one overlay, replacing whatever was up; `null` closes them all. */
  setActiveOverlay(overlay: ActiveOverlay): void;
  /** Close an overlay, but only while it is the one on screen. */
  closeOverlay(overlay: OverlayId): void;
  setInfoTab(tab: InfoTab): void;
  setPhase(phase: UiPhase): void;
  setRuntimeStatus(status: RuntimeStatus, error?: string | null): void;
  setConnection(status: string, showInHud: boolean): void;
  setMusic(on: boolean, label: string): void;
  setSfx(on: boolean, label: string): void;
  pushToast(message: string): void;
  dismissToast(id: number): void;
  clearToasts(): void;
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
    surfaceHint: formatSurfaceActionHint({
      atSurface: true,
      gameOver: false,
      cargoValue: 0,
      cash: initialState.cash,
      fuel: player.fuel,
      fuelMax: player.fuelMax,
      hull: player.hull,
      hullMax: player.hullMax
    }),
    fuelReserveStatus: 'safe',
    fuelReserveNeeded: 0,
    fuelReserveMargin: Math.floor(player.fuel),
    depthTarget: milestone.target,
    depthTargetKind: milestone.kind,
    depthTargetRemaining: milestone.remainingMeters,
    announcement: formatShipStatusAnnouncement({
      gameOver: false,
      atSurface: true,
      cargoFull: false,
      hullCritical: false
    })
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
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const uiStore = createStore<UiState>((set, get) => ({
  hud: initialHud(),
  player: initialPlayer(),
  cargoRows: [],
  statRows: formatExpeditionStats({}),
  activeOverlay: null,
  infoTab: DEFAULT_INFO_TAB,
  phase: 'intro',
  runtimeStatus: 'booting',
  runtimeError: null,
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

  setActiveOverlay(overlay) {
    if (get().activeOverlay === overlay) return;
    // Info always opens on its first tab, as the imperative version did.
    set(overlay === 'info' ? {activeOverlay: 'info', infoTab: DEFAULT_INFO_TAB} : {activeOverlay: overlay});
  },

  /**
   * Swapping overlays closes the outgoing `<dialog>`, and that close request comes
   * back as a request to clear the state — after the incoming overlay already
   * claimed it. Ignoring a close for an overlay that is no longer up keeps the
   * swap from closing both.
   */
  closeOverlay(overlay) {
    if (get().activeOverlay === overlay) set({activeOverlay: null});
  },

  setInfoTab(tab) {
    if (get().infoTab !== tab) set({infoTab: tab});
  },

  setPhase(phase) {
    if (get().phase !== phase) set({phase});
  },

  setRuntimeStatus(status, error = null) {
    const state = get();
    if (state.runtimeStatus === status && state.runtimeError === error) return;
    set({runtimeStatus: status, runtimeError: error});
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
    toastTimer = setTimeout(() => get().dismissToast(entry.id), TOAST_VISIBLE_MS);
  },

  dismissToast(id) {
    const toasts = get().toasts.filter(toast => toast.id !== id);
    if (toasts.length === get().toasts.length) return;
    clearTimeout(toastTimer);
    toastTimer = undefined;
    set({toasts});
  },

  /**
   * Drop the queue and the pending expiry together. Replacing the state wholesale
   * (`setState`) empties `toasts` but cannot cancel the timer `pushToast` armed,
   * so anything resetting the store goes through here instead.
   */
  clearToasts() {
    clearTimeout(toastTimer);
    toastTimer = undefined;
    if (get().toasts.length > 0) set({toasts: []});
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
