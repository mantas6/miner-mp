import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import WebSocket from 'ws';
import { createRelayServer } from '../index.js';

function inbox(socket) {
  const messages = [];
  const waiters = [];
  socket.on('message', data => {
    const message = JSON.parse(data.toString());
    messages.push(message);
    waiters.splice(0).forEach(resolve => resolve());
  });
  return async predicate => {
    for (;;) {
      const match = messages.find(predicate);
      if (match) return match;
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('message timeout')), 2000);
        waiters.push(() => { clearTimeout(timeout); resolve(); });
      });
    }
  };
}

function relay(socket, payload) {
  socket.send(JSON.stringify({t:'relay', payload}));
}

async function connect(url) {
  const socket = new WebSocket(url);
  const next = inbox(socket);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  return {socket, next};
}

test('connections hydrate before pairing; late joins and reset broadcasts use server authority', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moleload-relay-'));
  const statePath = path.join(directory, 'world.json');
  const server = createRelayServer({statePath});
  await new Promise(resolve => server.wss.once('listening', resolve));
  const url = `ws://127.0.0.1:${server.wss.address().port}`;
  const first = await connect(url);
  let second;
  t.after(async () => {
    first.socket.terminate();
    second?.socket.terminate();
    await server.close();
    fs.rmSync(directory, {recursive:true, force:true});
  });

  const initial = await first.next(message => message.t === 'relay' && message.payload.type === 'worldState');
  const paired = await first.next(message => message.t === 'paired');
  assert.equal(initial.payload.initialized, false);
  assert.equal(paired.role, 'host');
  relay(first.socket, {type:'worldInit',revision:1,tiles:[{x:3,y:7,tile:{type:'dirt',hp:2,maxHp:2}}]});
  await first.next(message => message.payload?.type === 'worldState' && message.payload.initialized);
  relay(first.socket, {type:'tile',revision:1,x:3,y:7,tile:{type:'air'}});

  second = await connect(url);
  const hydrated = await second.next(message => message.payload?.type === 'worldState');
  await second.next(message => message.t === 'paired');
  assert.deepEqual(hydrated.payload.tiles, [{x:3,y:7,tile:{type:'air'}}]);

  relay(second.socket, {type:'worldReset',revision:1});
  const reset = await first.next(message => message.payload?.type === 'worldReset');
  assert.equal(reset.payload.revision, 2);
  relay(first.socket, {type:'tile',revision:1,x:3,y:7,tile:{type:'air'}});
  assert.equal(server.store.snapshot().tiles.length, 0);
  relay(first.socket, {type:'worldInit',revision:2,tiles:[{x:3,y:7,tile:{type:'dirt',hp:2,maxHp:2}}]});
  await second.next(message => message.payload?.type === 'worldState' && message.payload.revision === 2 && message.payload.initialized);
  assert.deepEqual(server.store.snapshot().tiles, [{x:3,y:7,tile:{type:'dirt',hp:2,maxHp:2}}]);
});
