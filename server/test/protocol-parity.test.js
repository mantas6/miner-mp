import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseNetMessage, parseRelayEnvelope } from '../../shared/protocol.ts';
import { PROTOCOL_CASES } from '../../shared/protocol-fixtures.ts';
import { createWorldStore } from '../world-state.js';

// The client asserts the same verdicts over the same table in
// src/net/net-protocol.test.ts. Divergence between the two rule sets used to let
// a message pass client validation and then be silently dropped here.
test('the relay accepts and rejects exactly what the client does', () => {
  for (const { label, message, valid } of PROTOCOL_CASES) {
    assert.equal(parseNetMessage(message) !== null, valid, `${label} (schema)`);
    assert.equal(parseRelayEnvelope({t:'relay', payload:message}) !== null, valid, `${label} (envelope)`);
  }
});

test('the relay envelope rejects anything but a relay payload', () => {
  const tile = {type:'tile', revision:1, x:3, y:7, tile:{type:'air'}};
  assert.notEqual(parseRelayEnvelope({t:'relay', payload:tile}), null);
  assert.equal(parseRelayEnvelope({t:'paired', payload:tile}), null);
  assert.equal(parseRelayEnvelope({t:'relay'}), null);
  assert.equal(parseRelayEnvelope('relay'), null);
});

test('a tile the client would reject is also rejected by the world store', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moleload-parity-'));
  t.after(() => fs.rmSync(directory, {recursive:true, force:true}));
  const store = createWorldStore(path.join(directory, 'world.json'));
  assert.equal(store.initialize(1, [{x:3,y:7,tile:{type:'dirt',hp:4,maxHp:4}}]), true);

  const negative = {type:'dirt', hp:-5, maxHp:4};
  assert.equal(parseNetMessage({type:'tile', revision:1, x:3, y:7, tile:negative}), null);
  assert.equal(store.setTile(1, {x:3, y:7, tile:negative}), false);
  assert.deepEqual(store.snapshot().tiles, [{x:3,y:7,tile:{type:'dirt',hp:4,maxHp:4}}]);

  assert.equal(store.setTile(1, {x:3, y:7, tile:{type:'air'}}), true);
  assert.deepEqual(store.snapshot().tiles, [{x:3,y:7,tile:{type:'air'}}]);
});
