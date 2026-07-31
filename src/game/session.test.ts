import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeExploration, explorationIndex } from '../../shared/exploration-codec';
import { createInitialState } from '../core/state';
import type { Enemy, GameState } from '../core/types';
import type { NetCallbacks, NetClient } from '../net/net';
import type { EnemySnapshotEntry, NetMessage } from '../net/net-protocol';
import { uiStore } from '../ui/store';
import { createSession, type GameSession } from './session';
import { createWorldGrid, type WorldGrid } from './world-grid';
import {
  createAudioStub,
  createEnemySimStub,
  createToastLog,
  type AudioStub,
  type EnemySimStub
} from './test-support';

// The session publishes connection copy through the UI store (asserted directly)
// and owns its NetClient outright, so only the socket is replaced here.
const mocks = vi.hoisted(() => ({
  net: {
    callbacks: null as NetCallbacks | null,
    url: '',
    paired: false,
    sent: [] as NetMessage[],
    connectCalls: 0,
    disconnectCalls: 0
  }
}));

vi.mock('../net/net', () => ({
  createNet: (options: {url: string; callbacks: NetCallbacks}): NetClient => {
    mocks.net.callbacks = options.callbacks;
    mocks.net.url = options.url;
    return {
      connect: () => { mocks.net.connectCalls++; },
      disconnect: () => { mocks.net.disconnectCalls++; },
      send: message => { mocks.net.sent.push(message); return true; },
      sendPlayerState: () => true,
      sendEnemySnapshot: () => true,
      url: options.url,
      role: null,
      connected: false,
      get paired() {
        return mocks.net.paired;
      }
    };
  }
}));

interface Harness {
  state: GameState;
  grid: WorldGrid;
  enemies: EnemySimStub;
  audio: AudioStub;
  toasts: ReturnType<typeof createToastLog>;
  session: GameSession;
  saveProgress: ReturnType<typeof vi.fn>;
  clearWorldRuntime: ReturnType<typeof vi.fn>;
  invalidateFogTiles: ReturnType<typeof vi.fn>;
  invalidateTerrain: ReturnType<typeof vi.fn>;
  invalidateFog: ReturnType<typeof vi.fn>;
  startGame: ReturnType<typeof vi.fn>;
  spawnDust: ReturnType<typeof vi.fn>;
  spawnExplosion: ReturnType<typeof vi.fn>;
  /** Deliver a peer message through the real dispatcher. */
  receive(message: NetMessage): void;
}

function harness(): Harness {
  const state = createInitialState();
  const enemies = createEnemySimStub();
  const context = {
    state,
    enemies,
    audio: createAudioStub(),
    toasts: createToastLog(),
    saveProgress: vi.fn(),
    clearWorldRuntime: vi.fn(),
    invalidateFogTiles: vi.fn(),
    invalidateTerrain: vi.fn(),
    invalidateFog: vi.fn(),
    // Stands in for game.ts's startGame, whose job is exactly this transition.
    startGame: vi.fn(() => { uiStore.getState().setPhase('playing'); }),
    spawnDust: vi.fn(),
    spawnExplosion: vi.fn()
  };
  const grid = createWorldGrid({
    state,
    invalidateTerrain: vi.fn(),
    onTileSet: (x, y, tile, broadcast) => session.recordTile(x, y, tile, broadcast)
  });
  const session = createSession({
    state,
    grid,
    audio: context.audio,
    enemies: () => enemies,
    toast: context.toasts.toast,
    saveProgress: context.saveProgress,
    invalidateFogTiles: context.invalidateFogTiles,
    invalidateTerrain: context.invalidateTerrain,
    invalidateFog: context.invalidateFog,
    spawnDust: context.spawnDust,
    spawnExplosion: context.spawnExplosion,
    clearWorldRuntime: context.clearWorldRuntime,
    startGame: context.startGame
  });
  // Every dispatcher test needs a live socket; pairing details are set per test.
  session.startOnline('ws://relay.test');
  mocks.net.callbacks?.onOpen?.();
  return {
    ...context,
    grid,
    session,
    receive: message => mocks.net.callbacks?.onMessage?.(message)
  };
}

/** Become the authoritative host of a live pairing. */
function asPairedHost(h: Harness): void {
  h.state.role = 'host';
  h.state.connected = true;
  mocks.net.paired = true;
}

