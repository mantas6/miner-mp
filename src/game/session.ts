// Multiplayer session lifecycle for the client.
//
// Owns the `NetClient`, the connection-status copy, the shared world's revision,
// and the accumulated tile diff — everything whose lifetime is "one relay
// session" rather than "one run". Incoming peer messages are dispatched by a
// single exhaustive switch so that adding a protocol message fails to compile
// until it is handled here.

import { encodeExploration, mergeExploration } from '../../shared/exploration-codec';
import { getEnemyType } from '../core/enemy-types';
import type { AudioController, GameState } from '../core/types';
import { createNet, type NetClient } from '../net/net';
import {
  applyEnemyDead,
  applyEnemySpawn,
  applyRemotePlayerState,
  applyTileDiff,
  enemyEntryFrom,
  enemySnapshotFrom,
  nextEnemyId,
  playerStateFrom,
  remotePlayerFrom,
  type NetMessage,
  type TileDiff,
  type WorldStateMsg
} from '../net/net-protocol';
import type { Tile } from '../core/types';
import { uiStore } from '../ui/store';
import type { EnemySim } from './enemies';
import type { WorldGrid } from './world-grid';

export interface GameSession {
  /** Whether the relay has paired this client with a peer. */
  readonly paired: boolean;
  /** Guests replicate the host's enemies instead of simulating their own. */
  isGuestEnemyReplica(): boolean;
  /** Whether this client is the authoritative host of a live pairing. */
  isPairedHost(): boolean;
  /** Send a message if a socket exists. Callers apply their own role guards. */
  send(msg: NetMessage): void;
  /** Send the local ship transform, throttled by the net layer. */
  sendPlayerState(): void;
  /** Send the host's authoritative enemy list, throttled by the net layer. */
  sendEnemySnapshot(): void;
  /** Record a committed tile mutation in the diff and replicate it. */
  recordTile(x: number, y: number, tile: Tile, broadcast: boolean): void;
  /** Drop the accumulated tile diff (world regenerated or replaced). */
  resetTileDiff(): void;
  /** Replicate the full exploration set to the peer, if paired. */
  broadcastExploration(): void;
  setConnectionStatus(status: string, showInHud?: boolean): void;
  /** Connect to a relay and start (or join) a shared world. */
  startOnline(url: string): void;
  /** Leave any session and play offline. */
  playSolo(event?: Event): void;
  /** Tear the session down for a player-data reset (suppresses reconnect glue). */
  resetForPlayerData(): void;
  /** Ask the relay to reset the shared world. False when offline. */
  requestWorldReset(): boolean;
}

export interface GameSessionDeps {
  state: GameState;
  grid: WorldGrid;
  audio: AudioController;
  /**
   * Resolved lazily: the enemy simulation needs the session, so the session can
   * only reach it once both exist.
   */
  enemies(): EnemySim;
  toast(message: string): void;
  saveProgress(): void;
  /** Mark the fog chunks containing these row-major tile indexes dirty. */
  invalidateFogTiles(indexes: number[]): void;
  /** Drop the whole terrain cache (world replaced wholesale). */
  invalidateTerrain(): void;
  /** Drop the whole fog cache (exploration replaced wholesale). */
  invalidateFog(): void;
  spawnDust(x: number, y: number, color?: string, amount?: number): void;
  spawnExplosion(x: number, y: number): void;
  /** Reset local world runtime state after the shared world was reset. */
  clearWorldRuntime(): void;
  /** Reveal the intro and begin the run. */
  startIntro(event?: Event): void;
}

