import { describe, expect, it } from 'vitest';
import { resolveActiveInfoSection } from '../src/info-navigation';

const sections = [
  { id: 'info-objective', top: 120, bottom: 340 },
  { id: 'info-stats', top: 360, bottom: 620 },
  { id: 'info-prospecting', top: 640, bottom: 980 },
  { id: 'info-hazards', top: 1000, bottom: 1320 },
  { id: 'info-controls', top: 1340, bottom: 1580 }
];

describe('Info / Cargo active section resolver', () => {
  it('tracks the section that has reached the reader line during manual scrolling', () => {
    expect(resolveActiveInfoSection(sections, 0, 400)).toBe('info-objective');
    expect(resolveActiveInfoSection(sections, 340, 400)).toBe('info-stats');
    expect(resolveActiveInfoSection(sections, 620, 400)).toBe('info-prospecting');
    expect(resolveActiveInfoSection(sections, 980, 400)).toBe('info-hazards');
    expect(resolveActiveInfoSection(sections, 1320, 400)).toBe('info-controls');
  });

  it('handles short cards and empty measurements without selecting a stale section', () => {
    expect(resolveActiveInfoSection(sections, 0, 0)).toBeUndefined();
    expect(resolveActiveInfoSection([], 0, 400)).toBeUndefined();
    expect(resolveActiveInfoSection(sections, 2000, 400)).toBe('info-controls');
    expect(resolveActiveInfoSection(sections, 1180, 400, 1580)).toBe('info-controls');
  });
});
