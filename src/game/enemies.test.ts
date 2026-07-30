import { describe, expect, it, vi } from 'vitest';
import { ENEMY } from '../core/balance';
import { createInitialState } from '../core/state';
import type { Enemy, GameState } from '../core/types';
import { createEnemySim, type EnemySim } from './enemies';
import {
  createAudioStub,
  createFakeGrid,
  createSessionStub,
  createToastLog,
  type FakeGrid,
  type SessionStub
} from './test-support';

const bountyAt = (y: number) => ENEMY.bounty.base + Math.floor(y / ENEMY.bounty.depthDivisor) * ENEMY.bounty.step;

interface Harness {
  state: GameState;
  session: SessionStub;
  grid: FakeGrid;
  sim: EnemySim;
  addCash: ReturnType<typeof vi.fn>;
  saveProgress: ReturnType<typeof vi.fn>;
  toasts: ReturnType<typeof createToastLog>;
  spawnExplosion: ReturnType<typeof vi.fn>;
}

function harness(role: Parameters<typeof createSessionStub>[0] = {}): Harness {
  const state = createInitialState();
  const context = {
    state,
    session: createSessionStub(role),
    grid: createFakeGrid(),
    addCash: vi.fn((amount: number) => { state.cash += amount; }),
    saveProgress: vi.fn(),
    toasts: createToastLog(),
    spawnExplosion: vi.fn()
  };
  const sim = createEnemySim({
    state,
    session: context.session,
    grid: context.grid,
    audio: createAudioStub(),
    toast: context.toasts.toast,
    addCash: context.addCash,
    saveProgress: context.saveProgress,
    damagePlayer: vi.fn(),
    spawnDust: vi.fn(),
    spawnExplosion: context.spawnExplosion
  });
  return {...context, sim};
}

function spawnEnemy(state: GameState, overrides: Partial<Enemy> = {}): Enemy {
  const enemy: Enemy = {
    id: 7, kind: 'tunnelFiend', x: 10, y: 70, drawX: 10, drawY: 70,
    hp: 4, maxHp: 4, alive: true, moveTick: 0, biteTick: 0, flash: 0,
    ...overrides
  };
  state.enemies.push(enemy);
  return enemy;
}

describe('killing a live enemy', () => {
  it('pays the local bounty, counts the kill, and removes the enemy', () => {
    const h = harness();
    const enemy = spawnEnemy(h.state, {hp: 3, y: 70});

    h.sim.damageEnemy(enemy, 3);

    expect(enemy.alive).toBe(false);
    expect(h.addCash).toHaveBeenCalledWith(bountyAt(70));
    expect(h.state.stats.enemiesDestroyed).toBe(1);
    expect(h.saveProgress).toHaveBeenCalled();
    expect(h.spawnExplosion).toHaveBeenCalledWith(10, 70);
    expect(h.session.sent).toEqual([]);
  });

  it('scales the bounty with depth', () => {
    const shallow = harness();
    shallow.sim.damageEnemy(spawnEnemy(shallow.state, {hp: 1, y: 10}), 1);

    const deep = harness();
    const deepEnemy = spawnEnemy(deep.state, {hp: 1, y: 700});
    deep.sim.damageEnemy(deepEnemy, 1);

    expect(shallow.addCash).toHaveBeenCalledWith(bountyAt(10));
    expect(deep.addCash).toHaveBeenCalledWith(bountyAt(700));
    expect(bountyAt(700)).toBeGreaterThan(bountyAt(10));
  });

  it('only wounds an enemy that survives the hit', () => {
    const h = harness();
    const enemy = spawnEnemy(h.state, {hp: 4});

    h.sim.damageEnemy(enemy, 1);

    expect(enemy).toMatchObject({hp: 3, alive: true, flash: 1});
    expect(h.addCash).not.toHaveBeenCalled();
    expect(h.toasts.saw('3 HP left')).toBe(true);
  });

  it('ignores a missing or already dead target', () => {
    const h = harness();
    const dead = spawnEnemy(h.state, {alive: false});

    h.sim.damageEnemy(undefined);
    h.sim.damageEnemy(dead, 5);

    expect(h.addCash).not.toHaveBeenCalled();
  });
});

describe('kill attribution as the paired host', () => {
  it('replicates the death and banks the bounty for its own kill', () => {
    const h = harness({paired: true, pairedHost: true});
    const enemy = spawnEnemy(h.state, {hp: 1, y: 70});

    h.sim.damageEnemy(enemy, 1, 'host');

    expect(h.session.sent).toEqual([
      {type: 'enemyDead', id: 7, bounty: bountyAt(70), killerIsGuest: false}
    ]);
    expect(h.addCash).toHaveBeenCalledWith(bountyAt(70));
  });

  it('hands the bounty to the guest that landed the killing blow', () => {
    const h = harness({paired: true, pairedHost: true});
    const enemy = spawnEnemy(h.state, {hp: 1, y: 70});

    h.sim.damageEnemy(enemy, 1, 'guest');

    expect(enemy.alive).toBe(false);
    expect(h.session.sent).toEqual([
      {type: 'enemyDead', id: 7, bounty: bountyAt(70), killerIsGuest: true},
      {type: 'bounty', amount: bountyAt(70)}
    ]);
    // The host simulated the kill but must not also be paid for it.
    expect(h.addCash).not.toHaveBeenCalled();
    expect(h.state.stats.enemiesDestroyed).toBe(0);
  });

  it('credits a bounty the host awarded to this client', () => {
    const h = harness({paired: true, guestReplica: true});

    h.sim.creditBounty(48);

    expect(h.addCash).toHaveBeenCalledWith(48);
    expect(h.state.stats.enemiesDestroyed).toBe(1);
  });
});

