import { describe, expect, it } from 'vitest';
import {
  getInfoNavigationSection,
  getInfoNavigationSections,
  getInfoTabFocusTarget,
  INFO_NAVIGATION_SECTIONS
} from './info-navigation';

describe('Info / Cargo tabs', () => {
  it('exposes exactly the six player sections, cheats included via Settings', () => {
    expect(INFO_NAVIGATION_SECTIONS.map(section => section.id)).toEqual([
      'info-objective', 'info-stats', 'info-prospecting', 'info-hazards', 'info-controls', 'info-settings'
    ]);
    expect(getInfoNavigationSections()).toEqual(INFO_NAVIGATION_SECTIONS);
    for (const section of INFO_NAVIGATION_SECTIONS) {
      expect(getInfoNavigationSection(section.id)).toEqual(section);
      expect(section.tabId).toMatch(/^info-tab-/);
    }
    // The cheat menu lives inside Settings, so it never adds a tab of its own.
    expect(getInfoNavigationSection('info-developer')).toBeUndefined();
    expect(getInfoNavigationSection('not-a-section')).toBeUndefined();
  });

  it('wraps arrow-key roving focus and supports Home/End', () => {
    expect(getInfoTabFocusTarget('info-objective', 'ArrowLeft')?.id).toBe('info-settings');
    expect(getInfoTabFocusTarget('info-objective', 'ArrowRight')?.id).toBe('info-stats');
    expect(getInfoTabFocusTarget('info-stats', 'ArrowRight')?.id).toBe('info-prospecting');
    expect(getInfoTabFocusTarget('info-hazards', 'ArrowDown')?.id).toBe('info-controls');
    expect(getInfoTabFocusTarget('info-controls', 'ArrowRight')?.id).toBe('info-settings');
    expect(getInfoTabFocusTarget('info-settings', 'ArrowRight')?.id).toBe('info-objective');
    expect(getInfoTabFocusTarget('info-controls', 'Home')?.id).toBe('info-objective');
    expect(getInfoTabFocusTarget('info-objective', 'End')?.id).toBe('info-settings');
    expect(getInfoTabFocusTarget('info-objective', 'Enter')).toBeUndefined();
    expect(getInfoTabFocusTarget('missing', 'ArrowRight')).toBeUndefined();
  });
});
