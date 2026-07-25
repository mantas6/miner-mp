export const INFO_NAVIGATION_SECTIONS = [
  { id: 'info-objective', label: 'Objective & Cargo' },
  { id: 'info-stats', label: 'Stats' },
  { id: 'info-developer', label: 'Developer' },
  { id: 'info-prospecting', label: 'Prospecting' },
  { id: 'info-hazards', label: 'Hazards' },
  { id: 'info-controls', label: 'Controls' }
] as const;

export type InfoNavigationSection = typeof INFO_NAVIGATION_SECTIONS[number];

export function getInfoNavigationSection(id: string): InfoNavigationSection | undefined {
  return INFO_NAVIGATION_SECTIONS.find(section => section.id === id);
}

export type InfoSectionPosition = {
  id: string;
  top: number;
  bottom: number;
};

/**
 * Finds the section a reader has reached in the scrollable Info / Cargo card.
 * A small reading line below the sticky navigator means a heading becomes active
 * as it enters the part of the card that is actually being read, not only after
 * it has completely passed the card's top edge.
 */
export function resolveActiveInfoSection(
  sections: readonly InfoSectionPosition[],
  scrollTop: number,
  clientHeight: number,
  scrollHeight?: number
): string | undefined {
  if (!sections.length || clientHeight <= 0) return undefined;
  if (scrollHeight !== undefined && scrollTop + clientHeight >= scrollHeight - 1) return sections[sections.length - 1].id;

  const readingLine = scrollTop + Math.min(160, Math.max(48, clientHeight * 0.28));
  const reached = sections.filter(section => section.top <= readingLine && section.bottom > scrollTop);
  if (reached.length) return reached[reached.length - 1].id;

  return sections.find(section => section.bottom > scrollTop)?.id ?? sections[sections.length - 1].id;
}
