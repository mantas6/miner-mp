import { describe, expect, it } from 'vitest';
import { getPartnerIndicator } from './partner-indicator';

describe('partner off-screen indicator', () => {
  it('stays hidden while any part of the partner is visible', () => {
    expect(getPartnerIndicator(400, 300, 810, 300, 800, 600, 20, 64)).toBeNull();
    expect(getPartnerIndicator(400, 300, 400, -20, 800, 600, 20, 64)).toBeNull();
  });

  it('points toward the partner and stays inside desktop safe bounds', () => {
    const indicator = getPartnerIndicator(480, 320, 1200, -400, 960, 640, 40, 64);

    expect(indicator).not.toBeNull();
    expect(indicator!.x).toBeCloseTo(736);
    expect(indicator!.y).toBe(64);
    expect(indicator!.angle).toBeCloseTo(-Math.PI / 4);
  });

  it('points toward the partner and stays inside mobile landscape safe bounds', () => {
    const indicator = getPartnerIndicator(422, 195, -200, 195, 844, 390, 20, 64);

    expect(indicator).toMatchObject({ x: 64, y: 195 });
    expect(indicator!.angle).toBeCloseTo(Math.PI);
  });
});