/** Become the guest that mirrors the host's enemies. */
function asGuest(h: Harness): void {
  h.state.role = 'guest';
  h.state.connected = true;
  mocks.net.paired = true;
}

const enemyEntry = (overrides: Partial<EnemySnapshotEntry> = {}): EnemySnapshotEntry => ({
  id: 5, kind: 'tunnelFiend', x: 6, y: 70, drawX: 6, drawY: 70, hp: 4, maxHp: 4, alive: true, ...overrides
});

const liveEnemy = (overrides: Partial<Enemy> = {}): Enemy => ({
  id: 5, kind: 'tunnelFiend', x: 6, y: 70, drawX: 6, drawY: 70,
  hp: 4, maxHp: 4, alive: true, moveTick: 0, biteTick: 0, flash: 0, ...overrides
});

beforeEach(() => {
  mocks.net.callbacks = null;
  mocks.net.paired = false;
  mocks.net.sent = [];
  mocks.net.connectCalls = 0;
  mocks.net.disconnectCalls = 0;
  vi.clearAllMocks();
  // Every session decision is made from the lobby.
  uiStore.getState().setPhase('lobby');
});

describe('world hydration', () => {
  it('adopts the relay world wholesale and claims an uninitialized one', () => {
    const h = harness();

    h.receive({
      type: 'worldState',
      version: 1,
      revision: 4,
      initialized: false,
      tiles: [{x: 3, y: 40, tile: {type: 'air'}}],
      enemies: [enemyEntry()],
      explored: encodeExploration(new Set([explorationIndex(3, 40)]))
    });

    expect(h.grid.get(3, 40)).toEqual({type: 'air'});
    expect(h.enemies.applyEntries).toHaveBeenCalledWith([enemyEntry()]);
    expect(h.state.exploredTiles.has(explorationIndex(3, 40))).toBe(true);
    expect(h.invalidateTerrain).toHaveBeenCalled();
    expect(h.invalidateFog).toHaveBeenCalled();
    expect(h.saveProgress).toHaveBeenCalled();
    // An empty shared world gets claimed for the locally generated terrain.
    expect(mocks.net.sent).toEqual([{type: 'worldInit', revision: 4, tiles: []}]);
  });

  it('leaves an already initialized world alone', () => {
    const h = harness();

    h.receive({
      type: 'worldState', version: 1, revision: 2, initialized: true,
      tiles: [], enemies: [], explored: ''
    });

    expect(mocks.net.sent).toEqual([]);
  });

  it('rebuilds the local world on a newer reset and ignores a stale one', () => {
    const h = harness();

    h.receive({type: 'worldReset', revision: 5});
    expect(h.clearWorldRuntime).toHaveBeenCalledTimes(1);
    expect(mocks.net.sent).toEqual([{type: 'worldInit', revision: 5, tiles: []}]);
    expect(h.toasts.saw('Shared world reset')).toBe(true);

    h.receive({type: 'worldReset', revision: 5});
    h.receive({type: 'worldReset', revision: 1});
    expect(h.clearWorldRuntime).toHaveBeenCalledTimes(1);
  });
});

describe('peer transforms', () => {
  it('tracks the partner ship, forgets it on death, and replaces it on respawn', () => {
    const h = harness();

    h.receive({
      type: 'playerState', x: 4, y: 9, drawX: 4.5, drawY: 9.5,
      facing: -1, drillAnim: 0, drillDx: 0, drillDy: 1, bob: 0
    });
    expect(h.state.remotePlayers).toHaveLength(1);
    expect(h.state.remotePlayers[0]).toMatchObject({x: 4, y: 9, facing: -1});

    h.receive({type: 'died'});
    expect(h.state.remotePlayers).toEqual([]);

    h.receive({type: 'respawned', x: 45, y: 2});
    expect(h.state.remotePlayers).toHaveLength(1);
    expect(h.state.remotePlayers[0]).toMatchObject({x: 45, y: 2, drawX: 45, drawY: 2});

    h.receive({type: 'teleported', x: 7, y: 300});
    expect(h.state.remotePlayers[0]).toMatchObject({x: 7, y: 300});
  });
});

