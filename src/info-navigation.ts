export const INFO_NAVIGATION_SECTIONS = [
  { id: 'info-objective', label: 'Objective & Cargo', tabId: 'info-tab-objective' },
  { id: 'info-stats', label: 'Stats', tabId: 'info-tab-stats' },
  { id: 'info-developer', label: 'Developer', tabId: 'info-tab-developer' },
  { id: 'info-prospecting', label: 'Prospecting', tabId: 'info-tab-prospecting' },
  { id: 'info-hazards', label: 'Hazards', tabId: 'info-tab-hazards' },
  { id: 'info-controls', label: 'Controls', tabId: 'info-tab-controls' }
] as const;

export type InfoNavigationSection = typeof INFO_NAVIGATION_SECTIONS[number];

export function getInfoNavigationSection(id: string): InfoNavigationSection | undefined {
  return INFO_NAVIGATION_SECTIONS.find(section => section.id === id);
}

/** Returns the roving-focus destination for the WAI-ARIA tablist keys. */
export function getInfoTabFocusTarget(currentId: string, key: string): InfoNavigationSection | undefined {
  const currentIndex = INFO_NAVIGATION_SECTIONS.findIndex(section => section.id === currentId);
  if (currentIndex < 0) return undefined;
  const normalizedKey = key.toLowerCase();
  if (normalizedKey === 'home') return INFO_NAVIGATION_SECTIONS[0];
  if (normalizedKey === 'end') return INFO_NAVIGATION_SECTIONS[INFO_NAVIGATION_SECTIONS.length - 1];
  if (normalizedKey !== 'arrowleft' && normalizedKey !== 'arrowup' && normalizedKey !== 'arrowright' && normalizedKey !== 'arrowdown') return undefined;
  const direction = normalizedKey === 'arrowleft' || normalizedKey === 'arrowup' ? -1 : 1;
  return INFO_NAVIGATION_SECTIONS[(currentIndex + direction + INFO_NAVIGATION_SECTIONS.length) % INFO_NAVIGATION_SECTIONS.length];
}
