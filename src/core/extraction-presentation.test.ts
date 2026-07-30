import { describe, expect, it } from 'vitest';
import { formatExtractionPresentation } from './extraction-presentation';

describe('Motherlode extraction presentation', () => {
  it('gives a clear return-to-depot instruction while the core is unbanked', () => {
    expect(formatExtractionPresentation({
      phase: 'returning',
      motherlodeExtractions: 0,
      reward: 5000
    })).toEqual({
      hud: 'Motherlode secured — extract alive to the surface depot.',
      info: 'Core secured for $5,000. Reach the surface depot alive to bank this Motherlode extraction.'
    });
  });

  it('shows the reward and career outcome after a successful depot return', () => {
    expect(formatExtractionPresentation({
      phase: 'completed',
      motherlodeExtractions: 1,
      reward: 5000
    })).toEqual({
      hud: 'Extraction complete — $5,000 Motherlode claim banked at the depot.',
      info: 'Extraction complete: $5,000 Motherlode claim banked safely at the depot. Career record: 1 completed extraction. Choose an upgrade or begin another descent.'
    });
  });

  it('keeps a saved career milestone readable after a completed run reloads', () => {
    expect(formatExtractionPresentation({
      phase: 'none',
      motherlodeExtractions: 2,
      reward: 5000
    }).hud).toBe('Career milestone — 2 Motherlode extractions banked.');
  });
});
