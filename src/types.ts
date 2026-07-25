export interface Ore {
  name: string;
  color: string;
  value: number;
  min: number;
  max: number;
  chance: number;
}

export interface Artifact {
  name: string;
  color: string;
  value: number;
  min: number;
  max: number;
  chance: number;
}

export type Direction = [number, number];

export interface AirTile {
  type: 'air';
}

export interface DirtTile {
  type: 'dirt';
  hp: number;
  maxHp: number;
}

export interface RockTile {
  type: 'rock';
  hp: number;
}

export interface OreTile {
  type: 'ore';
  ore: Ore;
  hp: number;
  maxHp: number;
}

export interface HazardTile {
  type: 'hazard';
  hp: number;
  maxHp: number;
}

export interface ArtifactTile {
  type: 'artifact';
  artifact: Artifact;
  hp: number;
  maxHp: number;
}

export interface MotherlodeTile {
  type: 'motherlode';
  hp: number;
  maxHp: number;
}

export interface DormantEnemyTile {
  type: 'enemy';
  hp: number;
  maxHp: number;
}

export type Tile = AirTile | DirtTile | RockTile | OreTile | HazardTile | ArtifactTile | MotherlodeTile | DormantEnemyTile;

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
  cargo: any[];
}

export interface Enemy {
  id: number;
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
  lastKeyboardMove: number;
  keyboardRepeatMs: number;
  touchHoldDir: Direction | null;
  lastTouchMove: number;
  touchRepeatMs: number;
}

export interface GameState {
  world: Tile[][];
  cash: number;
  tick: number;
  gameOver: boolean;
  introStarted: boolean;
  camX: number;
  camY: number;
  particles: Particle[];
  enemies: Enemy[];
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
}

export interface AudioController {
  ctx: AudioContext | null;
  enabled: boolean;
  wantsSound: boolean;
  master: GainNode | null;
  musicGain: GainNode | null;
  musicEl: HTMLAudioElement | null;
  musicTimer: number | null;
  step: number;
  lastMove: number;
  lastLowFuel: number;
  init(): void;
  enable(): Promise<boolean>;
  disable(): void;
  toggle(): Promise<void>;
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
  startMusic(): Promise<boolean>;
  startSynthMusic(): void;
  musicNote(freq: number, dur: number, type: OscillatorType, gain: number, start: number): void;
  stopMusic(): void;
}

export interface Renderer {
  draw(): void;
}
