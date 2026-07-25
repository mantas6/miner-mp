// Moleload relay server.
//
// A deliberately dumb WebSocket relay: it does pairing and message forwarding
// only, with zero game logic. See PLAN.md "Phase 1 - Relay server".
//
// Single auto-pairing room:
//   - 1st connection -> { t: 'paired', role: 'host' }
//   - 2nd connection -> { t: 'paired', role: 'guest' } and the host is told
//     { t: 'peer-joined' }
//   - 3rd connection -> { t: 'room-full' } then closed.
// Any { t: 'relay', payload } is forwarded verbatim to the other peer.
// On disconnect the remaining peer gets { t: 'peer-left' } and the freed slot
// becomes the host slot so a new joiner pairs in as guest.

import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 8081;

const wss = new WebSocketServer({ port: PORT });

// The room has two slots. Index 0 is host, index 1 is guest.
const slots = [null, null];

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function otherOf(ws) {
  if (slots[0] === ws) return slots[1];
  if (slots[1] === ws) return slots[0];
  return null;
}

wss.on('connection', (ws) => {
  // Reject a 3rd (or later) connection.
  if (slots[0] && slots[1]) {
    send(ws, { t: 'room-full' });
    ws.close();
    return;
  }

  let role;
  if (!slots[0]) {
    slots[0] = ws;
    role = 'host';
  } else {
    slots[1] = ws;
    role = 'guest';
  }

  send(ws, { t: 'paired', role });

  // Notify the host that a guest has joined.
  if (role === 'guest') {
    send(slots[0], { t: 'peer-joined' });
  }

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return; // Ignore non-JSON frames.
    }
    if (msg && msg.t === 'relay') {
      const peer = otherOf(ws);
      send(peer, msg);
    }
  });

  ws.on('close', () => {
    const peer = otherOf(ws);

    // Free this slot.
    if (slots[0] === ws) slots[0] = null;
    else if (slots[1] === ws) slots[1] = null;

    // Notify the remaining peer and promote it into the host slot so the next
    // joiner pairs in as guest. Actual client-side role promotion happens in a
    // later phase; here we just keep the slot bookkeeping consistent.
    if (peer && peer.readyState === peer.OPEN) {
      send(peer, { t: 'peer-left' });
      if (slots[0] === null) {
        slots[0] = peer;
        if (slots[1] === peer) slots[1] = null;
      }
    }
  });

  ws.on('error', () => {
    // Errors are followed by a close event which handles cleanup.
  });
});

console.log(`Moleload relay listening on ws://0.0.0.0:${PORT}`);
