import clsx from 'clsx';
import { useState } from 'react';
import { loadServerUrl } from '../net/multiplayer-settings';
import { DEFAULT_SERVER_URL } from '../net/net';
import { uiCommands } from './commands';
import { useUiStore } from './store';
import styles from './Lobby.module.css';

/**
 * Mode picker shown before the first run. Kept behaviourally identical to the
 * imperative version — the intro/lobby phase machine is a later step.
 */
export function Lobby() {
  const visible = useUiStore(state => state.lobbyVisible);
  const status = useUiStore(state => state.connectionStatus);
  const [serverUrl, setServerUrl] = useState(() => loadServerUrl(DEFAULT_SERVER_URL));

  return (
    <div id="lobby-screen" className={clsx(styles.screen, !visible && styles.hidden)} role="dialog" aria-modal="true" aria-labelledby="lobby-title">
      <div className={styles.card}>
        <p className={styles.kicker}>Co-op dispatch</p>
        <h2 id="lobby-title">Choose your shift</h2>
        <p className={styles.copy}>Connect to a local relay to pair with one fellow miner, or launch a solo expedition.</p>
        <label className={styles.serverUrl} htmlFor="serverUrl">Relay server URL
          <input
            id="serverUrl"
            type="url"
            value={serverUrl}
            spellCheck={false}
            autoComplete="off"
            onChange={event => setServerUrl(event.target.value)}
          />
        </label>
        <span id="lobbyConnectionStatus" className={styles.connectionStatus} aria-live="polite">{status}</span>
        <div className={styles.actions}>
          <button
            id="connectBtn"
            className={styles.connectBtn}
            type="button"
            onClick={event => { event.stopPropagation(); uiCommands.connect(serverUrl.trim()); }}
          >Connect</button>
          <button
            id="soloBtn"
            type="button"
            onClick={event => { event.stopPropagation(); uiCommands.playSolo(event.nativeEvent); }}
          >Play solo</button>
        </div>
      </div>
    </div>
  );
}
