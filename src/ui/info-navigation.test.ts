import { describe, expect, it } from 'vitest';
import {
  DEVELOPER_INFO_SECTION,
  getInfoNavigationSection,
  getInfoNavigationSections,
  getInfoTabFocusTarget,
  INFO_NAVIGATION_SECTIONS
} from './info-navigation';

describe('Info / Cargo tabs', () => {
  it('keeps normal player navigation limited to guidance sections', () => {
    expect(INFO_NAVIGATION_SECTIONS.map(section => section.id)).toEqual([
      'info-objective', 'info-stats', 'info-prospecting', 'info-hazards', 'info-controls', 'info-settings'
    ]);
    for (const section of INFO_NAVIGATION_SECTIONS) {
      expect(getInfoNavigationSection(section.id)).toEqual(section);
      expect(section.tabId).toMatch(/^info-tab-/);
    }
    expect(getInfoNavigationSection('info-developer')).toBeUndefined();
    expect(getInfoNavigationSection('not-a-section')).toBeUndefined();
  });

  it('adds clearly labeled developer navigation only when explicitly enabled', () => {
    const enabled = getInfoNavigationSections(true);
    expect(enabled.map(section => section.id)).toEqual([
      'info-objective', 'info-stats', 'info-developer', 'info-prospecting', 'info-hazards', 'info-controls', 'info-settings'
    ]);
    expect(getInfoNavigationSection('info-developer', true)).toEqual(DEVELOPER_INFO_SECTION);
    expect(DEVELOPER_INFO_SECTION.label).toContain('local');
  });

  it('wraps arrow-key roving focus and supports Home/End in player mode', () => {
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

  it('includes the opted-in developer tab in roving focus without changing boundaries', () => {
    expect(getInfoTabFocusTarget('info-stats', 'ArrowRight', true)?.id).toBe('info-developer');
    expect(getInfoTabFocusTarget('info-developer', 'ArrowRight', true)?.id).toBe('info-prospecting');
    expect(getInfoTabFocusTarget('info-objective', 'Home', true)?.id).toBe('info-objective');
    expect(getInfoTabFocusTarget('info-objective', 'End', true)?.id).toBe('info-settings');
  });
});