describe('terrain and exploration replication', () => {
  it('applies a peer tile without echoing it back', () => {
    const h = harness();
    asPairedHost(h);

    h.receive({type: 'tile', revision: 1, x: 5, y: 41, tile: {type: 'air'}});

    expect(h.grid.get(5, 41)).toEqual({type: 'air'});
    expect(mocks.net.sent).toEqual([]);
  });

  it('merges new exploration, repaints its fog, and saves', () => {
    const h = harness();
    const index = explorationIndex(8, 44);

    h.receive({type: 'explore', revision: 1, ranges: encodeExploration(new Set([index]))});

    expect(h.state.exploredTiles.has(index)).toBe(true);
    expect(h.invalidateFogTiles).toHaveBeenCalledWith([index]);
    expect(h.saveProgress).toHaveBeenCalled();
  });

  it('ignores exploration it already had', () => {
    const h = harness();
    const ranges = encodeExploration(new Set([explorationIndex(8, 44)]));

    h.receive({type: 'explore', revision: 1, ranges});
    h.invalidateFogTiles.mockClear();
    h.receive({type: 'explore', revision: 1, ranges});

    expect(h.invalidateFogTiles).not.toHaveBeenCalled();
  });

  it('relays exploration onward to the other peer as the host', () => {
    const h = harness();
    asPairedHost(h);

    h.receive({type: 'explore', revision: 1, ranges: encodeExploration(new Set([explorationIndex(9, 44)]))});

    expect(mocks.net.sent).toEqual([
      expect.objectContaining({type: 'explore', revision: 1})
    ]);
  });
});

describe('enemy replication as a guest', () => {
  it('merges the host snapshot', () => {
    const h = harness();
    asGuest(h);

    h.receive({type: 'enemySnapshot', revision: 1, enemies: [enemyEntry()]});

    expect(h.enemies.mergeEntries).toHaveBeenCalledWith([enemyEntry()]);
  });

  it('spawns and buries an enemy with local feedback', () => {
    const h = harness();
    asGuest(h);

    h.receive({type: 'enemySpawn', id: 9, kind: 'ironback', x: 3, y: 90, hp: 6, maxHp: 6});
    expect(h.enemies.applyEntries).toHaveBeenCalled();
    expect(h.spawnDust).toHaveBeenCalledWith(3, 90, expect.any(String), 18);
    expect(h.audio.played).toContain('enemyWake');

    h.state.enemies = [liveEnemy({id: 9, x: 3, y: 90})];
    h.receive({type: 'enemyDead', id: 9, bounty: 20, killerIsGuest: false});
    expect(h.spawnExplosion).toHaveBeenCalledWith(3, 90);
  });

  it('banks a bounty the host awarded it', () => {
    const h = harness();
    asGuest(h);

    h.receive({type: 'bounty', amount: 32});

    expect(h.enemies.creditBounty).toHaveBeenCalledWith(32);
  });

  it('ignores host-only messages', () => {
    const h = harness();
    asGuest(h);
    h.state.enemies = [liveEnemy()];

    h.receive({type: 'enemyDamage', id: 5, amount: 3, by: 'guest'});
    h.receive({type: 'enemyTileShot', x: 5, y: 60, by: 'guest'});
    h.receive({type: 'wakeNear', x: 5, y: 60});

    expect(h.enemies.damageEnemy).not.toHaveBeenCalled();
    expect(h.enemies.destroyDormantEnemy).not.toHaveBeenCalled();
    expect(h.enemies.wakeEnemiesNear).not.toHaveBeenCalled();
  });
});

