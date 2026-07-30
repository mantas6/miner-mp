import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MinerApp } from '../src/ui';
import { INFO_NAVIGATION_SECTIONS, getInfoNavigationSection, getInfoNavigationSections } from '../src/info-navigation';

const GAME_DOM_IDS = [
  'shell',
  'game-panel',
  'game',
  'hud',
  'soundBtn',
  'connectionStatus',
  'cash',
  'depth',
  'fuel',
  'fuelLabel',
  'hull',
  'hullLabel',
  'cargo',
  'cargoLabel',
  'extractionStatus',
  'objectiveInfoStatus',
  'extractionInfoStatus',

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
  'gunBtn',
  'shopDynamiteBtn',
  'shopTeleporterBtn',
  'shopGunBtn',
  'shopBulletsBtn',
  'infoBtn',
  'info-screen',
  'info-card',
  'infoCloseBtn',
  'cargoList',
  'expeditionStats',
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
    expect(markup).toContain('Objective: mine the starter Coal/Copper seam below the depot, then return to sell.');
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
    expect(markup).toContain('At 100 m or deeper');
    expect(markup).toContain('without unloading or servicing the ship');
  });

  it('shows permanent gun ownership, prerequisite ammunition, and keyboard/touch instructions', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));
    expect(markup).toContain('data-shop-gun="true"');
    expect(markup).toContain('Buy · $1500');
    expect(markup).toContain('data-shop-item="bullets"');
    expect(markup).toContain('Buy 6 · $120');
    expect(markup).toContain('<kbd>G</kbd>, then a direction');
    expect(markup).toContain('touch players use Arm Gun then tap a direction');
    expect(markup).toContain('up to 8 tiles');
  });

  it('explains that sprinting only applies in open space', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));

    expect(markup).toContain('Sprint through open space at increased fuel cost; open-space descent is free and drilling stays normal');
  });

  it('keeps objective and extraction context on demand while leaving the HUD to live instruments', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));

    expect(markup).not.toContain('id="objectiveStatus"');
    expect(markup).not.toContain('id="terrainScanner"');
    expect(markup).not.toContain('id="fuelReserve"');
    expect(markup).not.toContain('id="depthMilestone"');
    expect(markup).not.toContain('id="cargoFeedback"');
    expect(markup).not.toContain('id="serviceStatus"');
    expect(markup).toContain('id="objectiveInfoStatus"');
    expect(markup).toContain('class="objective-info-status"');
    expect(markup).toContain('id="extractionStatus"');
    expect(markup).toContain('class="extraction-status hidden"');
    expect(markup).toContain('id="extractionInfoStatus"');
    expect(markup).toContain('return alive to the surface depot to complete extraction');
  });

  it('keeps sound optional and permission-gated without a persistent status label', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));

    expect(markup).toContain('Enable optional sound');
    expect(markup).not.toContain('id="soundStatus"');
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

  it('omits all developer tabs, cheats, and reset actions for normal players', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));

    expect(markup).not.toContain('id="info-developer"');
    expect(markup).not.toContain('id="info-tab-developer"');
    expect(markup).not.toContain('id="developerUpgrades"');
    expect(markup).not.toContain('Money Cheat');
    expect(markup).not.toContain('data-developer-cash');
    expect(markup).not.toContain('data-developer-service');
    expect(markup).not.toContain('data-developer-upgrade');
    expect(markup).not.toContain('id="resetPlayerDataBtn"');
    expect(markup).not.toContain('id="resetWorldStateBtn"');
  });

  it('renders clearly isolated developer tools only in explicit opt-in mode', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp, { developerToolsEnabled: true }));

    expect(markup).toContain('id="info-developer"');
    expect(markup).toContain('Dev tools (local)');
    expect(markup).toContain('Development-only tooling');
    expect(markup).toContain('Local non-player tools');
    expect(markup).toContain('Money Cheat');
    expect(markup).toContain('data-developer-cash="true"');
    expect(markup).toContain('data-developer-service="fuel"');
    expect(markup).toContain('data-developer-service="hull"');
    expect(markup).toContain('data-developer-upgrade="cargo"');
    expect(markup).toContain('id="resetPlayerDataBtn"');
    expect(markup).toContain('id="resetWorldStateBtn"');
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

  it('renders actual accessible tabs and paired one-at-a-time panels for every Info / Cargo section', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp));

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-orientation="horizontal"');
    for (const section of INFO_NAVIGATION_SECTIONS) {
      expect(getInfoNavigationSection(section.id)).toEqual(section);
      expect(markup).toContain(`id="${section.tabId}"`);
      expect(markup).toContain(`data-info-section="${section.id}"`);
      expect(markup).toContain(`aria-controls="${section.id}"`);
      expect(markup).toMatch(new RegExp(`id="${section.id}"[^>]*role="tabpanel"[^>]*aria-labelledby="${section.tabId}"`));
    }
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('aria-selected="false"');
    expect(getInfoNavigationSection('not-a-section')).toBeUndefined();
  });

  it('keeps opted-in reset actions inside the development-only panel', () => {
    const markup = renderToStaticMarkup(React.createElement(MinerApp, { developerToolsEnabled: true }));
    const developerPanel = markup.slice(markup.indexOf('<section id="info-developer"'), markup.indexOf('<section id="info-prospecting"'));

    expect(developerPanel).toContain('id="resetPlayerDataBtn"');
    expect(developerPanel).toContain('Reset All Player Data');
    expect(developerPanel).toContain('shared mine terrain');
    expect(developerPanel).toContain('class="world-state-reset"');
    expect(developerPanel).toContain('id="resetWorldStateBtn"');
    expect(developerPanel).toContain('without changing any player&#x27;s cash, upgrades, inventory, stats, ship condition, or settings');
    expect(developerPanel.indexOf('id="resetWorldStateBtn"')).toBeGreaterThan(developerPanel.indexOf('id="resetPlayerDataBtn"'));
    expect(getInfoNavigationSections(true).some(section => section.id === 'info-developer')).toBe(true);
  });
});
