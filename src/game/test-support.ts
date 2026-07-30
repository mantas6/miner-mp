// Test doubles for the game modules.
//
// After the game.ts split every module takes its collaborators as a dependency
// object, so unit tests only need small honest stand-ins for the three awkward
// ones: the relay session, the enemy simulation, and audio. They live here
// instead of in each test file because all of them are wide interfaces whose
// details are irrelevant to any single behaviour under test.

import { vi } from 'vitest';
import type { AudioController, Enemy, Tile } from '../core/types';
import type { NetMessage } from '../net/net-protocol';
import type { EnemySim } from './enemies';
import type { GameInput } from './input';
import type { GameSession } from './session';
import type { WorldGrid } from './world-grid';

/** An in-memory tile grid: no lazy generation, every write recorded. */
export interface FakeGrid extends WorldGrid {
  /** Seed a tile without recording a write. */
  put(x: number, y: number, tile: Tile): void;
  /** Every `set` in order, including the broadcast flag. */
  readonly writes: {x: number; y: number; tile: Tile; broadcast: boolean}[];
}

export function createFakeGrid(fill: (x: number, y: number) => Tile = () => ({type: 'air'})): FakeGrid {
  const tiles = new Map<string, Tile>();
  const writes: FakeGrid['writes'] = [];
  const rows: Tile[][] = [];
  return {
    writes,
    get world() {
      return rows;
    },
    get(x, y) {
      const key = `${x},${y}`;
      const existing = tiles.get(key);
      if (existing) return existing;
      const created = fill(x, y);
      tiles.set(key, created);
      return created;
    },
    set(x, y, tile, broadcast = true) {
      tiles.set(`${x},${y}`, tile);
      writes.push({x, y, tile, broadcast});
    },
    ensureRow() {
      return undefined;
    },
    put(x, y, tile) {
      tiles.set(`${x},${y}`, tile);
    }
  };
}

export interface SessionStubRole {
  paired: boolean;
  /** `isGuestEnemyReplica()`: this client mirrors the host's enemies. */
  guestReplica: boolean;
  /** `isPairedHost()`: this client owns the authoritative simulation. */
  pairedHost: boolean;
}

export interface SessionStub extends GameSession {
  /** Mutable role switches, so one test can change sides mid-scenario. */
  readonly role: SessionStubRole;
  /** Every message handed to `send`, in order. */
  readonly sent: NetMessage[];
}

export function createSessionStub(role: Partial<SessionStubRole> = {}): SessionStub {
  const roleState: SessionStubRole = {paired: false, guestReplica: false, pairedHost: false, ...role};
  const sent: NetMessage[] = [];
  return {
    role: roleState,
    sent,
    get paired() {
      return roleState.paired;
    },
    isGuestEnemyReplica: () => roleState.guestReplica,
    isPairedHost: () => roleState.pairedHost,
    send: message => { sent.push(message); },
    sendPlayerState: vi.fn(),
    sendEnemySnapshot: vi.fn(),
    recordTile: vi.fn(),
    resetTileDiff: vi.fn(),
    broadcastExploration: vi.fn(),
    setConnectionStatus: vi.fn(),
    startOnline: vi.fn(),
    playSolo: vi.fn(),
    resetForPlayerData: vi.fn(),
    requestWorldReset: vi.fn(() => false)
  };
}

export interface EnemySimStub extends EnemySim {
  /** The enemy `enemyAt` reports, if any. */
  standingEnemy: Enemy | undefined;
}

export function createEnemySimStub(): EnemySimStub {
  const stub: EnemySimStub = {
    standingEnemy: undefined,
    enemyAt: () => stub.standingEnemy,
    wakeEnemiesNear: vi.fn(),
    resetExposure: vi.fn(),
    clearExposure: vi.fn(),
    damageEnemy: vi.fn(),
    damageEnemyTile: vi.fn(() => true),
    destroyDormantEnemy: vi.fn(() => true),
    creditBounty: vi.fn(),
    applyEntries: vi.fn(),
    mergeEntries: vi.fn(),
    update: vi.fn(),
    updatePresentation: vi.fn(),
    updateBites: vi.fn()
  };
  return stub;
}

export function createInputStub(): GameInput {
  return {tick: vi.fn(), clearKeys: vi.fn(), reset: vi.fn(), attach: vi.fn()};
}

export interface AudioStub extends AudioController {
  /** Names of the effect methods that fired, in order. */
  readonly played: string[];
}

/** A silent AudioController that only records which cues were requested. */
export function createAudioStub(): AudioStub {
  const played: string[] = [];
  const cue = (name: string) => () => { played.push(name); };
  return {
    played,
    ctx: null,
    enabled: false,
    wantsSound: false,
    master: null,
    musicGain: null,
    musicEl: null,
    musicTimer: null,
    step: 0,
    lastMove: 0,
    lastLowFuel: 0,
    init: cue('init'),
    enable: async () => { played.push('enable'); return true; },
    disable: cue('disable'),
    toggle: async () => { played.push('toggle'); },
    blip: cue('blip'),
    noise: cue('noise'),
    mine: cue('mine'),
    ore: cue('ore'),
    cash: cue('cash'),
    bump: cue('bump'),
    enemyHit: cue('enemyHit'),
    enemyWake: cue('enemyWake'),
    alarm: cue('alarm'),
    lowFuel: cue('lowFuel'),
    startMusic: async () => { played.push('startMusic'); return true; },
    startSynthMusic: cue('startSynthMusic'),
    musicNote: cue('musicNote'),
    stopMusic: cue('stopMusic')
  };
}

/** Collects toast copy so tests can assert on intent without matching prose. */
export function createToastLog() {
  const messages: string[] = [];
  return {
    messages,
    toast: (message: string) => { messages.push(message); },
    /** Whether any toast so far contains this fragment. */
    saw: (fragment: string) => messages.some(message => message.includes(fragment)),
    get last() {
      return messages[messages.length - 1];
    }
  };
}
