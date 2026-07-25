import { describe, expect, it } from 'vitest';
import { beginExtraction, cancelExtraction, completeExtractionAtDepot } from '../src/extraction-phase';

describe('Motherlode extraction phase', () => {
  it('starts a single return-to-depot phase when a core is claimed', () => {
    expect(beginExtraction('none')).toEqual({ phase: 'returning', changed: true });
    expect(beginExtraction('returning')).toEqual({ phase: 'returning', changed: false });
    expect(beginExtraction('completed')).toEqual({ phase: 'completed', changed: false });
  });

  it('only completes the extraction once on a safe depot arrival', () => {
    expect(completeExtractionAtDepot('returning', false)).toEqual({ phase: 'returning', changed: false });
    expect(completeExtractionAtDepot('returning', true)).toEqual({ phase: 'completed', changed: true });
    expect(completeExtractionAtDepot('completed', true)).toEqual({ phase: 'completed', changed: false });
  });

  it('cancels an unbanked core run on death or reset', () => {
    expect(cancelExtraction()).toBe('none');
  });
});
