import { ActionBar } from './ActionBar';
import { BarRow } from './BarRow';
import { StatsGrid } from './StatsGrid';
import { uiCommands } from './commands';
import { useUiStore } from './store';
import styles from './Hud.module.css';

/** The always-on overlay: sound, relay status, meters, readouts, actions. */
export function Hud() {
  const soundOn = useUiStore(state => state.soundOn);
  const soundLabel = useUiStore(state => state.soundLabel);
  const connectionStatus = useUiStore(state => state.connectionStatus);
  const connectionInHud = useUiStore(state => state.connectionInHud);

  return (
    <div id="hud" className={styles.hud} aria-label="Game status and actions">
      <div className={styles.top}>
        <button
          id="soundBtn"
          className={styles.soundBtn}
          aria-label={soundLabel}
          title={soundLabel}
          onPointerDown={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); uiCommands.toggleSound(); }}
        >{soundOn ? '🔊' : '🔇'}</button>
        <span id="connectionStatus" className={styles.connectionStatus} aria-live="polite" hidden={!connectionInHud}>{connectionStatus}</span>
      </div>

      <StatsGrid />
      <BarRow />
      <ActionBar />
    </div>
  );
}
