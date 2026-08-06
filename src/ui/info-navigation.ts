// The sections are declared as literals rather than as a `string`-keyed list so
// the ids form a closed union: the store's `infoTab` can then only ever hold a
// panel that exists, and adding a section without rendering it fails to compile.

export const INFO_NAVIGATION_SECTIONS = [
  { id: 'info-objective', label: 'Objective & Cargo', tabId: 'info-tab-objective' },
  { id: 'info-stats', label: 'Stats', tabId: 'info-tab-stats' },
  { id: 'info-prospecting', label: 'Prospecting', tabId: 'info-tab-prospecting' },
  { id: 'info-hazards', label: 'Hazards', tabId: 'info-tab-hazards' },
  { id: 'info-controls', label: 'Controls', tabId: 'info-tab-controls' }
] as const;

/** Every panel the Info overlay can show, including the opt-in developer one. */
export type InfoTab = (typeof INFO_NAVIGATION_SECTIONS)[number]['id'] | 'info-developer';

/** Where the Info overlay always opens. */
export const DEFAULT_INFO_TAB: InfoTab = INFO_NAVIGATION_SECTIONS[0].id;

export interface InfoNavigationSection {
  id: InfoTab;
  label: string;
  tabId: string;
}

export const DEVELOPER_INFO_SECTION: InfoNavigationSection = {
  id: 'info-developer', label: 'Dev tools (local)', tabId: 'info-tab-developer'
};

export function getInfoNavigationSections(developerToolsEnabled = false): readonly InfoNavigationSection[] {
  if (!developerToolsEnabled) return INFO_NAVIGATION_SECTIONS;
  return [...INFO_NAVIGATION_SECTIONS.slice(0, 2), DEVELOPER_INFO_SECTION, ...INFO_NAVIGATION_SECTIONS.slice(2)];
}

export function getInfoNavigationSection(id: string, developerToolsEnabled = false): InfoNavigationSection | undefined {
  return getInfoNavigationSections(developerToolsEnabled).find(section => section.id === id);
}

/** Returns the roving-focus destination for the WAI-ARIA tablist keys. */
export function getInfoTabFocusTarget(currentId: string, key: string, developerToolsEnabled = false): InfoNavigationSection | undefined {
  const sections = getInfoNavigationSections(developerToolsEnabled);
  const currentIndex = sections.findIndex(section => section.id === currentId);
  if (currentIndex < 0) return undefined;
  const normalizedKey = key.toLowerCase();
  if (normalizedKey === 'home') return sections[0];
  if (normalizedKey === 'end') return sections[sections.length - 1];
  if (normalizedKey !== 'arrowleft' && normalizedKey !== 'arrowup' && normalizedKey !== 'arrowright' && normalizedKey !== 'arrowdown') return undefined;
  const direction = normalizedKey === 'arrowleft' || normalizedKey === 'arrowup' ? -1 : 1;
  return sections[(currentIndex + direction + sections.length) % sections.length];
}
