import React from 'react';
import { ECONOMY, STARTING } from './balance';
import { DEVELOPER_CASH_GRANT, DEVELOPER_SERVICES } from './developer';
import { ARTIFACTS, START_Y } from './constants';
import { buildDangerGuideRows } from './danger';
import { INFO_NAVIGATION_SECTIONS } from './info-navigation';
import { DEFAULT_SERVER_URL } from './net';
import { PROSPECTING_TIP, buildProspectingGuideRows } from './prospecting';
import { PLAYER_UPGRADES } from './upgrades';

const prospectingRows = buildProspectingGuideRows();
const dangerRows = buildDangerGuideRows();

const shopUpgrades = {
  cargo: { icon: 'cargo', purpose: 'Carry more ore before returning to sell.', unit: 'slots', price: ECONOMY.cargo.base },
  tank: { icon: 'tank', purpose: 'Extend safe range between depot refuels.', unit: 'fuel', price: ECONOMY.tank.base },
  hull: { icon: 'hull', purpose: 'Survive more rock, magma, and fiend damage.', unit: 'strength', price: ECONOMY.hull.base },
  drill: { icon: 'drill', purpose: 'Break tougher terrain and enemies faster.', unit: 'power', price: ECONOMY.drill.base },
  visibility: { icon: 'visibility', purpose: 'Reveal a larger persistent square around the ship. Even sizes extend one extra tile right and down.', unit: 'tiles wide', price: ECONOMY.visibility.base }
} as const;

