import { describe, expect, it } from 'vitest';
import { getInfoNavigationSection, getInfoTabFocusTarget, INFO_NAVIGATION_SECTIONS } from '../src/info-navigation';

describe('Info / Cargo tabs', () => {
  it('keeps stable panel and tab definitions for every guide section', () => {
    expect(INFO_NAVIGATION_SECTIONS.map(section => section.id)).toEqual([
      'info-objective', 'info-stats', 'info-developer', 'info-prospecting', 'info-hazards', 'info-controls'
    ]);
    for (const section of INFO_NAVIGATION_SECTIONS) {
      expect(getInfoNavigationSection(section.id)).toEqual(section);
      expect(section.tabId).toMatch(/^info-tab-/);
    }
    expect(getInfoNavigationSection('not-a-section')).toBeUndefined();
  });

  it('wraps arrow-key roving focus and supports Home/End', () => {
    expect(getInfoTabFocusTarget('info-objective', 'ArrowLeft')?.id).toBe('info-controls');
    expect(getInfoTabFocusTarget('info-objective', 'ArrowRight')?.id).toBe('info-stats');
    expect(getInfoTabFocusTarget('info-hazards', 'ArrowDown')?.id).toBe('info-controls');
    expect(getInfoTabFocusTarget('info-controls', 'Home')?.id).toBe('info-objective');
    expect(getInfoTabFocusTarget('info-objective', 'End')?.id).toBe('info-controls');
    expect(getInfoTabFocusTarget('info-objective', 'Enter')).toBeUndefined();
    expect(getInfoTabFocusTarget('missing', 'ArrowRight')).toBeUndefined();
  });
});
