import React from 'react';

export function MinerApp() {
  return (
    <main id="shell">
      <section id="game-panel" tabIndex={0} autoFocus>
        <canvas id="game" width={960} height={640} tabIndex={0} aria-label="Moleload mining game" />

        <div id="hud" aria-label="Game status and actions">
          <div className="hud-top">
            <button id="soundBtn" className="sound" aria-label="Enable optional sound" title="Enable optional sound">🔇</button>
            <span id="soundStatus" className="sound-status" aria-live="polite">Sound off — press Sound to enable</span>
          </div>

          <div className="stats-grid">
            <div className="stat"><span>Cash</span><strong id="cash">$0</strong></div>
            <div className="stat"><span>Depth</span><strong id="depth">0 m</strong></div>
          </div>

          <div className="bar-row">
            <div className="bar"><label>Fuel</label><meter id="fuel" min="0" max="100" value="100"></meter><span id="fuelLabel" className="bar-value">100/100</span></div>
            <div className="bar"><label>Hull</label><meter id="hull" min="0" max="100" value="100"></meter><span id="hullLabel" className="bar-value">100/100</span></div>
            <div className="bar"><label>Cargo</label><meter id="cargo" min="0" max="100" value="0"></meter><span id="cargoLabel" className="bar-value">0/10</span></div>
            <div id="cargoFeedback" className="cargo-feedback" aria-live="polite">Cargo value $0 · Next Cargo +10 $120 (need $120 more)</div>
          </div>

          <div className="shop">
            <button id="sell">Sell</button>
            <button id="fuelBtn">Refuel $20</button>
            <button id="repairBtn">Repair $30</button>
            <button id="cargoBtn">Cargo +10 $120</button>
            <button id="tankBtn">Tank +20 $150</button>
            <button id="drillBtn">Drill +1 $200</button>
            <button id="infoBtn">Info / Cargo</button>
          </div>
        </div>

        <div id="info-screen" className="hidden" role="dialog" aria-modal="true" aria-labelledby="info-title">
          <div className="info-card">
            <div className="info-header">
              <h2 id="info-title">Cargo &amp; Controls</h2>
              <button id="infoCloseBtn" className="close-btn" aria-label="Close info screen">×</button>
            </div>
            <section>
              <h3>Cargo Bay</h3>
              <ul id="cargoList" className="cargo-detail-list"><li className="empty-cargo">Empty</li></ul>
            </section>
            <section>
              <h3>Controls</h3>
              <ul className="control-list">
                <li><kbd>WASD</kbd> / <kbd>Arrows</kbd><span>Move, fly, and dig</span></li>
                <li><kbd>Tap / hold</kbd><span>Move toward the touched side of the ship</span></li>
                <li><kbd>Enter</kbd><span>Sell cargo at the surface depot</span></li>
                <li><kbd>Space</kbd><span>Repair or refuel at the surface</span></li>
                <li><kbd>R</kbd> then <kbd>R</kbd><span>Confirm reset while alive</span></li>
              </ul>
            </section>
          </div>
        </div>

        <div id="fuel-warning" role="alert">⚠ LOW FUEL — return to the surface</div>
        <div id="toast" role="status"></div>
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
                <li><strong>Do not die:</strong> deep magma pockets, tougher rock, and tunnel fiends scale with depth.</li>
                <li><strong>Enemies:</strong> drilling nearby blocks wakes them; drill them back before they chew the hull.</li>
                <li><strong>Goal:</strong> reach the Motherlode core at the bottom, crack it, and get home alive.</li>
                <li><strong>Upgrade:</strong> prices rise, so choose tank, cargo, and drill upgrades carefully.</li>
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
