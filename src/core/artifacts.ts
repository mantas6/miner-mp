import type { Artifact, GameStats, Player } from './types';

interface ArtifactClaimState {
  cash: number;
  player: Pick<Player, 'cargo'>;
  stats: Pick<GameStats, 'totalCashEarned' | 'artifactsFound'>;
}

/** Bank an artifact immediately without moving it through the cargo system. */
export function claimArtifact(state: ArtifactClaimState, artifact: Artifact): number {
  state.cash += artifact.value;
  state.stats.totalCashEarned += artifact.value;
  state.stats.artifactsFound++;
  return artifact.value;
}
