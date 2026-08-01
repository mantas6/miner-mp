import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { MAX_STATE_BYTES } from '../shared/constants.ts';
import { parseRelayEnvelope } from '../shared/protocol.ts';
import { createWorldStore } from './world-state.js';

const DEFAULT_STATE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'world-state.json');

/** Interval between keepalive pings; a peer is dropped after this many misses. */
export const HEARTBEAT_MS = 30_000;
export const MAX_MISSED_PINGS = 2;
/** Per-connection flood guard. Normal play peaks well under this. */
export const MAX_MESSAGES_PER_SECOND = 200;

export function createRelayServer({
  port = 0,
  statePath = process.env.WORLD_STATE_PATH || DEFAULT_STATE_PATH,
  heartbeatMs = HEARTBEAT_MS,
  maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND
} = {}) {
  const store = createWorldStore(statePath);
  const wss = new WebSocketServer({ port, maxPayload: MAX_STATE_BYTES });
  const slots = [null, null];

  function send(ws, obj) {
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  }
  function payload(ws, message) {
    send(ws, { t: 'relay', payload: message });
  }
  function otherOf(ws) {
    if (slots[0] === ws) return slots[1];
    if (slots[1] === ws) return slots[0];
    return null;
  }
  function broadcast(message) {
    for (const ws of slots) payload(ws, message);
  }

  // Drop peers whose connection died without a close frame, so their room slot
  // is freed instead of blocking the other player behind a phantom partner.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.missedPings >= MAX_MISSED_PINGS) {
        console.warn(`Terminating a connection that missed ${ws.missedPings} pings.`);
        ws.terminate();
        continue;
      }
      ws.missedPings = (ws.missedPings || 0) + 1;
      try {
        ws.ping();
      } catch {
        ws.terminate();
      }
    }
  }, heartbeatMs);
  heartbeat.unref?.();

  wss.on('connection', ws => {
    if (slots[0] && slots[1]) {
      send(ws, { t: 'room-full' });
      ws.close();
      return;
    }
    const role = slots[0] ? 'guest' : 'host';
    slots[role === 'host' ? 0 : 1] = ws;
    ws.missedPings = 0;

    let windowStart = 0;
    let windowCount = 0;
    let windowDropped = 0;
    /** Simple fixed-window flood guard: excess frames are dropped, not queued. */
    function withinRateLimit() {
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        windowCount = 0;
        windowDropped = 0;
      }
      if (windowCount >= maxMessagesPerSecond) {
        if (windowDropped++ === 0) console.warn(`Rate limiting a ${role} connection above ${maxMessagesPerSecond} messages/s.`);
        return false;
      }
      windowCount++;
      return true;
    }

    // Ordered WebSocket delivery guarantees hydration is handled before pairing/gameplay.
    payload(ws, { type: 'worldState', ...store.snapshot() });
    send(ws, { t: 'paired', role });
    if (role === 'guest') send(slots[0], { t: 'peer-joined' });

    ws.on('pong', () => {
      ws.missedPings = 0;
    });

    ws.on('message', data => {
      if (data.length > MAX_STATE_BYTES) return;
      if (!withinRateLimit()) return;
      let envelope;
      try { envelope = JSON.parse(data.toString()); } catch { return; }
      // One shared schema decides what is a legal message here and on the
      // client, so neither side can silently drop what the other accepted.
      const message = parseRelayEnvelope(envelope);
      if (!message) return;

      if (message.type === 'worldInit') {
        if (store.initialize(message.revision, message.tiles)) broadcast({ type: 'worldState', ...store.snapshot() });
        return;
      }
      if (message.type === 'worldReset') {
        if (store.reset(message.revision)) broadcast({ type: 'worldReset', revision: store.snapshot().revision });
        return;
      }
      if (message.type === 'tile') {
        if (store.setTile(message.revision, { x: message.x, y: message.y, tile: message.tile })) payload(otherOf(ws), message);
        return;
      }
      if (message.type === 'enemySnapshot') {
        if (slots[0] === ws && store.setEnemies(message.revision, message.enemies)) payload(otherOf(ws), message);
        return;
      }
      if (message.type === 'explore') {
        if (store.setExplored(message.revision, message.ranges)) payload(otherOf(ws), message);
        return;
      }
      payload(otherOf(ws), message);
    });

    ws.on('close', () => {
      const peer = otherOf(ws);
      if (slots[0] === ws) slots[0] = null;
      else if (slots[1] === ws) slots[1] = null;
      if (peer && peer.readyState === peer.OPEN) {
        send(peer, { t: 'peer-left' });
        if (!slots[0]) {
          slots[0] = peer;
          if (slots[1] === peer) slots[1] = null;
        }
      }
    });
    ws.on('error', () => {});
  });

  return {
    wss,
    store,
    statePath,
    close: () => new Promise(resolve => {
      clearInterval(heartbeat);
      store.flush();
      for (const client of wss.clients) client.terminate();
      wss.close(resolve);
    })
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8081;
  const server = createRelayServer({ port });
  server.wss.on('listening', () => console.log(`Stalinload relay listening on ws://0.0.0.0:${port}; world state: ${server.statePath}`));
  const shutdown = async () => { await server.close(); process.exit(0); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
