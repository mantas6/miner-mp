import { describe, expect, it } from 'vitest';
import { beginExtraction, cancelExtraction, completeExtractionAtDepot } from './extraction-phase';
import { formatExtractionPresentation } from './extraction-presentation';

const REWARD = 5000;

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

describe('Motherlode extraction presentation', () => {
  it.each([
    ['returning', 0, 'Motherlode secured'],
    ['completed', 1, 'Extraction complete'],
    ['none', 2, 'Career milestone']
  ] as const)('headlines the %s phase and always shows the reward in the info panel', (phase, extractions, hudHeadline) => {
    const presentation = formatExtractionPresentation({ phase, motherlodeExtractions: extractions, reward: REWARD });

    expect(presentation.hud).toContain(hudHeadline);
    expect(presentation.info).toContain('$5,000');
  });

  it('pluralizes the career extraction count', () => {
    const one = formatExtractionPresentation({ phase: 'none', motherlodeExtractions: 1, reward: REWARD });
    const many = formatExtractionPresentation({ phase: 'none', motherlodeExtractions: 2, reward: REWARD });

    expect(one.hud).toContain('1 Motherlode extraction banked');
    expect(many.hud).toContain('2 Motherlode extractions banked');
  });

  it('hides the HUD line before the first core is claimed and offers the core as a bonus, not the goal', () => {
    const presentation = formatExtractionPresentation({ phase: 'none', motherlodeExtractions: 0, reward: REWARD });

    expect(presentation.hud).toBeNull();
    expect(presentation.info).toContain('$5,000');
    expect(presentation.info).not.toContain('10,000 m');
  });
});
