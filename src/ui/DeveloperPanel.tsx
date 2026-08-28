import { DEVELOPER_CASH_GRANT, DEVELOPER_SERVICES, formatDeveloperServiceControl } from '../core/developer';
import { PLAYER_UPGRADES, formatDeveloperUpgradeControl } from '../core/upgrades';
import { uiCommands } from './commands';
import { useUiStore } from './store';
import styles from './DeveloperPanel.module.css';

/**
 * The cheat menu, disclosed from the Settings tab.
 *
 * It is mounted only while that disclosure is expanded, so the ship snapshot it
 * prices its buttons from is not subscribed to while the cheats are out of sight
 * — a 60 Hz sync must not re-render a collapsed panel.
 */
export function DeveloperPanel() {
  const player = useUiStore(state => state.player);

  return (
    <div id="cheat-menu" className={styles.section} role="group" aria-labelledby="settings-cheats-title">
      <p className={styles.warning}><strong>Cheats:</strong> grant local-player cash, restore fuel or hull, or permanently grant normal player upgrades for exactly $0. These controls work above or below the surface and do not change shop prices.</p>
      <div id="developerUpgrades" className={styles.upgrades} aria-label="Free developer upgrade controls">
        <div className={styles.upgrade}>
          <div>
            <strong>Money Cheat</strong>
            <span>Local player only</span>
          </div>
          <button type="button" data-developer-cash onClick={() => uiCommands.grantDeveloperCash()}>Developer: Grant +${DEVELOPER_CASH_GRANT.toLocaleString('en-US')}</button>
        </div>
        {DEVELOPER_SERVICES.map(service => {
          const control = formatDeveloperServiceControl(player, service.id);
          return (
            <div key={service.id} className={styles.upgrade} data-developer-service-row={service.id}>
              <div>
                <strong>{service.label}</strong>
                <span data-developer-service-level>{control.level}</span>
              </div>
              <button
                type="button"
                data-developer-service={service.id}
                disabled={control.buttonDisabled}
                onClick={() => uiCommands.runDeveloperService(service.id)}
              >{control.buttonLabel}</button>
            </div>
          );
        })}
        {PLAYER_UPGRADES.map(upgrade => {
          const control = formatDeveloperUpgradeControl(player, upgrade.id);
          return (
            <div key={upgrade.id} className={styles.upgrade} data-upgrade-row={upgrade.id}>
              <div>
                <strong>{upgrade.label}</strong>
                <span data-upgrade-level>{control.level}</span>
              </div>
              <button
                type="button"
                data-developer-upgrade={upgrade.id}
                disabled={control.buttonDisabled}
                onClick={() => uiCommands.grantDeveloperUpgrade(upgrade.id)}
              >{control.buttonLabel}</button>
            </div>
          );
        })}
      </div>
      <div className={styles.playerDataReset} aria-labelledby="player-data-reset-title">
        <h4 id="player-data-reset-title">Player Data</h4>
        <p>Start this player over without regenerating or repairing the mine terrain.</p>
        <button
          id="resetPlayerDataBtn"
          type="button"
          onClick={event => { event.stopPropagation(); uiCommands.resetPlayerData(); }}
        >Reset All Player Data</button>
      </div>
      <div className={styles.worldStateReset} aria-labelledby="world-state-reset-title">
        <h4 id="world-state-reset-title">World State</h4>
        <p>Regenerate terrain and world enemies for this mine without changing your cash, upgrades, inventory, stats, ship condition, or settings. Explored fog is cleared so regenerated terrain is not revealed.</p>
        <button
          id="resetWorldStateBtn"
          type="button"
          onClick={event => { event.stopPropagation(); uiCommands.resetWorldState(); }}
        >Reset World State</button>
      </div>
    </div>
  );
}
