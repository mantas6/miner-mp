import type { ExtractionPhase } from './extraction-phase';

export interface ExtractionPresentationInput {
  phase: ExtractionPhase;
  motherlodeExtractions: number;
  reward: number;
}

export interface ExtractionPresentation {
  hud: string | null;
  info: string;
}

function count(value: number): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

/**
 * Keeps the post-core status copy independent from DOM updates so the HUD and
 * Info / Cargo overlay always describe the same extraction state.
 */
export function formatExtractionPresentation({
  phase,
  motherlodeExtractions,
  reward
}: ExtractionPresentationInput): ExtractionPresentation {
  const extractions = count(motherlodeExtractions);
  const formattedReward = `$${Math.max(0, Math.floor(reward)).toLocaleString('en-US')}`;

  if (phase === 'returning') {
    return {
      hud: 'Motherlode secured — extract alive to the surface depot.',
      info: `Core secured for ${formattedReward}. Reach the surface depot alive to bank this Motherlode extraction.`
    };
  }

  if (phase === 'completed') {
    return {
      hud: `Extraction complete — ${formattedReward} Motherlode claim banked at the depot.`,
      info: `Extraction complete: ${formattedReward} Motherlode claim banked safely at the depot. Career record: ${extractions} completed extraction${extractions === 1 ? '' : 's'}. Choose an upgrade or begin another descent.`
    };
  }

  if (extractions > 0) {
    return {
      hud: `Career milestone — ${extractions} Motherlode extraction${extractions === 1 ? '' : 's'} banked.`,
      info: `Career milestone: ${extractions} Motherlode extraction${extractions === 1 ? '' : 's'} banked. The next core will pay ${formattedReward}; prepare at the depot, then descend.`
    };
  }

  // The mine has no bottom and the core is a one-off bonus rather than the end
  // of the run, so this reads as an opportunity instead of the run's objective.
  return {
    hud: null,
    info: `No Motherlode core banked yet — cracking one deep in the mine pays ${formattedReward} on the spot, and carrying it to the depot alive banks the extraction.`
  };
}
