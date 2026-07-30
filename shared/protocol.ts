// The co-op wire protocol, as zod schemas shared by the client and the relay.
//
// These messages are the `payload` carried inside the relay envelope
// (`{ t: 'relay', payload }`). The envelope itself is handled by `net.ts` on the
// client and `server/index.js` on the relay.
//
// The JSON shape is unchanged from the hand-written validators this replaced;
// only the rules are now defined once, so the client and the relay accept and
// reject exactly the same payloads.

import { z } from 'zod';
import {
  enemyEntriesSchema,
  enemyEntrySchema,
  enemyKindSchema,
  explorationSchema,
  generatedTileEntriesSchema,
  revisionSchema,
  tileEntrySchema,
  worldStateFields
} from './world-schema.ts';

/** Any real number: zod rejects `NaN` and `±Infinity` for `z.number()`. */
const real = z.number();

/** Local ship transform, throttled. Transform only — no fuel/hull vitals. */
export const playerStateSchema = z.object({
  type: z.literal('playerState'),
  x: real,
  y: real,
  drawX: real,
  drawY: real,
  facing: real,
  drillAnim: real,
  drillDx: real,
  drillDy: real,
  bob: real
});

/** A single local tile mutation (last-writer-wins). */
export const tileMessageSchema = z.object({
  type: z.literal('tile'),
  revision: revisionSchema,
  ...tileEntrySchema.shape
});

/** Guest -> host: request to wake dormant enemies around a coordinate. */
export const wakeNearSchema = z.object({ type: z.literal('wakeNear'), x: real, y: real });

/** Host -> guest: authoritative list of current enemies (~15 Hz). */
export const enemySnapshotSchema = z.object({
  type: z.literal('enemySnapshot'),
  revision: revisionSchema,
  enemies: enemyEntriesSchema
});

/** Host -> guest: a newly-woken enemy. */
export const enemySpawnSchema = z.object({
  type: z.literal('enemySpawn'),
  id: enemyEntrySchema.shape.id,
  kind: enemyKindSchema,
  x: enemyEntrySchema.shape.x,
  y: enemyEntrySchema.shape.y,
  hp: enemyEntrySchema.shape.hp,
  maxHp: enemyEntrySchema.shape.maxHp
});

/** Host -> guest: an enemy died (with bounty attribution). */
export const enemyDeadSchema = z.object({
  type: z.literal('enemyDead'),
  id: enemyEntrySchema.shape.id,
  bounty: real.min(0),
  killerIsGuest: z.boolean()
});

/** Guest -> host: guest drilled an enemy. */
export const enemyDamageSchema = z.object({
  type: z.literal('enemyDamage'),
  id: enemyEntrySchema.shape.id,
  amount: real,
  by: z.enum(['host', 'guest'])
});

/** Guest -> host: destroy a dormant enemy tile with one valid gun shot. */
export const enemyTileShotSchema = z.object({
  type: z.literal('enemyTileShot'),
  x: tileEntrySchema.shape.x,
  y: tileEntrySchema.shape.y,
  by: z.literal('guest')
});

/** Host -> guest: credit a guest kill locally. */
export const bountySchema = z.object({ type: z.literal('bounty'), amount: real.min(0) });

/** Inform partner the local ship has died. */
export const diedSchema = z.object({ type: z.literal('died') });

/** Inform partner the local ship has respawned at a coordinate. */
export const respawnedSchema = z.object({ type: z.literal('respawned'), x: real, y: real });

/** Inform partner the local ship teleported to a coordinate. */
export const teleportedSchema = z.object({ type: z.literal('teleported'), x: real, y: real });

/** Newly explored row-major tile ranges, shared as co-op cartography. */
export const exploreSchema = z.object({
  type: z.literal('explore'),
  revision: revisionSchema,
  ranges: explorationSchema
});

/** Server -> client: complete authoritative terrain/entity/view state. */
export const worldStateMessageSchema = z.object({ type: z.literal('worldState'), ...worldStateFields });

/** Client -> server: deterministic generated non-air tiles for a new revision. */
export const worldInitSchema = z.object({
  type: z.literal('worldInit'),
  revision: revisionSchema,
  tiles: generatedTileEntriesSchema
});

/** Client request or server broadcast for an authoritative terrain reset. */
export const worldResetSchema = z.object({ type: z.literal('worldReset'), revision: revisionSchema });

export const netMessageSchema = z.discriminatedUnion('type', [
  playerStateSchema,
  tileMessageSchema,
  wakeNearSchema,
  enemySnapshotSchema,
  enemySpawnSchema,
  enemyDeadSchema,
  enemyDamageSchema,
  enemyTileShotSchema,
  bountySchema,
  diedSchema,
  respawnedSchema,
  teleportedSchema,
  exploreSchema,
  worldStateMessageSchema,
  worldInitSchema,
  worldResetSchema
]);

/** The relay envelope that wraps every game message on the wire. */
export const relayEnvelopeSchema = z.object({ t: z.literal('relay'), payload: netMessageSchema });

export type PlayerStateMsg = z.infer<typeof playerStateSchema>;
export type TileMsg = z.infer<typeof tileMessageSchema>;
export type WakeNearMsg = z.infer<typeof wakeNearSchema>;
export type EnemySnapshotEntry = z.infer<typeof enemyEntrySchema>;
export type EnemySnapshotMsg = z.infer<typeof enemySnapshotSchema>;
export type EnemySpawnMsg = z.infer<typeof enemySpawnSchema>;
export type EnemyDeadMsg = z.infer<typeof enemyDeadSchema>;
export type EnemyDamageMsg = z.infer<typeof enemyDamageSchema>;
export type EnemyTileShotMsg = z.infer<typeof enemyTileShotSchema>;
export type BountyMsg = z.infer<typeof bountySchema>;
export type DiedMsg = z.infer<typeof diedSchema>;
export type RespawnedMsg = z.infer<typeof respawnedSchema>;
export type TeleportedMsg = z.infer<typeof teleportedSchema>;
export type ExploreMsg = z.infer<typeof exploreSchema>;
export type TileDiffEntry = z.infer<typeof tileEntrySchema>;
export type WorldStateMsg = z.infer<typeof worldStateMessageSchema>;
export type WorldInitMsg = z.infer<typeof worldInitSchema>;
export type WorldResetMsg = z.infer<typeof worldResetSchema>;
export type NetMessage = z.infer<typeof netMessageSchema>;
export type NetMessageType = NetMessage['type'];

/**
 * Validate an already-parsed value as a message, returning the normalized
 * message on success or `null` on any malformed input. Never throws.
 */
export function parseNetMessage(value: unknown): NetMessage | null {
  const result = netMessageSchema.safeParse(value);
  return result.success ? result.data : null;
}

/** Validate a raw relay envelope, returning its normalized payload or `null`. */
export function parseRelayEnvelope(value: unknown): NetMessage | null {
  const result = relayEnvelopeSchema.safeParse(value);
  return result.success ? result.data.payload : null;
}
