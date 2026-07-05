import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MinerApp } from '../src/ui.jsx';

const GAME_DOM_IDS = [
  'shell',
  'game-panel',
  'game',
  'hud',
  'soundBtn',
  'cash',
  'depth',
  'fuel',
  'fuelLabel',
  'hull',
  'hullLabel',
  'cargo',
  'cargoLabel',
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
  });
});
