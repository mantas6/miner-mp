import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createWorldStore, emptyWorld } from '../world-state.js';

function temporaryState() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moleload-world-'));
  return { directory, file: path.join(directory, 'world.json') };
}

test('generated blocks, dug air, enemies, and exploration survive restart', t => {
  const temporary = temporaryState();
  t.after(() => fs.rmSync(temporary.directory, {recursive:true, force:true}));
  const generated = {x:4,y:8,tile:{type:'ore',ore:{name:'Gold',color:'#fc0',value:70,min:1,max:20,chance:.1},hp:4,maxHp:4}};
  const store = createWorldStore(temporary.file);
  assert.equal(store.initialize(1, [generated]), true);
  assert.equal(store.setTile(1, {x:5,y:8,tile:{type:'air'}}), true);
  assert.equal(store.setEnemies(1, [{id:2,x:5,y:8,drawX:5,drawY:8,hp:3,maxHp:4,alive:true}]), true);
  assert.equal(store.setExplored(1, '270-278'), true);
  store.flush();

  assert.deepEqual(createWorldStore(temporary.file).snapshot(), {
    version:1, revision:1, initialized:true,
    tiles:[generated, {x:5,y:8,tile:{type:'air'}}],
    enemies:[{id:2,x:5,y:8,drawX:5,drawY:8,hp:3,maxHp:4,alive:true,kind:'tunnelFiend'}],
    explored:'270-278'
  });
});

test('malformed, oversized, and wrong-version persistence safely starts empty', t => {
  const temporary = temporaryState();
  t.after(() => fs.rmSync(temporary.directory, {recursive:true, force:true}));
  for (const value of ['not json', JSON.stringify({...emptyWorld(), version:99}), JSON.stringify({...emptyWorld(), tiles:[{x:999,y:1,tile:{type:'air'}}]})]) {
    fs.writeFileSync(temporary.file, value);
    assert.deepEqual(createWorldStore(temporary.file).snapshot(), emptyWorld());
  }
});

test('reset advances revision and rejects stale initialization and mutations', t => {
  const temporary = temporaryState();
  t.after(() => fs.rmSync(temporary.directory, {recursive:true, force:true}));
  const store = createWorldStore(temporary.file);
  assert.equal(store.initialize(1, [{x:1,y:3,tile:{type:'dirt',hp:2,maxHp:2}}]), true);
  assert.equal(store.reset(1), true);
  assert.equal(store.setTile(1, {x:1,y:3,tile:{type:'air'}}), false);
  assert.equal(store.initialize(1, [{x:1,y:3,tile:{type:'dirt',hp:2,maxHp:2}}]), false);
  assert.deepEqual(store.snapshot(), emptyWorld(2));
});

test('repeated writes to one coordinate replace it in place', t => {
  const temporary = temporaryState();
  t.after(() => fs.rmSync(temporary.directory, {recursive:true, force:true}));
  const store = createWorldStore(temporary.file);
  const dirt = hp => ({type:'dirt', hp, maxHp:4});
  assert.equal(store.initialize(1, [{x:1,y:5,tile:dirt(4)}, {x:2,y:5,tile:dirt(4)}]), true);

  assert.equal(store.setTile(1, {x:1,y:5,tile:dirt(2)}), true);
  assert.equal(store.setTile(1, {x:9,y:5,tile:dirt(4)}), true);
  assert.equal(store.setTile(1, {x:1,y:5,tile:{type:'air'}}), true);

  // Coordinates are indexed, so a rewrite updates its slot instead of appending.
  assert.deepEqual(store.snapshot().tiles, [
    {x:1,y:5,tile:{type:'air'}},
    {x:2,y:5,tile:dirt(4)},
    {x:9,y:5,tile:dirt(4)}
  ]);
});

test('a reset clears the coordinate index so the next world starts empty', t => {
  const temporary = temporaryState();
  t.after(() => fs.rmSync(temporary.directory, {recursive:true, force:true}));
  const store = createWorldStore(temporary.file);
  assert.equal(store.initialize(1, [{x:1,y:5,tile:{type:'dirt',hp:4,maxHp:4}}]), true);
  assert.equal(store.reset(1), true);
  assert.equal(store.initialize(2, [{x:1,y:5,tile:{type:'dirt',hp:4,maxHp:4}}]), true);
  assert.equal(store.setTile(2, {x:1,y:5,tile:{type:'air'}}), true);
  assert.deepEqual(store.snapshot().tiles, [{x:1,y:5,tile:{type:'air'}}]);
});

test('a failing write is logged instead of crashing the relay', t => {
  const temporary = temporaryState();
  t.after(() => fs.rmSync(temporary.directory, {recursive:true, force:true}));
  const blocker = path.join(temporary.directory, 'blocker');
  fs.writeFileSync(blocker, 'not a directory');
  const errors = [];
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', message => errors.push(message));

  const store = createWorldStore(path.join(blocker, 'world.json'));
  // The in-memory world stays authoritative for the connected players.
  assert.equal(store.initialize(1, []), true);
  assert.equal(store.flush(), false);
  assert.equal(store.snapshot().initialized, true);
  assert.match(errors.at(-1), /Failed to persist world state/);
});

test('deep terrain, enemies, and exploration survive relay persistence', t => {
  const temporary = temporaryState();
  t.after(() => fs.rmSync(temporary.directory, {recursive:true, force:true}));
  const deepY = 1205;
  const deepIndex = deepY * 90 + 45;
  const store = createWorldStore(temporary.file);
  assert.equal(store.initialize(1, []), true);
  assert.equal(store.setTile(1, {x:45,y:deepY,tile:{type:'air'}}), true);
  assert.equal(store.setEnemies(1, [{id:2,kind:'abyssStalker',x:45,y:deepY,drawX:45,drawY:deepY,hp:1200,maxHp:1200,alive:true}]), true);
  assert.equal(store.setExplored(1, `${deepIndex}-${deepIndex + 1}`), true);
  store.flush();

  const restored = createWorldStore(temporary.file).snapshot();
  assert.deepEqual(restored.tiles, [{x:45,y:deepY,tile:{type:'air'}}]);
  assert.equal(restored.enemies[0].y, deepY);
  assert.equal(restored.enemies[0].kind, 'abyssStalker');
  assert.equal(restored.explored, `${deepIndex}-${deepIndex + 1}`);
});
