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
  'connectionStatus',
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
  'depthMilestone',
  'extractionStatus',
  'objectiveInfoStatus',
  'extractionInfoStatus',
  'cargoFeedback',
  'sell',
  'shopBtn',
  'shop-screen',
  'shop-card',
  'shopCloseBtn',
  'fuelBtn',
  'repairBtn',
  'cargoBtn',
  'tankBtn',
  'hullBtn',
  'drillBtn',
  'visibilityBtn',
  'dynamiteBtn',
  'teleporterBtn',
  'shopDynamiteBtn',
  'shopTeleporterBtn',
  'infoBtn',
  'info-screen',
  'info-card',
  'infoCloseBtn',
  'cargoList',
  'expeditionStats',
  'developerUpgrades',
  'prospectingGuide',
  'dangerGuide',
  'fuel-warning',
  'toast',
  'lobby-screen',
  'serverUrl',
  'lobbyConnectionStatus',
  'connectBtn',
  'soloBtn',
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
    expect(markup).toContain('Cargo +5 $120');
    expect(markup).toContain('Objective: mine the starter Coal/Copper seam below the depot, then return to sell.');
    expect(markup).toContain('Cargo value $0');
  });

  it('offers hull reinforcement alongside the other ship upgrades', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));

    expect(markup).toContain('id="hullBtn"');
    expect(markup).toContain('data-shop-upgrade="hull"');
    expect(markup).toContain('Next: 100 → 120 strength');
    expect(markup).toContain('Buy · $180');
    expect(markup).toContain('choose tank, hull, cargo, drill, and sensor upgrades carefully');
  });

  it('exposes dynamite purchasing and keyboard/touch detonation controls', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));

    expect(markup).toContain('id="dynamiteBtn"');
    expect(markup).toContain('data-shop-item="dynamite"');
    expect(markup).toContain('Buy one · $50');
    expect(markup).toContain('<kbd>E</kbd>');
    expect(markup).toContain('blasts yield no cargo');
  });

  it('exposes teleporter purchasing, inventory, and desktop/mobile use controls', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));

    expect(markup).toContain('id="teleporterBtn"');
    expect(markup).toContain('data-shop-item="teleporter"');
    expect(markup).toContain('Buy one · $250');
    expect(markup).toContain('<kbd>T</kbd>');
    expect(markup).toContain('without unloading or servicing the ship');
  });

  it('explains that sprinting only applies in open space', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));

    expect(markup).toContain('Sprint through open space at increased fuel cost; open-space descent is free and drilling stays normal');
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
    expect(markup).toContain('id="depthMilestone"');
    expect(markup).toContain('class="depth-milestone"');
    expect(markup).toContain('Depth target: starter Coal/Copper seam — 50 m deeper.');
    expect(markup).toContain('id="objectiveInfoStatus"');
    expect(markup).toContain('class="objective-info-status"');
    expect(markup).toContain('id="extractionStatus"');
    expect(markup).toContain('class="extraction-status hidden"');
    expect(markup).toContain('id="extractionInfoStatus"');
    expect(markup).toContain('return alive to the surface depot to complete extraction');
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
    expect(markup).toContain('starter–≈1800 m');
    expect(markup).toContain('Copper');
    expect(markup).toContain('≈50–3200 m');
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

  it('keeps clearly labeled developer upgrade controls visible in the info modal', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));

    expect(markup).toContain('id="info-developer"');
    expect(markup).toContain('Debug / Developer');
    expect(markup).toContain('permanently grant normal player upgrades for exactly $0');
    expect(markup).toContain('data-developer-upgrade="cargo"');
    expect(markup).toContain('data-developer-upgrade="tank"');
    expect(markup).toContain('data-developer-upgrade="hull"');
    expect(markup).toContain('data-developer-upgrade="drill"');
    expect(markup).toContain('data-developer-upgrade="visibility"');
    expect(markup).toContain('Level 0/198');
  });

  it('offers the paid sensor upgrade and explains persistent shared fog', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));
    expect(markup).toContain('data-shop-upgrade="visibility"');
    expect(markup).toContain('Sensor Array');
    expect(markup).toContain('Next: 3 → 4 tiles wide');
    expect(markup).toContain('Buy · $175');
    expect(markup).toContain('Co-op miners share explored tiles');
  });

  it('separates surface services, permanent upgrades, and consumable equipment in a modal shop', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));

    expect(markup).toContain('id="shop-screen" class="hidden" role="dialog" aria-modal="true"');
    expect(markup).toContain('Shop &amp; Equipment');
    expect(markup).toContain('Depot Services');
    expect(markup).toContain('Permanent Upgrades');
    expect(markup).toContain('Consumable Equipment');
    expect(markup).toContain('Pay what you have for a proportional partial service');
    expect(markup).toContain('Control: <kbd>E</kbd> or Detonate');
    expect(markup).toContain('Control: <kbd>T</kbd> or Teleport');
  });

  it('keeps purchase actions out of the compact surface action bar', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));
    const actionBar = markup.match(/<div class="shop">([\s\S]*?)<\/div>/)?.[1];

    expect(actionBar).toContain('id="shopBtn"');
    expect(actionBar).not.toContain('id="cargoBtn"');
    expect(actionBar).not.toContain('id="fuelBtn"');
    expect(actionBar).not.toContain('Buy one');
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