describe('a guest replica', () => {
  it('forwards its hit to the host instead of simulating damage', () => {
    const h = harness({paired: true, guestReplica: true});
    const enemy = spawnEnemy(h.state, {hp: 4});

    h.sim.damageEnemy(enemy, 3, 'guest');

    expect(enemy.hp).toBe(4);
    expect(enemy.alive).toBe(true);
    expect(h.session.sent).toEqual([{type: 'enemyDamage', id: 7, amount: 3, by: 'guest'}]);
    expect(h.addCash).not.toHaveBeenCalled();
  });

  it('asks the host to resolve a drilled cocoon and never clears the tile itself', () => {
    const h = harness({paired: true, guestReplica: true});
    h.grid.put(4, 80, {type: 'enemy', kind: 'ironback', hp: 6, maxHp: 6});

    expect(h.sim.damageEnemyTile(4, 80)).toBe(true);

    expect(h.grid.get(4, 80)).toMatchObject({type: 'enemy', hp: 6});
    expect(h.session.sent).toEqual([{type: 'wakeNear', x: 4, y: 80}]);
  });

  it('refuses to destroy a cocoon outright; only the host may', () => {
    const h = harness({paired: true, guestReplica: true});
    h.grid.put(4, 80, {type: 'enemy', kind: 'ironback', hp: 6, maxHp: 6});

    expect(h.sim.destroyDormantEnemy(4, 80, 'guest')).toBe(false);
    expect(h.grid.get(4, 80).type).toBe('enemy');
  });
});

describe('dormant cocoons', () => {
  it('drills a cocoon down before clearing the tile and paying the bounty', () => {
    const h = harness();
    h.state.player.drill = 2;
    h.grid.put(4, 80, {type: 'enemy', kind: 'tunnelFiend', hp: 4, maxHp: 4});

    expect(h.sim.damageEnemyTile(4, 80)).toBe(true);
    expect(h.grid.get(4, 80)).toMatchObject({type: 'enemy', hp: 2});
    expect(h.addCash).not.toHaveBeenCalled();

    h.sim.damageEnemyTile(4, 80);
    expect(h.grid.get(4, 80)).toEqual({type: 'air'});
    expect(h.addCash).toHaveBeenCalledWith(bountyAt(80));
    expect(h.toasts.saw('Dormant enemy drilled out')).toBe(true);
  });

  it('reports a coordinate that holds no cocoon', () => {
    const h = harness();

    expect(h.sim.damageEnemyTile(4, 80)).toBe(false);
    expect(h.sim.destroyDormantEnemy(4, 80, 'host')).toBe(false);
  });

  it('clears a shot cocoon in one go and credits the shooter', () => {
    const h = harness();
    h.grid.put(4, 80, {type: 'enemy', kind: 'ironback', hp: 20, maxHp: 20});

    expect(h.sim.destroyDormantEnemy(4, 80, 'host')).toBe(true);

    expect(h.grid.get(4, 80)).toEqual({type: 'air'});
    expect(h.addCash).toHaveBeenCalledWith(bountyAt(80));
  });

  it('sends a guest-shot cocoon bounty to the guest, not the host wallet', () => {
    const h = harness({paired: true, pairedHost: true});
    h.grid.put(4, 80, {type: 'enemy', kind: 'ironback', hp: 20, maxHp: 20});

    expect(h.sim.destroyDormantEnemy(4, 80, 'guest')).toBe(true);

    expect(h.session.sent).toEqual([{type: 'bounty', amount: bountyAt(80)}]);
    expect(h.addCash).not.toHaveBeenCalled();
  });
});

describe('snapshot replication', () => {
  it('adopts an authoritative list while preserving local animation timers', () => {
    const h = harness({paired: true, guestReplica: true});
    const local = spawnEnemy(h.state, {id: 3, moveTick: 12, biteTick: 9, flash: 0.5});

    h.sim.applyEntries([
      {id: 3, kind: local.kind, x: 11, y: 71, drawX: 10, drawY: 70, hp: 2, maxHp: 4, alive: true},
      {id: 4, kind: 'skitterling', x: 1, y: 2, drawX: 1, drawY: 2, hp: 5, maxHp: 5, alive: true}
    ]);

    expect(h.state.enemies).toHaveLength(2);
    expect(h.state.enemies[0]).toMatchObject({id: 3, x: 11, y: 71, hp: 2, moveTick: 12, biteTick: 9, flash: 0.5});
    expect(h.state.enemies[1]).toMatchObject({id: 4, moveTick: 0, biteTick: 0, flash: 0});
  });
});
