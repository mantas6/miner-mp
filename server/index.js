import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createWorldStore } from './world-state.js';

const DEFAULT_STATE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'world-state.json');

export function createRelayServer({ port = 0, statePath = process.env.WORLD_STATE_PATH || DEFAULT_STATE_PATH } = {}) {
  const store = createWorldStore(statePath);
  const wss = new WebSocketServer({ port, maxPayload: 16 * 1024 * 1024 });
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

  wss.on('connection', ws => {
    if (slots[0] && slots[1]) {
      send(ws, { t: 'room-full' });
      ws.close();
      return;
    }
    const role = slots[0] ? 'guest' : 'host';
    slots[role === 'host' ? 0 : 1] = ws;

    // Ordered WebSocket delivery guarantees hydration is handled before pairing/gameplay.
    payload(ws, { type: 'worldState', ...store.snapshot() });
    send(ws, { t: 'paired', role });
    if (role === 'guest') send(slots[0], { t: 'peer-joined' });

    ws.on('message', data => {
      if (data.length > 16 * 1024 * 1024) return;
      let envelope;
      try { envelope = JSON.parse(data.toString()); } catch { return; }
      if (!envelope || envelope.t !== 'relay' || !envelope.payload || typeof envelope.payload !== 'object') return;
      const message = envelope.payload;

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
      store.flush();
      for (const client of wss.clients) client.terminate();
      wss.close(resolve);
    })
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8081;
  const server = createRelayServer({ port });
  server.wss.on('listening', () => console.log(`Moleload relay listening on ws://0.0.0.0:${port}; world state: ${server.statePath}`));
  const shutdown = async () => { await server.close(); process.exit(0); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