export function createSession(deps: GameSessionDeps): GameSession {
  const {state, grid, audio, toast, saveProgress, invalidateFogTiles, spawnDust, spawnExplosion} = deps;

  let net: NetClient | null = null;
  let connectionIssue: string | null = null;
  let resettingPlayerData = false;
  let worldRevision = 1;
  let tileDiff: TileDiff = {};

  function isGuestEnemyReplica(): boolean {
    return state.role === 'guest';
  }

  function isPairedHost(): boolean {
    return state.role === 'host' && state.connected && Boolean(net?.paired);
  }

  function send(msg: NetMessage): void {
    net?.send(msg);
  }

  function setConnectionStatus(status: string, showInHud = true): void {
    uiStore.getState().setConnection(status, showInHud);
  }

  function recordTile(x: number, y: number, tile: Tile, broadcast: boolean): void {
    // Guests retain received/local mutations too: they may become the next host.
    if (state.role) tileDiff = applyTileDiff(tileDiff, {x, y, tile});
    if (broadcast && state.connected && net?.paired) net.send({type: 'tile', revision: worldRevision, x, y, tile});
  }

  function broadcastExploration(): void {
    if (state.connected && net?.paired) {
      net.send({type: 'explore', revision: worldRevision, ranges: encodeExploration(state.exploredTiles)});
    }
  }

  /** Claim the empty shared world for this client's freshly generated terrain. */
  function initializeServerWorld(): void {
    net?.send({type: 'worldInit', revision: worldRevision, tiles: []});
  }

  /** Adopt the relay's world wholesale: terrain, enemies, and exploration. */
  function applyAuthoritativeWorld(msg: WorldStateMsg): void {
    worldRevision = msg.revision;
    state.world = [];
    tileDiff = {};
    for (const entry of msg.tiles) {
      const row = grid.ensureRow(entry.y);
      if (row) row[entry.x] = entry.tile;
    }
    deps.enemies().applyEntries(msg.enemies);
    state.enemyIdCounter = nextEnemyId(state.enemies);
    state.exploredTiles.clear();
    mergeExploration(state.exploredTiles, msg.explored);
    deps.enemies().clearExposure();
    deps.invalidateTerrain();
    deps.invalidateFog();
    saveProgress();
    if (!msg.initialized) initializeServerWorld();
  }

  function startOnlineGame(): void {
    if (!net?.paired) return;
    uiStore.getState().setLobbyVisible(false);
    deps.startIntro();
  }

  function handleMessage(msg: NetMessage): void {
    switch (msg.type) {
      case 'worldState':
        applyAuthoritativeWorld(msg);
        return;
      case 'worldReset':
        if (msg.revision <= worldRevision) return;
        worldRevision = msg.revision;
        deps.clearWorldRuntime();
        saveProgress();
        initializeServerWorld();
        toast('Shared world reset. Player progress preserved.');
        return;
      case 'playerState':
        state.remotePlayers = applyRemotePlayerState(state.remotePlayers, msg);
        return;
      case 'tile':
        grid.set(msg.x, msg.y, msg.tile, false);
        return;
      case 'explore': {
        const added = mergeExploration(state.exploredTiles, msg.ranges);
        if (added.length) {
          invalidateFogTiles(added);
          saveProgress();
          if (isPairedHost()) broadcastExploration();
        }
        return;
      }
      case 'enemySnapshot':
        if (isGuestEnemyReplica()) deps.enemies().mergeEntries(msg.enemies);
        return;
      case 'enemySpawn':
        if (isGuestEnemyReplica()) {
          deps.enemies().applyEntries(applyEnemySpawn(state.enemies.map(enemyEntryFrom), msg));
          spawnDust(msg.x, msg.y, getEnemyType(msg.kind).glow, 18);
          audio.enemyWake();
        }
        return;
      case 'enemyDead':
        if (isGuestEnemyReplica()) {
          const enemy = state.enemies.find(e => e.id === msg.id);
          deps.enemies().applyEntries(applyEnemyDead(state.enemies.map(enemyEntryFrom), msg));
          if (enemy) spawnExplosion(enemy.x, enemy.y);
        }
        return;
      case 'enemyDamage':
        if (isPairedHost() && msg.by === 'guest' && msg.amount > 0) {
          deps.enemies().damageEnemy(state.enemies.find(e => e.id === msg.id), msg.amount, 'guest');
        }
        return;
      case 'enemyTileShot':
        if (isPairedHost() && msg.by === 'guest') deps.enemies().destroyDormantEnemy(msg.x, msg.y, 'guest');
        return;
      case 'wakeNear':
        if (isPairedHost()) deps.enemies().wakeEnemiesNear(msg.x, msg.y);
        return;
      case 'bounty':
        if (isGuestEnemyReplica()) deps.enemies().creditBounty(msg.amount);
        return;
      case 'died':
        state.remotePlayers = [];
        return;
      case 'respawned':
      case 'teleported':
        state.remotePlayers = [remotePlayerFrom({
          type: 'playerState', x: msg.x, y: msg.y, drawX: msg.x, drawY: msg.y,
          facing: 1, drillAnim: 0, drillDx: 0, drillDy: 1, bob: 0
        })];
        return;
      case 'worldInit':
        // Outbound only: the relay never forwards a peer's world claim.
        return;
      default: {
        const unhandled: never = msg;
        void unhandled;
      }
    }
  }

  function startOnline(url: string): void {
    net?.disconnect();
    state.remotePlayers = [];
    state.role = null;
    state.connected = false;
    connectionIssue = null;
    setConnectionStatus('Connecting...');
    net = createNet({
      url,
      callbacks: {
        onOpen(){
          state.connected = true;
          setConnectionStatus('Connected - pairing...');
        },
        onPaired(role){
          state.role = role;
          deps.enemies().resetExposure();
          if (role === 'host') {
            setConnectionStatus('Host - waiting for player');
            return;
          }
          setConnectionStatus('Guest - paired');
          startOnlineGame();
        },
        onPeerJoined(){
          if (state.role !== 'host') return;
          setConnectionStatus('Host - paired');
          startOnlineGame();
        },
        onPeerLeft(){
          state.remotePlayers = [];
          if (state.role === 'guest') {
            state.role = 'host';
            state.enemyIdCounter = nextEnemyId(state.enemies);
            deps.enemies().resetExposure();
            setConnectionStatus('Host - waiting for player');
            return;
          }
          setConnectionStatus('Peer left');
        },
        onRoomFull(){
          connectionIssue = 'Room full';
          setConnectionStatus(connectionIssue);
        },
        onMessage: handleMessage,
        onError(){
          connectionIssue = 'Connection error';
          setConnectionStatus(connectionIssue);
        },
        onClose(){
          state.connected = false;
          state.role = null;
          state.remotePlayers = [];
          state.enemyIdCounter = nextEnemyId(state.enemies);
          if (!resettingPlayerData) deps.enemies().resetExposure();
          setConnectionStatus(connectionIssue || 'Disconnected');
        }
      }
    });
    net.connect();
  }

  function playSolo(event?: Event): void {
    net?.disconnect();
    net = null;
    state.connected = false;
    state.role = null;
    state.remotePlayers = [];
    connectionIssue = null;
    setConnectionStatus('Solo');
    uiStore.getState().setLobbyVisible(false);
    deps.startIntro(event);
  }

  function resetForPlayerData(): void {
    resettingPlayerData = true;
    net?.disconnect();
    resettingPlayerData = false;
    net = null;
  }

  function requestWorldReset(): boolean {
    if (!state.connected || !net) return false;
    net.send({type: 'worldReset', revision: worldRevision});
    return true;
  }

  return {
    get paired() {
      return Boolean(net?.paired);
    },
    isGuestEnemyReplica,
    isPairedHost,
    send,
    sendPlayerState: () => { net?.sendPlayerState(playerStateFrom(state.player)); },
    sendEnemySnapshot: () => { net?.sendEnemySnapshot(enemySnapshotFrom(state.enemies, worldRevision)); },
    recordTile,
    resetTileDiff: () => { tileDiff = {}; },
    broadcastExploration,
    setConnectionStatus,
    startOnline,
    playSolo,
    resetForPlayerData,
    requestWorldReset
  };
}
