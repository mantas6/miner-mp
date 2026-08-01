import { useEffect } from 'react';
import { uiCommands } from './commands';
import styles from './Intro.module.css';
import '../styles/intro-art.css';

/**
 * Title card: the first phase. Any press hands over to the lobby.
 *
 * Deliberately short. The full rules live in the in-game Info / Cargo overlay
 * (`InfoScreen.tsx`), which the player can open at any time, so the splash only
 * carries the name, one line of flavour, the three keys needed to start, and
 * the prompt to leave.
 *
 * The keyboard shortcut is a window listener rather than the card's own
 * `onKeyDown` because the game panel holds focus at boot; the listener only
 * exists while this overlay is mounted, so it cannot leak into the run.
 */
export function Intro() {
  // The lyric voice-over is scoped to this overlay: mounting starts the loop and
  // unmounting stops it, so dismissing the splash cannot leave a line talking
  // over the lobby. The game owns the player and the mute state (`commands.ts`),
  // so this is a plain start/stop and nothing more.
  useEffect(() => {
    uiCommands.startIntroVoice();
    return () => uiCommands.stopIntroVoice();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      // A key press cannot unlock audio, so no event is forwarded here.
      uiCommands.dismissIntro();
      event.preventDefault();
    }
    addEventListener('keydown', onKeyDown, {capture: true});
    return () => removeEventListener('keydown', onKeyDown, {capture: true});
  }, []);

  return (
    <div
      id="intro"
      className={styles.intro}
      role="button"
      tabIndex={0}
      aria-label="Press to continue to the shift dispatch"
      // Cancelling the press keeps the touch-compatibility click from landing on
      // the lobby button that appears underneath the moment this card unmounts.
      onPointerDown={event => { uiCommands.dismissIntro(event.nativeEvent); event.preventDefault(); }}
    >
      <div className={styles.card}>
        <div className={styles.emblem} aria-hidden="true">
          <div className="soviet-badge">
            <div className="lenin-face">
              <div className="lenin-hair"></div>
              <div className="lenin-brow left"></div><div className="lenin-brow right"></div>
              <div className="lenin-eye left"></div><div className="lenin-eye right"></div>
              <div className="lenin-nose"></div>
              <div className="lenin-moustache"></div>
              <div className="lenin-beard"></div>
            </div>
            <div className="badge-star">★</div>
            <div className="badge-sickle">☭</div>
          </div>
          <div className="soviet-ribbon">СССР</div>
        </div>
        <div className={styles.copy}>
          <p className={styles.kicker}>☭ Workers of the mine, unite! ☭</p>
          <h2>Stalinload</h2>
          <p className={styles.tagline}>Dig for the Motherland. Fill the quota.</p>
          <p className={styles.hint}>
            <kbd>WASD</kbd> dig · <kbd>Enter</kbd> sell · <kbd>Space</kbd> refuel · rest in Info / Cargo
          </p>
          <p className={styles.cta}>★ Press Enter to start ★</p>
        </div>
      </div>
    </div>
  );
}
