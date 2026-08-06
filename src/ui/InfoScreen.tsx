import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ARTIFACTS, START_Y } from '../../shared/constants';
import { ECONOMY } from '../core/balance';
import { buildDangerGuideRows } from '../core/danger';
import { PROSPECTING_TIP, buildProspectingGuideRows } from '../core/prospecting';
import { DeveloperPanel } from './DeveloperPanel';
import { getInfoNavigationSections, getInfoTabFocusTarget } from './info-navigation';
import { uiCommands } from './commands';
import { uiStore, useUiStore } from './store';
import styles from './InfoScreen.module.css';

const prospectingRows = buildProspectingGuideRows();
const dangerRows = buildDangerGuideRows();

/**
 * Cargo, stats, guides and controls as a native modal dialog: the browser keeps
 * focus inside it, so there is no hand-rolled focus trap here. Tab selection is
 * still a WAI-ARIA tablist with roving focus.
 */
export function InfoScreen({developerToolsEnabled = false}: {developerToolsEnabled?: boolean}) {
  const open = useUiStore(state => state.infoOpen);
  const activeTab = useUiStore(state => state.infoTab);
  const objective = useUiStore(state => state.hud.objective);
  const extractionInfo = useUiStore(state => state.hud.extractionInfo);
  const cargoRows = useUiStore(state => state.cargoRows);
  const statRows = useUiStore(state => state.statRows);
  const sections = getInfoNavigationSections(developerToolsEnabled);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      closeRef.current?.focus({preventScroll: true});
    } else if (!open && dialog.open) {
      dialog.close();
      document.getElementById('infoBtn')?.focus({preventScroll: true});
    }
  }, [open]);

  // Every tab starts at the top of the card, as the imperative version did.
  useEffect(() => {
    if (cardRef.current) cardRef.current.scrollTop = 0;
  }, [activeTab]);

  function selectTab(id: string): void {
    uiStore.getState().setInfoTab(id);
    document.getElementById(sections.find(section => section.id === id)?.tabId ?? '')?.focus({preventScroll: true});
  }

  function onTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, id: string): void {
    const key = event.key.toLowerCase();
    if (key === 'enter' || key === ' ') {
      selectTab(id);
      event.preventDefault();
      return;
    }
    const target = getInfoTabFocusTarget(id, key, developerToolsEnabled);
    if (!target) return;
    document.getElementById(target.tabId)?.focus({preventScroll: true});
    event.preventDefault();
  }

  return (
    <dialog
      id="info-screen"
      ref={dialogRef}
      className={styles.screen}
      aria-labelledby="info-title"
      // A native close request (Escape reaching the UA, a form submit) must not
      // leave the store thinking the info screen is still open.
      onClose={() => uiCommands.closeInfo()}
      onPointerDown={event => { if (event.target === dialogRef.current) uiCommands.closeInfo(); }}
    >
      <div id="info-card" ref={cardRef} className={styles.card}>
        <div className={styles.header}>
          <h2 id="info-title">Cargo &amp; Controls</h2>
          <button
            id="infoCloseBtn"
            ref={closeRef}
            className={styles.closeBtn}
            aria-label="Close info screen"
            onClick={event => { event.stopPropagation(); uiCommands.closeInfo(); }}
          >×</button>
        </div>
        <div className={styles.navigation} aria-label="Info sections" role="tablist" aria-orientation="horizontal">
          {sections.map(section => (
            <button
              key={section.id}
              id={section.tabId}
              type="button"
              role="tab"
              data-info-section={section.id}
              aria-controls={section.id}
              aria-selected={section.id === activeTab}
              tabIndex={section.id === activeTab ? 0 : -1}
              onClick={() => selectTab(section.id)}
              onKeyDown={event => onTabKeyDown(event, section.id)}
            >{section.label}</button>
          ))}
        </div>

        <section id="info-objective" role="tabpanel" aria-labelledby="info-tab-objective" tabIndex={-1} hidden={activeTab !== 'info-objective'}>
          <h3 id="cargo-bay-title">Cargo Bay</h3>
          <p id="objectiveInfoStatus" className={styles.objectiveStatus}>{objective}</p>
          <p id="extractionInfoStatus" className={styles.extractionStatus}>{extractionInfo}</p>
          <ul id="cargoList" className={styles.cargoList}>
            {cargoRows.length === 0
              ? <li className={styles.emptyCargo}>Cargo bay empty</li>
              : cargoRows.map(row => (
                <li key={row.name}>
                  <span className={styles.oreIcon} style={{background: row.color}}></span>
                  <span className={styles.oreName}>{row.name}</span>
                  <span className={styles.oreCount}>× {row.count}</span>
                  <span className={styles.oreValue}>${row.value}</span>
                </li>
              ))}
          </ul>
        </section>

        <section id="info-stats" role="tabpanel" aria-labelledby="info-tab-stats" tabIndex={-1} hidden={activeTab !== 'info-stats'}>
          <h3 id="expedition-stats-title">Expedition Stats</h3>
          <ul id="expeditionStats" className={styles.expeditionStats} aria-label="Saved career progress">
            {statRows.map(row => (
              <li key={row.label}>
                <span className={styles.statLabel}>{row.label}</span>
                <strong>{row.value}</strong>
                <span className={styles.statDetail}>{row.detail}</span>
              </li>
            ))}
          </ul>
        </section>

        {developerToolsEnabled && <DeveloperPanel hidden={activeTab !== 'info-developer'} />}

        <section id="info-prospecting" role="tabpanel" aria-labelledby="info-tab-prospecting" tabIndex={-1} hidden={activeTab !== 'info-prospecting'}>
          <h3 id="prospecting-title">Prospecting Guide</h3>
          <p className={styles.prospectingTip}>{PROSPECTING_TIP}</p>
          <p className={styles.prospectingTip}><strong>Rare artifacts:</strong> drill them for immediate cash. They never use cargo, need no surface sale, and dynamite destroys them without payout.</p>
          <ul className={styles.prospectingGuide} aria-label="Rare artifact values and depth bands">
            {ARTIFACTS.map(artifact => (
              <li key={artifact.name}>
                <span className={styles.oreIcon} style={{background: artifact.color}} aria-hidden="true"></span>
                <span className={styles.oreName}>{artifact.name}</span>
                <span className={styles.oreValue}>${artifact.value} cash now</span>
                <span className={styles.oreDepth}>{(artifact.min - START_Y) * 10}-{(artifact.max - START_Y) * 10} m</span>
              </li>
            ))}
          </ul>
          <ul id="prospectingGuide" className={styles.prospectingGuide} aria-label="Ore values and approximate depth bands">
            {prospectingRows.map(row => (
              <li key={row.name}>
                <span className={styles.oreIcon} style={{background: row.color}} aria-hidden="true"></span>
                <span className={styles.oreName}>{row.name}</span>
                <span className={styles.oreValue}>{row.valueLabel}</span>
                <span className={styles.oreDepth}>{row.depthLabel}</span>
              </li>
            ))}
          </ul>
        </section>

        <section id="info-hazards" role="tabpanel" aria-labelledby="info-tab-hazards" tabIndex={-1} hidden={activeTab !== 'info-hazards'}>
          <h3 id="danger-guide-title">Hazard / Fiend Survival</h3>
          <p className={styles.dangerTip}>Plan a return route before the mine gets hostile: deep rewards bring rock, magma, and tunnel fiends.</p>
          <ul id="dangerGuide" className={styles.dangerGuide} aria-label="Hazard and tunnel fiend survival guide">
            {dangerRows.map(row => (
              <li key={row.title}>
                <strong>{row.title}</strong>
                <span>{row.detail}</span>
              </li>
            ))}
          </ul>
        </section>

        <section id="info-controls" role="tabpanel" aria-labelledby="info-tab-controls" tabIndex={-1} hidden={activeTab !== 'info-controls'}>
          <h3 id="controls-title">Controls</h3>
          <ul className={styles.controlList}>
            <li><kbd>WASD</kbd> / <kbd>Arrows</kbd><span>Move, fly, and dig</span></li>
            <li><strong>Fog map</strong><span>Movement permanently reveals the sensor footprint. Co-op miners share explored tiles.</span></li>
            <li><kbd>Shift</kbd> + movement<span>Sprint through open space at increased fuel cost; open-space descent is free and drilling stays normal. Slamming a boosted ship into rock, a ceiling, or a wall buckles the hull.</span></li>
            <li><kbd>Enter</kbd><span>Sell cargo at the surface depot</span></li>
            <li><kbd>Space</kbd><span>Repair or refuel at the surface</span></li>
            <li><kbd>E</kbd> / <kbd>Detonate</kbd><span>Use one carried dynamite underground; blasts yield no cargo, and destroyed artifacts grant no cash</span></li>
            <li><kbd>T</kbd> / <kbd>Teleport</kbd><span>At 100 m or deeper, use one carried teleporter to visit the depot, then press T again to return to the same underground location</span></li>
            <li><kbd>G</kbd> / <kbd>Arm Gun</kbd> then a direction key<span>Fire one bullet up to {ECONOMY.gun.range} tiles; press G or Escape to cancel aiming. Shots destroy the first eligible block or enemy, but valuables give no cargo or artifact cash.</span></li>
            <li><kbd>R</kbd> then <kbd>R</kbd><span>Confirm reset while alive</span></li>
          </ul>
        </section>
      </div>
    </dialog>
  );
}
