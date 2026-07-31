import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
// `ws` exports the client class as its default export.
// oxlint-disable-next-line import/no-named-as-default
import WebSocket from 'ws';
import { createRelayServer, MAX_MISSED_PINGS } from '../index.js';

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

const settle = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));

async function relayServer(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moleload-relay-'));
  const server = createRelayServer({statePath:path.join(directory, 'world.json'), ...options});
  await new Promise(resolve => server.wss.once('listening', resolve));
  t.after(async () => {
    await server.close();
    fs.rmSync(directory, {recursive:true, force:true});
  });
  return {server, url:`ws://127.0.0.1:${server.wss.address().port}`};
}

test('connections hydrate before pairing; late joins and reset broadcasts use server authority', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moleload-relay-'));
  const statePath = path.join(directory, 'world.json');
  const server = createRelayServer({statePath});
  await new Promise(resolve => server.wss.once('listening', resolve));
  const url = `ws://127.0.0.1:${server.wss.address().port}`;
  const first = await connect(url);
  // Declared up front so the cleanup hook below can close it if the connect fails.
  // oxlint-disable-next-line prefer-const
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
  relay(first.socket, {type:'enemySnapshot',revision:1,enemies:[{id:7,kind:'ironback',x:3,y:402,drawX:3,drawY:402,hp:20,maxHp:24,alive:true}]});

  second = await connect(url);
  const hydrated = await second.next(message => message.payload?.type === 'worldState');
  await second.next(message => message.t === 'paired');
  assert.deepEqual(hydrated.payload.tiles, [{x:3,y:7,tile:{type:'air'}}]);
  assert.equal(hydrated.payload.enemies[0].kind, 'ironback');

  relay(second.socket, {type:'worldReset',revision:1});
  const reset = await first.next(message => message.payload?.type === 'worldReset');
  assert.equal(reset.payload.revision, 2);
  relay(first.socket, {type:'tile',revision:1,x:3,y:7,tile:{type:'air'}});
  assert.equal(server.store.snapshot().tiles.length, 0);
  relay(first.socket, {type:'worldInit',revision:2,tiles:[{x:3,y:7,tile:{type:'dirt',hp:2,maxHp:2}}]});
  await second.next(message => message.payload?.type === 'worldState' && message.payload.revision === 2 && message.payload.initialized);
  assert.deepEqual(server.store.snapshot().tiles, [{x:3,y:7,tile:{type:'dirt',hp:2,maxHp:2}}]);
});

test('a message the client would reject is neither persisted nor forwarded', async t => {
  const {server, url} = await relayServer(t);
  const host = await connect(url);
  const guest = await connect(url);
  t.after(() => { host.socket.terminate(); guest.socket.terminate(); });
  await guest.next(message => message.t === 'paired');

  relay(host.socket, {type:'worldInit',revision:1,tiles:[{x:3,y:7,tile:{type:'dirt',hp:2,maxHp:2}}]});
  await guest.next(message => message.payload?.type === 'worldState' && message.payload.initialized);

  // Negative hp used to pass client validation and be dropped here — the desync.
  relay(host.socket, {type:'tile',revision:1,x:3,y:7,tile:{type:'dirt',hp:-5,maxHp:2}});
  relay(host.socket, {type:'tile',revision:1,x:3,y:7,tile:{type:'air'}});

  const forwarded = await guest.next(message => message.payload?.type === 'tile');
  assert.deepEqual(forwarded.payload.tile, {type:'air'});
  assert.deepEqual(server.store.snapshot().tiles, [{x:3,y:7,tile:{type:'air'}}]);
});

test('a flooding connection is rate limited instead of driving the world', async t => {
  const {server, url} = await relayServer(t, {maxMessagesPerSecond:3});
  const host = await connect(url);
  t.after(() => host.socket.terminate());
  await host.next(message => message.t === 'paired');

  // The world init consumes the first slot of the window, leaving two mutations.
  relay(host.socket, {type:'worldInit',revision:1,tiles:[{x:0,y:5,tile:{type:'dirt',hp:2,maxHp:2}}]});
  await host.next(message => message.payload?.type === 'worldState' && message.payload.initialized);
  for (let x = 1; x < 11; x++) relay(host.socket, {type:'tile',revision:1,x,y:5,tile:{type:'air'}});
  await settle();

  assert.deepEqual(server.store.snapshot().tiles.map(entry => entry.x), [0, 1, 2]);
  assert.equal(server.wss.clients.size, 1);
});

test('a third connection is told the room is full, closed, and given no world', async t => {
  const {server, url} = await relayServer(t);
  const host = await connect(url);
  const guest = await connect(url);
  t.after(() => { host.socket.terminate(); guest.socket.terminate(); });
  await guest.next(message => message.t === 'paired');

  const extra = await connect(url);
  const closed = new Promise(resolve => extra.socket.once('close', resolve));
  const rejection = await extra.next(message => message.t === 'room-full');

  assert.equal(rejection.t, 'room-full');
  await closed;
  assert.equal(extra.socket.readyState, WebSocket.CLOSED);
  await settle(50);
  assert.equal(server.wss.clients.size, 2);

  // The rejected peer never became a room member: the pair is untouched and no
  // world state leaked to it.
  relay(host.socket, {type:'worldInit',revision:1,tiles:[{x:2,y:9,tile:{type:'dirt',hp:2,maxHp:2}}]});
  await guest.next(message => message.payload?.type === 'worldState' && message.payload.initialized);

  // A slot freed by the pair is handed to the next connection as normal.
  guest.socket.close();
  await host.next(message => message.t === 'peer-left');
  const replacement = await connect(url);
  t.after(() => replacement.socket.terminate());
  assert.equal((await replacement.next(message => message.t === 'paired')).role, 'guest');
});

test('the heartbeat keeps responsive connections and frees dead slots on close', async t => {
  const {server, url} = await relayServer(t, {heartbeatMs:25});
  const host = await connect(url);
  const guest = await connect(url);
  t.after(() => host.socket.terminate());
  await guest.next(message => message.t === 'paired');

  // `ws` answers pings automatically, so several heartbeat rounds must pass
  // without either peer being terminated for missed pings.
  await settle(150);
  assert.equal(server.wss.clients.size, 2);

  guest.socket.close();
  await host.next(message => message.t === 'peer-left');
  await settle(50);
  assert.equal(server.wss.clients.size, 1);
});

test('the heartbeat terminates a silent connection and frees its room slot', async t => {
  const {server, url} = await relayServer(t, {heartbeatMs:25});
  const host = await connect(url);
  t.after(() => host.socket.terminate());
  await host.next(message => message.t === 'paired');
  t.mock.method(console, 'warn', () => {});

  // Simulate a transport that died without a close frame: the peer answers no
  // more pings, so the relay must reclaim the slot rather than wait forever.
  const [connection] = server.wss.clients;
  connection.removeAllListeners('pong');
  connection.missedPings = MAX_MISSED_PINGS;
  await settle(80);
  assert.equal(server.wss.clients.size, 0);

  const replacement = await connect(url);
  t.after(() => replacement.socket.terminate());
  assert.equal((await replacement.next(message => message.t === 'paired')).role, 'host');
});
