import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MinerApp } from '../src/ui';

const GAME_DOM_IDS = [
  'shell',
  'game-panel',
  'game',
  'hud',
  'soundBtn',
  'soundStatus',
  'cash',
  'depth',
  'fuel',
  'fuelLabel',
  'hull',
  'hullLabel',
  'cargo',
  'cargoLabel',
  'cargoFeedback',
  'sell',
  'fuelBtn',
  'repairBtn',
  'cargoBtn',
  'tankBtn',
  'drillBtn',
  'infoBtn',
  'info-screen',
  'infoCloseBtn',
  'cargoList',
  'fuel-warning',
  'toast',
  'intro'
];

describe('React GUI shell', () => {
  it('renders the DOM hooks required by the game runtime', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));

    for (const id of GAME_DOM_IDS) {
      expect(markup).toContain(`id="${id}"`);
    }
  });

  it('keeps the startup cargo HUD placeholder aligned with the balance default', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));

    expect(markup).toContain('0/10');
    expect(markup).toContain('Cargo value $0');
  });

  it('explains that sound is optional and permission-gated', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));

    expect(markup).toContain('Enable optional sound');
    expect(markup).toContain('Sound off — press Sound to enable');
    expect(markup).toContain('optional soundtrack starts only after the Sound button or a trusted tap/click');
  });
});
