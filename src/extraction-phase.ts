export type ExtractionPhase = 'none' | 'returning' | 'completed';

export interface ExtractionTransition {
  phase: ExtractionPhase;
  changed: boolean;
}

/**
 * Core cracking pays its existing reward immediately, but a run is not a
 * completed extraction until its carrier reaches the surface depot. Keeping
 * this transition model DOM-free makes duplicate awards and reset/death paths
 * straightforward to verify.
 */
export function beginExtraction(phase: ExtractionPhase): ExtractionTransition {
  if (phase !== 'none') return { phase, changed: false };
  return { phase: 'returning', changed: true };
}

export function completeExtractionAtDepot(phase: ExtractionPhase, atSurface: boolean): ExtractionTransition {
  if (phase !== 'returning' || !atSurface) return { phase, changed: false };
  return { phase: 'completed', changed: true };
}

export function cancelExtraction(): ExtractionPhase {
  return 'none';
}
