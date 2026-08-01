import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { loadServerUrl } from '../net/multiplayer-settings';
import { DEFAULT_SERVER_URL } from '../net/net';
import { uiCommands } from './commands';
import { useUiStore } from './store';
import styles from './Lobby.module.css';

/**
 * The two panels of the `lobby` phase, in order. Which one is up is local state:
 * the phase machine only cares that the player is not in the run yet, and the
 * lobby is unmounted the moment they are, so there is nothing to persist.
 */
type LobbyStep = 'mode' | 'connect';

/**
 * Shift dispatch, mounted only in the `lobby` phase.
 *
 * Step 1 asks the one question that matters — alone or with a comrade. Solo
 * starts the run outright; multiplayer opens step 2, the relay panel, which
 * stays up reporting progress until the pairing starts the run (or the player
 * backs out).
 */
export function Lobby() {
  const [step, setStep] = useState<LobbyStep>('mode');
  // Stable, so the connect panel's Escape listener is bound once, not per render.
  const showConnect = useCallback(() => setStep('connect'), []);
  const showModes = useCallback(() => setStep('mode'), []);
  return step === 'mode'
    ? <ModeSelect onMultiplayer={showConnect} />
    : <ConnectPanel onBack={showModes} />;
}

function ModeSelect({onMultiplayer}: {onMultiplayer(): void}) {
  const soloRef = useRef<HTMLButtonElement>(null);

  // Solo is the default: the first Enter after the splash starts a game rather
  // than doing nothing, and Tab reaches multiplayer in one step.
  useEffect(() => { soloRef.current?.focus({preventScroll: true}); }, []);

  return (
    <LobbyScreen title="Choose your shift" kicker="☭ Shift dispatch ☭">
      <div className={styles.modes}>
        <button
          id="soloBtn"
          ref={soloRef}
          className={styles.modeBtn}
          type="button"
          onClick={event => uiCommands.playSolo(event.nativeEvent)}
        >
          <span className={styles.modeMark} aria-hidden="true">★</span>
          <span className={styles.modeName}>Single player</span>
          <span className={styles.modeCopy}>Descend alone. The quota starts now.</span>
        </button>
        <button
          id="multiplayerBtn"
          className={styles.modeBtn}
          type="button"
          onClick={onMultiplayer}
        >
          <span className={styles.modeMark} aria-hidden="true">☭</span>
          <span className={styles.modeName}>Multiplayer</span>
          <span className={styles.modeCopy}>Pair with one comrade over a relay.</span>
        </button>
      </div>
    </LobbyScreen>
  );
}

function ConnectPanel({onBack}: {onBack(): void}) {
  const status = useUiStore(state => state.connectionStatus);
  const [serverUrl, setServerUrl] = useState(() => loadServerUrl(DEFAULT_SERVER_URL));
  const urlRef = useRef<HTMLInputElement>(null);

  // The relay URL is the only thing to decide here, and it is usually already
  // right, so focus it: Enter submits the form straight into Connect.
  useEffect(() => { urlRef.current?.focus({preventScroll: true}); }, []);

  /** Leaving cancels the pending connection; a stray socket must not start a run. */
  const goBack = useCallback(() => {
    uiCommands.cancelConnect();
    onBack();
  }, [onBack]);

  // Escape backs out wherever focus is. Captured for the same reason the splash
  // captures its keys: the game panel may still hold focus underneath, and the
  // listener only exists while this panel is mounted.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      goBack();
      event.preventDefault();
    }
    addEventListener('keydown', onKeyDown, {capture: true});
    return () => removeEventListener('keydown', onKeyDown, {capture: true});
  }, [goBack]);

  return (
    <LobbyScreen title="Relay connection" kicker="☭ Co-op dispatch ☭">
      {/* The form exists so Enter anywhere in it means Connect. Native validation
          is off: relay problems are reported in the status line the game already
          writes ("Enter a server URL", "Connection error"), not in a UA bubble
          that would silently swallow the press. */}
      <form
        className={styles.connectForm}
        noValidate
        onSubmit={event => { event.preventDefault(); uiCommands.connect(serverUrl.trim()); }}
      >
        <label className={styles.serverUrl} htmlFor="serverUrl">Relay server URL
          <input
            id="serverUrl"
            ref={urlRef}
            type="url"
            value={serverUrl}
            spellCheck={false}
            autoComplete="off"
            onChange={event => setServerUrl(event.target.value)}
          />
        </label>
        <span id="lobbyConnectionStatus" className={styles.connectionStatus} aria-live="polite">{status}</span>
        <div className={styles.actions}>
          <button id="connectBtn" className={styles.connectBtn} type="submit">Connect</button>
          <button id="lobbyBackBtn" type="button" onClick={goBack}>Back</button>
        </div>
        <p className={styles.hint}><kbd>Enter</kbd> connects · <kbd>Esc</kbd> goes back</p>
      </form>
    </LobbyScreen>
  );
}

/** The shared card both steps are painted on, so neither can drift from the other. */
function LobbyScreen({title, kicker, children}: {title: string; kicker: string; children: ReactNode}) {
  return (
    <div id="lobby-screen" className={styles.screen} role="dialog" aria-modal="true" aria-labelledby="lobby-title">
      <div className={styles.card}>
        <p className={styles.kicker}>{kicker}</p>
        <h2 id="lobby-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