export function MinerApp() {
  return (
    <main id="shell">
      <section id="game-panel" tabIndex={0} autoFocus>
        <canvas id="game" width={960} height={640} tabIndex={0} aria-label="Moleload mining game" />

        <div id="hud" aria-label="Game status and actions">
          <div className="hud-top">
            <button id="soundBtn" className="sound" aria-label="Enable optional sound" title="Enable optional sound">🔇</button>
            <span id="connectionStatus" className="connection-status hidden" aria-live="polite"></span>
          </div>

          <div className="stats-grid">
            <div className="stat"><span>Cash</span><strong id="cash">$0</strong></div>
            <div className="stat"><span>Depth</span><strong id="depth">0 m</strong></div>
          </div>

          <div className="bar-row">
            <div className="bar"><label>Fuel</label><meter id="fuel" min="0" max="100" value="100"></meter><span id="fuelLabel" className="bar-value">100/100</span></div>
            <div className="bar"><label>Hull</label><meter id="hull" min="0" max="100" value="100"></meter><span id="hullLabel" className="bar-value">100/100</span></div>
            <div className="bar"><label>Cargo</label><meter id="cargo" min="0" max={STARTING.cargoMax} value="0"></meter><span id="cargoLabel" className="bar-value">0/{STARTING.cargoMax}</span></div>
            <div id="extractionStatus" className="extraction-status hidden" aria-live="polite"></div>
          </div>

          <div className="shop">
            <button id="sell">Sell</button>
            <button id="shopBtn" className="shop-open-btn">Shop &amp; Equipment</button>
            <button id="dynamiteBtn" hidden>Detonate (E) · x0</button>
            <button id="teleporterBtn" hidden>Teleport (T) · x0</button>
            <button id="gunBtn" hidden>Arm Gun (G) · x0</button>
            <button id="infoBtn">Info / Cargo</button>
          </div>
        </div>

        <div id="shop-screen" className="hidden" role="dialog" aria-modal="true" aria-labelledby="shop-title">
          <div id="shop-card" className="shop-card">
            <div className="shop-header">
              <div>
                <p className="shop-kicker">Depot supply counter</p>
                <h2 id="shop-title">Shop &amp; Equipment</h2>
              </div>
              <button id="shopCloseBtn" className="close-btn" aria-label="Close shop">×</button>
            </div>
            <div className="shop-summary" aria-live="polite">
              <strong data-shop-cash>$60 available</strong>
              <span data-shop-location>Surface depot</span>
            </div>

            <section className="shop-section" aria-labelledby="shop-services-title">
              <div className="shop-section-heading"><h3 id="shop-services-title">Depot Services</h3><span>Pay what you have for a proportional partial service</span></div>
              <div className="shop-grid shop-grid-services">
                <article className="shop-item" data-shop-service="fuel">
                  <span className="equipment-icon icon-fuel" aria-hidden="true"><i></i></span>
                  <div className="shop-item-copy"><h4>Refuel</h4><p>Restore the current tank before descending.</p><strong data-shop-current>100/100 · full service $20</strong></div>
                  <span className="shop-state" data-shop-status>Full</span><button id="fuelBtn" type="button">Refuel · $20</button>
                </article>
                <article className="shop-item" data-shop-service="repair">
                  <span className="equipment-icon icon-repair" aria-hidden="true"><i></i></span>
                  <div className="shop-item-copy"><h4>Hull Repair</h4><p>Restore damage without changing maximum strength.</p><strong data-shop-current>100/100 · full service $30</strong></div>
                  <span className="shop-state" data-shop-status>Full</span><button id="repairBtn" type="button">Repair · $30</button>
                </article>
              </div>
            </section>

            <section className="shop-section" aria-labelledby="shop-upgrades-title">
              <div className="shop-section-heading"><h3 id="shop-upgrades-title">Permanent Upgrades</h3><span>Installed permanently · prices rise by level</span></div>
              <div className="shop-grid">
                {PLAYER_UPGRADES.map(upgrade => {
                  const display = shopUpgrades[upgrade.id];
                  const maxLevel = Math.ceil((upgrade.max - upgrade.start) / upgrade.step);
                  return (
                    <article key={upgrade.id} className="shop-item" data-shop-upgrade={upgrade.id}>
                      <span className={`equipment-icon icon-${display.icon}`} aria-hidden="true"><i></i></span>
                      <div className="shop-item-copy"><h4>{upgrade.label}</h4><p>{display.purpose}</p><strong data-shop-current>Level 0/{maxLevel} · {upgrade.start}/{upgrade.max} {display.unit}</strong><span data-shop-benefit>Next: {upgrade.start} → {upgrade.start + upgrade.step} {display.unit}</span></div>
                      <span className="shop-state" data-shop-status>Need ${display.price - STARTING.cash}</span><button id={`${upgrade.id}Btn`} type="button">Buy · ${display.price}</button>
                    </article>
                  );
                })}
              </div>
              <div className="shop-grid shop-gun-grid">
                <article className="shop-item" data-shop-gun>
                  <span className="equipment-icon icon-gun" aria-hidden="true"><i></i></span>
                  <div className="shop-item-copy"><h4>Linebreaker Gun</h4><p>Permanent precision weapon. Fires one round up to {ECONOMY.gun.range} tiles; rock, depot structure, boundaries, and Motherlode are protected.</p><strong data-shop-current>Not owned · Ammo: 0</strong><span>Control: <kbd>G</kbd>, then a direction · <kbd>G</kbd>/<kbd>Esc</kbd> cancels</span></div>
                  <span className="shop-state" data-shop-status>Need ${ECONOMY.gun.price - STARTING.cash}</span><button id="shopGunBtn" type="button">Buy · ${ECONOMY.gun.price}</button>
                </article>
              </div>
            </section>

            <section className="shop-section" aria-labelledby="shop-equipment-title">
              <div className="shop-section-heading"><h3 id="shop-equipment-title">Consumable Equipment</h3><span>Each use spends one carried item</span></div>
              <div className="shop-grid">
                <article className="shop-item" data-shop-item="dynamite">
                  <span className="equipment-icon icon-dynamite" aria-hidden="true"><i></i></span>
                  <div className="shop-item-copy"><h4>Dynamite</h4><p>Clears nearby terrain underground. Destroys ore and artifacts without rewards.</p><strong data-shop-current>Carried: 0</strong><span>Control: <kbd>E</kbd> or Detonate</span></div>
                  <span className="shop-state" data-shop-status>Ready</span><button id="shopDynamiteBtn" type="button">Buy one · ${ECONOMY.dynamite.price}</button>
                </article>
                <article className="shop-item" data-shop-item="teleporter">
                  <span className="equipment-icon icon-teleporter" aria-hidden="true"><i></i></span>
                  <div className="shop-item-copy"><h4>Teleporter</h4><p>Emergency round trip from 100 m or deeper to the depot without unloading or servicing the ship.</p><strong data-shop-current>Carried: 0</strong><span>Control: <kbd>T</kbd> or Teleport / Return</span></div>
                  <span className="shop-state" data-shop-status>Need ${ECONOMY.teleporter.price - STARTING.cash}</span><button id="shopTeleporterBtn" type="button">Buy one · ${ECONOMY.teleporter.price}</button>
                </article>
                <article className="shop-item" data-shop-item="bullets">
                  <span className="equipment-icon icon-bullets" aria-hidden="true"><i></i></span>
                  <div className="shop-item-copy"><h4>Gun Ammunition</h4><p>Six precision rounds. Requires the permanent Linebreaker Gun.</p><strong data-shop-current>Ammo: 0 · +{ECONOMY.gun.ammoBundle} per bundle</strong><span>Arm with <kbd>G</kbd>, then press or tap a direction</span></div>
                  <span className="shop-state" data-shop-status>Gun required</span><button id="shopBulletsBtn" type="button">Buy {ECONOMY.gun.ammoBundle} · ${ECONOMY.gun.ammoPrice}</button>
                </article>
              </div>
            </section>
          </div>
        </div>

        <div id="info-screen" className="hidden" role="dialog" aria-modal="true" aria-labelledby="info-title">
          <div id="info-card" className="info-card">
            <div className="info-header">
              <h2 id="info-title">Cargo &amp; Controls</h2>
              <button id="infoCloseBtn" className="close-btn" aria-label="Close info screen">×</button>
            </div>
            <nav className="info-navigation" aria-label="Info sections" role="tablist" aria-orientation="horizontal">
              {INFO_NAVIGATION_SECTIONS.map((section, index) => (
                <button key={section.id} id={section.tabId} type="button" role="tab" data-info-section={section.id} aria-controls={section.id} aria-selected={index === 0} tabIndex={index === 0 ? 0 : -1}>
                  {section.label}
                </button>
              ))}
            </nav>
            <section id="info-objective" role="tabpanel" aria-labelledby="info-tab-objective" tabIndex={-1}>
              <h3 id="cargo-bay-title">Cargo Bay</h3>
              <p id="objectiveInfoStatus" className="objective-info-status">Objective: mine the starter Coal/Copper seam below the depot, then return to sell.</p>
              <p id="extractionInfoStatus" className="extraction-info-status">Crack the Motherlode core at 10,000 m, then return alive to the surface depot to complete extraction.</p>
              <ul id="cargoList" className="cargo-detail-list"><li className="empty-cargo">Empty</li></ul>
            </section>
            <section id="info-stats" role="tabpanel" aria-labelledby="info-tab-stats" tabIndex={-1} hidden>
              <h3 id="expedition-stats-title">Expedition Stats</h3>
              <ul id="expeditionStats" className="expedition-stats" aria-label="Saved career progress">
                <li>
                  <span className="stat-label">Max depth</span>
                  <strong>0 m</strong>
                  <span className="stat-detail">Start digging to set a record</span>
                </li>
                <li>
                  <span className="stat-label">Cash earned</span>
                  <strong>$0</strong>
                  <span className="stat-detail">Sell your first haul to begin</span>
                </li>
              </ul>
            </section>
            <section id="info-developer" className="developer-section" role="tabpanel" aria-labelledby="info-tab-developer" tabIndex={-1} hidden>
              <h3 id="developer-title">Debug / Developer</h3>
              <p className="developer-warning"><strong>Developer actions:</strong> grant local-player cash, restore fuel or hull, or permanently grant normal player upgrades for exactly $0. These controls work above or below the surface and do not change shop prices.</p>
              <div id="developerUpgrades" className="developer-upgrades" aria-label="Free developer upgrade controls">
                <div className="developer-upgrade">
                  <div>
                    <strong>Money Cheat</strong>
                    <span>Local player only</span>
                  </div>
                  <button type="button" data-developer-cash>Developer: Grant +${DEVELOPER_CASH_GRANT.toLocaleString('en-US')}</button>
                </div>
                {DEVELOPER_SERVICES.map(service => (
                  <div key={service.id} className="developer-upgrade" data-developer-service-row={service.id}>
                    <div>
                      <strong>{service.label}</strong>
                      <span data-developer-service-level>{service.resourceLabel} 100/100</span>
                    </div>
                    <button type="button" data-developer-service={service.id} disabled>Developer: {service.label} (already full)</button>
                  </div>
                ))}
                {PLAYER_UPGRADES.map(upgrade => {
                  const maxLevel = Math.ceil((upgrade.max - upgrade.start) / upgrade.step);
                  return (
                    <div key={upgrade.id} className="developer-upgrade" data-upgrade-row={upgrade.id}>
                      <div>
                        <strong>{upgrade.label}</strong>
                        <span data-upgrade-level>Level 0/{maxLevel} · {upgrade.start}/{upgrade.max}</span>
                      </div>
                      <button type="button" data-developer-upgrade={upgrade.id}>Developer: Grant {upgrade.label} +{upgrade.step} · $0</button>
                    </div>
                  );
                })}
              </div>
              <div className="player-data-reset" aria-labelledby="player-data-reset-title">
                <h3 id="player-data-reset-title">Player Data</h3>
                <p>Start this player over without regenerating or repairing the shared mine terrain. Your saved relay URL is also preserved.</p>
                <button id="resetPlayerDataBtn" type="button">Reset All Player Data</button>
              </div>
              <div className="world-state-reset" aria-labelledby="world-state-reset-title">
                <h3 id="world-state-reset-title">Shared World State</h3>
                <p>Regenerate terrain and world enemies for this mine without changing any player's cash, upgrades, inventory, stats, ship condition, or settings. Explored fog is cleared so regenerated terrain is not revealed.</p>
                <button id="resetWorldStateBtn" type="button">Reset World State</button>
              </div>
            </section>
            <section id="info-prospecting" role="tabpanel" aria-labelledby="info-tab-prospecting" tabIndex={-1} hidden>
              <h3 id="prospecting-title">Prospecting Guide</h3>
              <p className="prospecting-tip">{PROSPECTING_TIP}</p>
              <p className="prospecting-tip"><strong>Rare artifacts:</strong> drill them for immediate cash. They never use cargo, need no surface sale, and dynamite destroys them without payout.</p>
              <ul className="prospecting-guide" aria-label="Rare artifact values and depth bands">
                {ARTIFACTS.map(artifact => (
                  <li key={artifact.name}>
                    <span className="ore-icon" style={{ background: artifact.color }} aria-hidden="true"></span>
                    <span className="ore-name">{artifact.name}</span>
                    <span className="ore-value">${artifact.value} cash now</span>
                    <span className="ore-depth">{(artifact.min - START_Y) * 10}-{(artifact.max - START_Y) * 10} m</span>
                  </li>
                ))}
              </ul>
              <ul id="prospectingGuide" className="prospecting-guide" aria-label="Ore values and approximate depth bands">
                {prospectingRows.map(row => (
                  <li key={row.name}>
                    <span className="ore-icon" style={{ background: row.color }} aria-hidden="true"></span>
                    <span className="ore-name">{row.name}</span>
                    <span className="ore-value">{row.valueLabel}</span>
                    <span className="ore-depth">{row.depthLabel}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section id="info-hazards" role="tabpanel" aria-labelledby="info-tab-hazards" tabIndex={-1} hidden>
              <h3 id="danger-guide-title">Hazard / Fiend Survival</h3>
              <p className="danger-guide-tip">Plan a return route before the mine gets hostile: deep rewards bring rock, magma, and tunnel fiends.</p>
              <ul id="dangerGuide" className="danger-guide" aria-label="Hazard and tunnel fiend survival guide">
                {dangerRows.map(row => (
                  <li key={row.title}>
                    <strong>{row.title}</strong>
                    <span>{row.detail}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section id="info-controls" role="tabpanel" aria-labelledby="info-tab-controls" tabIndex={-1} hidden>
              <h3 id="controls-title">Controls</h3>
              <ul className="control-list">
                <li><kbd>WASD</kbd> / <kbd>Arrows</kbd><span>Move, fly, and dig</span></li>
                <li><strong>Fog map</strong><span>Movement permanently reveals the sensor footprint. Co-op miners share explored tiles.</span></li>
                <li><kbd>Shift</kbd> + movement<span>Sprint through open space at increased fuel cost; open-space descent is free and drilling stays normal</span></li>
                <li><kbd>Tap / hold</kbd><span>Move toward the touched side of the ship</span></li>
                <li><kbd>Enter</kbd><span>Sell cargo at the surface depot</span></li>
                <li><kbd>Space</kbd><span>Repair or refuel at the surface</span></li>
                <li><kbd>E</kbd> / <kbd>Detonate</kbd><span>Use one carried dynamite underground; blasts yield no cargo, and destroyed artifacts grant no cash</span></li>
                <li><kbd>T</kbd> / <kbd>Teleport</kbd><span>At 100 m or deeper, use one carried teleporter to visit the depot, then press T again to return to the same underground location</span></li>
                <li><kbd>G</kbd> then direction / <kbd>Arm Gun</kbd> then tap<span>Fire one bullet up to {ECONOMY.gun.range} tiles; press G or Escape to cancel aiming. Shots destroy the first eligible block or enemy, but valuables give no cargo or artifact cash.</span></li>
                <li><kbd>R</kbd> then <kbd>R</kbd><span>Confirm reset while alive</span></li>
              </ul>
            </section>
          </div>
        </div>

        <div id="fuel-warning" role="alert">⚠ LOW FUEL — return to the surface</div>
        <div id="toast" role="status"></div>
        <div id="lobby-screen" role="dialog" aria-modal="true" aria-labelledby="lobby-title">
          <div className="lobby-card">
            <p className="lobby-kicker">Co-op dispatch</p>
            <h2 id="lobby-title">Choose your shift</h2>
            <p className="lobby-copy">Connect to a local relay to pair with one fellow miner, or launch a solo expedition.</p>
            <label className="lobby-server-url" htmlFor="serverUrl">Relay server URL
              <input id="serverUrl" type="url" defaultValue={DEFAULT_SERVER_URL} spellCheck={false} autoComplete="off" />
            </label>
            <span id="lobbyConnectionStatus" className="connection-status" aria-live="polite">Disconnected</span>
            <div className="lobby-actions">
              <button id="connectBtn" type="button">Connect</button>
              <button id="soloBtn" type="button">Play solo</button>
            </div>
          </div>
        </div>
        <div id="intro" role="button" tabIndex={0} aria-label="Press screen to start Moleload">
          <div className="intro-card">
            <div className="soviet-badge" aria-hidden="true">
              <div className="lenin-face">
                <div className="lenin-hair"></div>
                <div className="lenin-brow left"></div><div className="lenin-brow right"></div>
                <div className="lenin-eye left"></div><div className="lenin-eye right"></div>
                <div className="lenin-nose"></div>
                <div className="lenin-moustache"></div>
                <div className="lenin-beard"></div>
              </div>
              <div className="badge-star">★</div>
            </div>
            <div className="intro-copy">
              <p className="intro-kicker">Workers of the mine, unite!</p>
              <h2>Moleload</h2>
              <p className="intro-cta">Press the screen to start</p>
              <ul className="intro-rules">
                <li><strong>Move &amp; dig:</strong> WASD / arrows, or tap around the ship.</li>
                <li><strong>Make money:</strong> mine ore, return to surface, press Sell or Enter. Space repairs/refuels.</li>
                <li><strong>Dynamite:</strong> buy charges at the depot, then press E or Detonate underground to clear terrain.</li>
                <li><strong>Teleporter:</strong> buy one at the depot, then press T or Teleport at 100 m or deeper for an emergency round trip.</li>
                <li><strong>Gun:</strong> buy the permanent gun and bullet bundles, then press G and a direction; touch players use Arm Gun then tap a direction.</li>
                <li><strong>Do not die:</strong> deep magma pockets, tougher rock, and tunnel fiends scale with depth.</li>
                <li><strong>Enemies:</strong> drilling nearby blocks wakes them; drill them back before they chew the hull.</li>
                <li><strong>Goal:</strong> reach the Motherlode core at 10,000 m, crack it, and get home alive. The mine continues below it.</li>
                <li><strong>Upgrade:</strong> prices rise, so choose tank, hull, cargo, drill, and sensor upgrades carefully.</li>
                <li><strong>Sound:</strong> optional soundtrack starts only after the Sound button or a trusted tap/click.</li>
              </ul>
              <p className="intro-warning">Low fuel below 25% means return to the surface immediately.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
