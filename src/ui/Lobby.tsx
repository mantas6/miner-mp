import { useCallback, useEffect, useRef, useState } from 'react';
import { loadServerUrl } from '../net/multiplayer-settings';
import { DEFAULT_SERVER_URL } from '../net/net';
import { uiCommands } from './commands';
import { isRelayProblemStatus } from './connection-status';
import { useUiStore } from './store';
import styles from './Lobby.module.css';

/**
 * The relay panel, mounted only in the `lobby` phase.
 *
 * It used to be the second of two steps, behind a picker that asked solo or co-op.
 * The splash answers that now — a press starts a solo run, the MP button comes
 * here — so this is the whole phase, and backing out of it returns to the splash.
 *
 * A native modal `<dialog>`, like the shop and the info overlays: `showModal()`
 * buys the focus containment that `role="dialog" aria-modal="true"` only claimed —
 * Tab used to walk straight out of the card and into the HUD buttons behind it,
 * which belong to a run that has not started. The browser also makes everything
 * outside inert, so the runtime's `focusGame()` can no longer pull focus out of
 * the lobby when the window regains it.
 */
export function Lobby() {
  const status = useUiStore(state => state.connectionStatus);
  const [serverUrl, setServerUrl] = useState(() => loadServerUrl(DEFAULT_SERVER_URL));
  const dialogRef = useRef<HTMLDialogElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  // Guarded because `showModal()` on an open dialog throws, and a mount effect
  // runs twice in StrictMode.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // The relay URL is the only thing to decide here, and it is usually already
  // right, so focus it: Enter submits the form straight into Connect.
  useEffect(() => { urlRef.current?.focus({preventScroll: true}); }, []);

  /** Leaving cancels the pending connection; a stray socket must not start a run. */
  const goBack = useCallback(() => uiCommands.leaveMultiplayer(), []);

  // Escape backs out wherever focus is. Captured for the same reason the splash
  // captures its keys: the game panel may still hold focus underneath, and the
  // listener only exists while this panel is mounted.
  //
  // `preventDefault` matters as much as the step back: left alone, the key becomes
  // the browser's own close request for the dialog, which would drop the card
  // without telling the phase machine and leave the player staring at a mine they
  // have not started. Refusing it in `onCancel` is not enough — a browser only
  // honours that refusal while the page's user activation is still fresh.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      goBack();
    }
    addEventListener('keydown', onKeyDown, {capture: true});
    return () => removeEventListener('keydown', onKeyDown, {capture: true});
  }, [goBack]);

  return (
    <dialog
      id="lobby-screen"
      ref={dialogRef}
      className={styles.screen}
      aria-labelledby="lobby-title"
      onCancel={event => event.preventDefault()}
      // A press on the dimmed area around the card has nothing to do — there is no
      // overlay to dismiss — and letting it through would move focus to the dialog
      // itself, taking Enter away from the field that had it.
      onPointerDown={event => { if (event.target === dialogRef.current) event.preventDefault(); }}
    >
      <div className={styles.card}>
        <p className={styles.kicker}>☭ Co-op dispatch ☭</p>
        <h2 id="lobby-title">Relay connection</h2>
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
      </div>
    </dialog>
  );
}
