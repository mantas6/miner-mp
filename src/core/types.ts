// The world's data shapes are defined once, as zod schemas, in
// `shared/world-schema.ts` — the relay validates against the same definitions.
import type { EnemyKind, Ore, Tile } from '../../shared/world-schema';
// Type-only: the track registry never becomes a runtime dependency of this module.
import type { TrackId } from '../audio/tracks';

export type {
  AirTile,
  Artifact,
  ArtifactTile,
  DirtTile,
  DormantEnemyTile,
  EnemyKind,
  HazardTile,
  MotherlodeTile,
  Ore,
  OreTile,
  RockTile,
  Tile
} from '../../shared/world-schema';

export type Direction = [number, number];

export interface Player {
  x: number;
  y: number;
  drawX: number;
  drawY: number;
  facing: number;
  bob: number;
  drillAnim: number;
  drillDx: number;
  drillDy: number;
  fuel: number;
  fuelMax: number;
  hull: number;
  hullMax: number;
  cargoMax: number;
  drill: number;
  dynamite: number;
  teleporters: number;
  gunOwned: boolean;
  bullets: number;
  visibility: number;
  /** Mined ore awaiting sale at the depot; artifacts are banked instead. */
  cargo: Ore[];
}

/** The transform fields shared by the local ship, its replicas, and renderers. */
export type ShipTransform = Pick<
  Player,
  'x' | 'y' | 'drawX' | 'drawY' | 'facing' | 'bob' | 'drillAnim' | 'drillDx' | 'drillDy'
>;

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  drawX: number;
  drawY: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  moveTick: number;
  biteTick: number;
  flash: number;
}

/** A partner ship as seen locally: transform data only (no vitals). */
export interface RemotePlayer {
  x: number;
  y: number;
  drawX: number;
  drawY: number;
  /** Latest remote render target; drawX/drawY ease toward these values locally. */
  targetDrawX?: number;
  targetDrawY?: number;
  facing: number;
  drillAnim: number;
  drillDx: number;
  drillDy: number;
  bob: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export interface TeleportEffect {
  originScreenX: number;
  originScreenY: number;
  destinationX: number;
  destinationY: number;
  frame: number;
  duration: number;
  reducedMotion: boolean;
}

export interface TeleportReturnPosition {
  x: number;
  y: number;
}

export interface GameStats {
  maxDepth: number;
  totalCashEarned: number;
  oreMined: number;
  artifactsFound: number;
  enemiesDestroyed: number;
  deaths: number;
  motherlodeClaims: number;
  motherlodeExtractions: number;
}

export interface InputState {
  keyImpulse: Direction | null;
  /** Current keyboard sprint through open air; null while drilling, blocked, or idle. */
  sprintDirection: Direction | null;
  lastKeyboardMove: number;
  keyboardRepeatMs: number;
  gunArmed: boolean;
  /** Deadline (performance clock) until which a second R press confirms a reset. */
  resetConfirmUntil: number;
}

export interface GameState {
  world: Tile[][];
  cash: number;
  tick: number;
  gameOver: boolean;
  camX: number;
  camY: number;
  particles: Particle[];
  enemies: Enemy[];
  /** Next id handed to an awakened enemy; re-seeded when adopting a peer's list. */
  enemyIdCounter: number;
  input: InputState;
  player: Player;
  stats: GameStats;
  extractionPhase: import('./extraction-phase').ExtractionPhase;
  /** Current multiplayer role; `null` when no relay session is connected. */
  role: 'host' | 'guest' | null;
  /** Whether the relay socket is currently connected. */
  connected: boolean;
  /** Partner ships (transform-only). For 2-player co-op this holds 0 or 1. */
  remotePlayers: RemotePlayer[];
  teleportEffect: TeleportEffect | null;
  teleportReturnPosition: TeleportReturnPosition | null;
  reducedMotion: boolean;
  /** Explored underground cells as row-major indexes; surface rows are implicitly visible. */
  exploredTiles: Set<number>;
}

export interface AudioController {
  ctx: AudioContext | null;
  /** The shared context is unlocked and running; a gesture already paid for it. */
  enabled: boolean;
  /** Soundtrack preference, remembered between visits. */
  musicEnabled: boolean;
  /** Sound-effect preference, remembered between visits. */
  sfxEnabled: boolean;
  /** Either switch is on, so a trusted gesture is worth spending on an unlock. */
  readonly wantsSound: boolean;
  master: GainNode | null;
  musicGain: GainNode | null;
  musicEl: HTMLAudioElement | null;
  musicTimer: number | null;
  step: number;
  /** Track the soundtrack element is pointed at. */
  currentTrackId: TrackId;
  lastMove: number;
  lastLowFuel: number;
  init(): void;
  /** Unlock the context and resume whatever the player left switched on. */
  enable(): Promise<boolean>;
  toggleMusic(): Promise<void>;
  toggleSfx(): Promise<void>;
  blip(freq?: number, dur?: number, type?: OscillatorType, gain?: number, slide?: number): void;
  noise(dur?: number, gain?: number, filterFreq?: number): void;
  mine(): void;
  ore(value?: number): void;
  cash(value?: number): void;
  bump(): void;
  enemyHit(): void;
  enemyWake(): void;
  alarm(): void;
  lowFuel(): void;
  /** True when the shipped audio played; false when the synth fallback took over. */
  startMusic(): Promise<boolean>;
  startSynthMusic(): void;
  musicNote(freq: number, dur: number, type: OscillatorType, gain: number, start: number): void;
  stopMusic(): void;
  /** Point the soundtrack at another shipped track, keeping playback state. */
  setTrack(trackId: TrackId): void;
}
