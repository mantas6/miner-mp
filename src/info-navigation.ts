export const INFO_NAVIGATION_SECTIONS = [
  { id: 'info-objective', label: 'Objective & Cargo' },
  { id: 'info-stats', label: 'Stats' },
  { id: 'info-prospecting', label: 'Prospecting' },
  { id: 'info-hazards', label: 'Hazards' },
  { id: 'info-controls', label: 'Controls' }
] as const;

export type InfoNavigationSection = typeof INFO_NAVIGATION_SECTIONS[number];

export function getInfoNavigationSection(id: string): InfoNavigationSection | undefined {
  return INFO_NAVIGATION_SECTIONS.find(section => section.id === id);
}