describe('authoritative simulation as the host', () => {
  it('applies a guest hit, shot, and wake request', () => {
    const h = harness();
    asPairedHost(h);
    const enemy = liveEnemy();
    h.state.enemies = [enemy];

    h.receive({type: 'enemyDamage', id: 5, amount: 3, by: 'guest'});
    h.receive({type: 'enemyTileShot', x: 5, y: 60, by: 'guest'});
    h.receive({type: 'wakeNear', x: 5, y: 60});

    expect(h.enemies.damageEnemy).toHaveBeenCalledWith(enemy, 3, 'guest');
    expect(h.enemies.destroyDormantEnemy).toHaveBeenCalledWith(5, 60, 'guest');
    expect(h.enemies.wakeEnemiesNear).toHaveBeenCalledWith(5, 60);
  });

  it('never trusts a hit attributed to itself or a zero-damage hit', () => {
    const h = harness();
    asPairedHost(h);
    h.state.enemies = [liveEnemy()];

    h.receive({type: 'enemyDamage', id: 5, amount: 3, by: 'host'});
    h.receive({type: 'enemyDamage', id: 5, amount: 0, by: 'guest'});

    expect(h.enemies.damageEnemy).not.toHaveBeenCalled();
  });

  it('does not replicate its own snapshots back into itself', () => {
    const h = harness();
    asPairedHost(h);

    h.receive({type: 'enemySnapshot', revision: 1, enemies: [enemyEntry()]});
    h.receive({type: 'enemySpawn', id: 9, kind: 'ironback', x: 3, y: 90, hp: 6, maxHp: 6});
    h.receive({type: 'enemyDead', id: 9, bounty: 20, killerIsGuest: true});
    h.receive({type: 'bounty', amount: 32});

    expect(h.enemies.mergeEntries).not.toHaveBeenCalled();
    expect(h.enemies.applyEntries).not.toHaveBeenCalled();
    expect(h.enemies.creditBounty).not.toHaveBeenCalled();
  });
});

describe('dispatcher robustness', () => {
  it('ignores its own outbound-only world claim and any unknown message', () => {
    const h = harness();

    h.receive({type: 'worldInit', revision: 1, tiles: []});
    // A relay running ahead of this client may forward a message it has never
    // heard of; routing must not throw.
    h.receive({type: 'somethingNew', value: 1} as unknown as NetMessage);

    expect(h.clearWorldRuntime).not.toHaveBeenCalled();
    expect(h.toasts.messages).toEqual([]);
    expect(mocks.net.sent).toEqual([]);
  });
});

describe('session lifecycle', () => {
  it('keeps the host waiting in the lobby until its partner joins', () => {
    const h = harness();

    mocks.net.callbacks?.onPaired?.('host');
    expect(uiStore.getState().connectionStatus).toContain('waiting for player');
    expect(h.startGame).not.toHaveBeenCalled();
    expect(uiStore.getState().phase).toBe('lobby');

    mocks.net.paired = true;
    mocks.net.callbacks?.onPeerJoined?.();
    expect(h.startGame).toHaveBeenCalled();
    expect(uiStore.getState().phase).toBe('playing');
  });

  it('auto-starts the guest the moment the relay pairs it', () => {
    const h = harness();
    mocks.net.paired = true;

    mocks.net.callbacks?.onPaired?.('guest');

    expect(uiStore.getState().connectionStatus).toContain('Guest');
    expect(h.startGame).toHaveBeenCalled();
    expect(uiStore.getState().phase).toBe('playing');
  });

  it('promotes the remaining guest to host when its peer leaves', () => {
    const h = harness();
    mocks.net.callbacks?.onPaired?.('guest');
    expect(h.state.role).toBe('guest');

    mocks.net.callbacks?.onPeerLeft?.();

    expect(h.state.role).toBe('host');
    expect(h.state.remotePlayers).toEqual([]);
    expect(uiStore.getState().connectionStatus).toContain('Host');
  });

  it('keeps the room-full reason visible after the socket closes', () => {
    const h = harness();

    mocks.net.callbacks?.onRoomFull?.();
    mocks.net.callbacks?.onClose?.();

    expect(uiStore.getState().connectionStatus).toBe('Room full');
    expect(h.state.connected).toBe(false);
    expect(h.state.role).toBe(null);
  });

  it('drops the socket, reports solo play, and starts the run', () => {
    const h = harness();
    asPairedHost(h);

    h.session.playSolo();

    expect(mocks.net.disconnectCalls).toBe(1);
    expect(h.state).toMatchObject({connected: false, role: null, remotePlayers: []});
    expect(uiStore.getState().connectionStatus).toBe('Solo');
    expect(h.startGame).toHaveBeenCalled();
    expect(uiStore.getState().phase).toBe('playing');
  });

  it('asks the relay for a world reset only while connected', () => {
    const h = harness();

    expect(h.session.requestWorldReset()).toBe(true);
    expect(mocks.net.sent).toEqual([{type: 'worldReset', revision: 1}]);

    mocks.net.callbacks?.onClose?.();
    expect(h.session.requestWorldReset()).toBe(false);
    expect(mocks.net.sent).toHaveLength(1);
  });
});
