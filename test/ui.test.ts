import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MinerApp } from '../src/ui';
import { INFO_NAVIGATION_SECTIONS, getInfoNavigationSection } from '../src/info-navigation';

const GAME_DOM_IDS = [
  'shell',
  'game-panel',
  'game',
  'hud',
  'soundBtn',
  'soundStatus',
  'serviceStatus',
  'cash',
  'depth',
  'fuel',
  'fuelLabel',
  'hull',
  'hullLabel',
  'cargo',
  'cargoLabel',
  'objectiveStatus',
  'terrainScanner',
  'fuelReserve',
  'objectiveInfoStatus',
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
  'expeditionStats',
  'prospectingGuide',
  'dangerGuide',
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
    expect(markup).toContain('Objective: mine the starter Coal/Copper seam below the depot, then return to sell.');
    expect(markup).toContain('Cargo value $0');
  });

  it('renders objective and terrain scanner readout hooks in the HUD and Info / Cargo overlay', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));

    expect(markup).toContain('id="objectiveStatus"');
    expect(markup).toContain('class="objective-status"');
    expect(markup).toContain('id="terrainScanner"');
    expect(markup).toContain('class="terrain-scanner"');
    expect(markup).toContain('id="fuelReserve"');
    expect(markup).toContain('class="fuel-reserve"');
    expect(markup).toContain('Fuel reserve: SAFE — at depot');
    expect(markup).toContain('id="objectiveInfoStatus"');
    expect(markup).toContain('class="objective-info-status"');
  });

  it('renders an always-visible surface service status hook and startup copy', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));

    expect(markup).toContain('id="serviceStatus"');
    expect(markup).toContain('At depot: cargo empty, fuel full, hull repaired');
  });

  it('explains that sound is optional and permission-gated', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));

    expect(markup).toContain('Enable optional sound');
    expect(markup).toContain('Sound off — press Sound to enable');
    expect(markup).toContain('optional soundtrack starts only after the Sound button or a trusted tap/click');
  });

  it('renders prospecting guide copy from ore data', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));

    expect(markup).toContain('Prospecting Guide');
    expect(markup).toContain('Coal');
    expect(markup).toContain('$8');
    expect(markup).toContain('starter seam');
    expect(markup).toContain('Copper');
    expect(markup).toContain('≈50 m+');
    expect(markup).toContain('first Coal/Copper seam');
  });

  it('renders expedition stats hooks and fresh-career copy', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));

    expect(markup).toContain('Expedition Stats');
    expect(markup).toContain('id="expeditionStats"');
    expect(markup).toContain('Saved career progress');
    expect(markup).toContain('Max depth');
    expect(markup).toContain('Cash earned');
    expect(markup).toContain('Start digging to set a record');
  });

  it('renders the hazard and fiend survival guide with its stable hook', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));

    expect(markup).toContain('Hazard / Fiend Survival');
    expect(markup).toContain('id="dangerGuide"');
    expect(markup).toContain('Magma pockets');
    expect(markup).toContain('Dormant tunnel fiends');
    expect(markup).toContain('Motherlode core');
  });

  it('renders keyboard-operable navigation for every long Info / Cargo section', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));

    expect(markup).toContain('aria-label="Info sections"');
    for (const section of INFO_NAVIGATION_SECTIONS) {
      expect(getInfoNavigationSection(section.id)).toEqual(section);
      expect(markup).toContain(`data-info-section="${section.id}"`);
      expect(markup).toContain(`aria-controls="${section.id}"`);
      expect(markup).toContain(`id="${section.id}"`);
    }
    expect(getInfoNavigationSection('not-a-section')).toBeUndefined();
  });
});
