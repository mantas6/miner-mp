// WebSocket net layer for co-op multiplayer.
//
// Owns the socket lifecycle, tracks role/connection state, wraps outgoing game
// messages in the relay envelope (`{ t: 'relay', payload }`), and dispatches
// incoming messages via callbacks. Send throttling is provided for the two
// high-frequency streams (playerState ~20 Hz, enemySnapshot ~15 Hz).
//
// The socket is a partysocket ReconnectingWebSocket: a dropped connection is
// retried with backoff instead of ending the session. The relay needs no join
// handshake — it replies to every accepted connection with `worldState` followed
// by `paired` — so reconnecting re-hydrates the world through the normal path.

import ReconnectingWebSocket from 'partysocket/ws';
import {
  createRateLimiter,
  validateMessage,
  type NetMessage,
  type PlayerStateMsg,
  type EnemySnapshotMsg
} from './net-protocol';

export type Role = 'host' | 'guest';

/** Default relay URL, from Vite env or a localhost fallback. */
export const DEFAULT_SERVER_URL =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MP_SERVER_URL) ||
  'ws://localhost:8081';

/** Broadcast rates (Hz). */
export const RATES = Object.freeze({
  playerState: 20,
  enemySnapshot: 15
});

/** Reconnect backoff: 0.5 s, growing 1.5x per attempt, capped at 10 s. */
export const RECONNECT = Object.freeze({
  minDelayMs: 500,
  maxDelayMs: 10_000,
  growthFactor: 1.5
});

export interface NetCallbacks {
  /** Paired into the room with the given role. */
  onPaired?(role: Role): void;
  /** The other peer joined (host only). */
  onPeerJoined?(): void;
  /** The other peer left. */
  onPeerLeft?(): void;
  /** The room was full; this client was rejected. */
  onRoomFull?(): void;
  /** A validated peer game message arrived. */
  onMessage?(msg: NetMessage): void;
  /** The socket opened. */
  onOpen?(): void;
  /** The socket closed (clean or otherwise). */
  onClose?(): void;
  /** A socket error occurred. */
  onError?(err: unknown): void;
}

export interface NetOptions {
  url?: string;
  callbacks?: NetCallbacks;
  /** Injectable WebSocket implementation (defaults to the global) for testing. */
  WebSocketImpl?: typeof WebSocket;
  /** Injectable clock (ms) for throttling; defaults to `Date.now`. */
  now?: () => number;
}

export interface NetClient {
  /** Open the session. Reconnects automatically until `disconnect` is called. */
  connect(): void;
  disconnect(): void;
  /** Send a game message immediately, wrapped in the relay envelope. */
  send(msg: NetMessage): boolean;
  /** Send a playerState, throttled to ~20 Hz. Returns whether it was sent. */
  sendPlayerState(msg: PlayerStateMsg): boolean;
  /** Send an enemySnapshot, throttled to ~15 Hz. Returns whether it was sent. */
  sendEnemySnapshot(msg: EnemySnapshotMsg): boolean;
  readonly url: string;
  readonly role: Role | null;
  readonly connected: boolean;
  readonly paired: boolean;
}

interface ServerEnvelope {
  t: string;
  role?: string;
  payload?: unknown;
}

export function createNet(options: NetOptions = {}): NetClient {
  const url = options.url || DEFAULT_SERVER_URL;
  const cb = options.callbacks || {};
  // A non-browser host (a plain Node test runner) may have no WebSocket at all,
  // which the DOM lib's type does not admit — hence the runtime guard below.
  const WS: typeof WebSocket | undefined = options.WebSocketImpl || globalThis.WebSocket;
  const now = options.now || (() => Date.now());

  const playerStateGate = createRateLimiter(RATES.playerState);
  const enemySnapshotGate = createRateLimiter(RATES.enemySnapshot);

  let ws: ReconnectingWebSocket | null = null;
  let role: Role | null = null;
  let connected = false;
  let paired = false;

  function handleServerMessage(raw: string): void {
    let env: ServerEnvelope | null = null;
    try {
      env = JSON.parse(raw) as ServerEnvelope;
    } catch {
      return;
    }
    if (!env || typeof env.t !== 'string') return;

    switch (env.t) {
      case 'paired':
        role = env.role === 'guest' ? 'guest' : 'host';
        paired = true;
        cb.onPaired?.(role);
        break;
      case 'peer-joined':
        paired = true;
        cb.onPeerJoined?.();
        break;
      case 'peer-left':
        paired = false;
        // The relay moves the remaining guest into its host slot before a
        // future connection is paired, so mirror that role transition locally.
        if (role === 'guest') role = 'host';
        cb.onPeerLeft?.();
        break;
      case 'room-full':
        cb.onRoomFull?.();
        // The room rejected us; retrying would only be rejected again.
        ws?.close(1000, 'room full');
        break;
      case 'relay': {
        const msg = validateMessage(env.payload);
        if (msg) cb.onMessage?.(msg);
        break;
      }
      default:
        break;
    }
  }

  function connect(): void {
    if (ws) return;
    if (!WS) {
      cb.onError?.(new Error('No WebSocket implementation available'));
      return;
    }
    let socket: ReconnectingWebSocket;
    try {
      socket = new ReconnectingWebSocket(url, undefined, {
        WebSocket: WS,
        minReconnectionDelay: RECONNECT.minDelayMs,
        maxReconnectionDelay: RECONNECT.maxDelayMs,
        reconnectionDelayGrowFactor: RECONNECT.growthFactor,
        // Never buffer game messages across a gap: `send` already refuses while
        // the socket is down, and replaying stale transforms would be worse.
        maxEnqueuedMessages: 0
      });
    } catch (err) {
      cb.onError?.(err);
      return;
    }
    ws = socket;

    socket.onopen = () => {
      connected = true;
      cb.onOpen?.();
    };
    socket.onmessage = (ev: MessageEvent) => {
      handleServerMessage(typeof ev.data === 'string' ? ev.data : String(ev.data));
    };
    socket.onerror = (ev: unknown) => {
      cb.onError?.(ev);
    };
    socket.onclose = () => {
      connected = false;
      paired = false;
      role = null;
      // Keep the handle while a retry is pending so `connect` stays idempotent.
      if (!socket.shouldReconnect) ws = null;
      cb.onClose?.();
    };
  }

  function disconnect(): void {
    const socket = ws;
    if (!socket) return;
    // Detach handlers so the caller-facing onClose fires exactly once, then close.
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      socket.close();
    } catch {
      // Ignore: closing an already-closing socket is harmless.
    }
    ws = null;
    connected = false;
    paired = false;
    role = null;
    cb.onClose?.();
  }

  function send(msg: NetMessage): boolean {
    if (!ws || ws.readyState !== ws.OPEN) return false;
    ws.send(JSON.stringify({ t: 'relay', payload: msg }));
    return true;
  }

  function sendPlayerState(msg: PlayerStateMsg): boolean {
    if (!playerStateGate(now())) return false;
    return send(msg);
  }

  function sendEnemySnapshot(msg: EnemySnapshotMsg): boolean {
    if (!enemySnapshotGate(now())) return false;
    return send(msg);
  }

  return {
    connect,
    disconnect,
    send,
    sendPlayerState,
    sendEnemySnapshot,
    get url() {
      return url;
    },
    get role() {
      return role;
    },
    get connected() {
      return connected;
    },
    get paired() {
      return paired;
    }
  };
}
