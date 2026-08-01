import clsx from 'clsx';
import { ActionBar } from './ActionBar';
import { BarRow } from './BarRow';
import { Scanner } from './Scanner';
import { StatsGrid } from './StatsGrid';
import { uiCommands } from './commands';
import { useUiStore } from './store';
import styles from './Hud.module.css';

/** The always-on overlay: audio, relay status, meters, readouts, actions. */
export function Hud() {
  const musicOn = useUiStore(state => state.musicOn);
  const musicLabel = useUiStore(state => state.musicLabel);
  const sfxOn = useUiStore(state => state.sfxOn);
  const sfxLabel = useUiStore(state => state.sfxLabel);
  const connectionStatus = useUiStore(state => state.connectionStatus);
  const connectionInHud = useUiStore(state => state.connectionInHud);

  return (
    <div id="hud" className={styles.hud} aria-label="Game status and actions">
      <div className={styles.top}>
        {/* The soundtrack and the effects mute independently, one button each. */}
        <button
          id="musicBtn"
          className={clsx(styles.soundBtn, !musicOn && styles.mutedNote)}
          aria-label={musicLabel}
          aria-pressed={musicOn}
          title={musicLabel}
          onPointerDown={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); uiCommands.toggleMusic(); }}
        >🎵</button>
        <button
          id="sfxBtn"
          className={clsx(styles.soundBtn, !sfxOn && styles.muted)}
          aria-label={sfxLabel}
          aria-pressed={sfxOn}
          title={sfxLabel}
          onPointerDown={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); uiCommands.toggleSfx(); }}
        >{sfxOn ? '🔊' : '🔇'}</button>
        <span id="connectionStatus" className={styles.connectionStatus} aria-live="polite" hidden={!connectionInHud}>{connectionStatus}</span>
      </div>

      <StatsGrid />
      <Scanner />
      <BarRow />
      <ActionBar />
    </div>
  );
}
