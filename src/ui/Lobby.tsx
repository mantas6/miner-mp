import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { loadServerUrl } from '../net/multiplayer-settings';
import { DEFAULT_SERVER_URL } from '../net/net';
import { uiCommands } from './commands';
import { isRelayProblemStatus } from './connection-status';
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
          {/* The status line is this field's description, so a screen reader reads
              the relay's answer as part of the field instead of as a stray label
              somewhere after it — and when that answer is a failure, the field is
              the thing that is wrong. */}
          <input
            id="serverUrl"
            ref={urlRef}
            type="url"
            value={serverUrl}
            spellCheck={false}
            autoComplete="off"
            aria-describedby="lobbyConnectionStatus"
            aria-invalid={isRelayProblemStatus(status)}
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

/**
 * The shared card both steps are painted on, so neither can drift from the other.
 *
 * A native modal `<dialog>`, like the shop and the info overlays: `showModal()`
 * buys the focus containment that `role="dialog" aria-modal="true"` only claimed —
 * Tab used to walk straight out of the card and into the HUD buttons behind it,
 * which belong to a run that has not started. The browser also makes everything
 * outside inert, so the runtime's `focusGame()` can no longer pull focus out of
 * the lobby when the window regains it.
 *
 * There is nothing to close it *to*, though — the run has not started, so there is
 * no screen underneath — so the dialog refuses every close request, and Escape is
 * taken out of the browser's hands entirely (see below). Stepping the relay panel
 * back to the mode picker is `ConnectPanel`'s own Escape.
 */
function LobbyScreen({title, kicker, children}: {title: string; kicker: string; children: ReactNode}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Guarded because `showModal()` on an open dialog throws, and a mount effect
  // runs twice in StrictMode.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // `onCancel` refuses the close request, but a browser only honours that refusal
  // while the page still holds fresh user activation — deliberately, so a page
  // cannot trap anyone. A second Escape therefore closes the dialog, which here
  // would leave the player staring at a mine they have not started. So Escape is
  // stopped before it can become a close request at all. `preventDefault` only, and
  // no `stopPropagation`: the relay panel's step-back listens for the same key.
  useEffect(() => {
    function refuseEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') event.preventDefault();
    }
    addEventListener('keydown', refuseEscape, {capture: true});
    return () => removeEventListener('keydown', refuseEscape, {capture: true});
  }, []);

  return (
    <dialog
      id="lobby-screen"
      ref={dialogRef}
      className={styles.screen}
      aria-labelledby="lobby-title"
      onCancel={event => event.preventDefault()}
      // A press on the dimmed area around the card has nothing to do — there is no
      // overlay to dismiss — and letting it through would move focus to the dialog
      // itself, taking Enter away from the button that had it.
      onPointerDown={event => { if (event.target === dialogRef.current) event.preventDefault(); }}
    >
      <div className={styles.card}>
        <p className={styles.kicker}>{kicker}</p>
        <h2 id="lobby-title">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
