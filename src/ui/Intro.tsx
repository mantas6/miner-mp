import { useEffect } from 'react';
import { FUEL } from '../core/balance';
import { MIN_TELEPORT_DEPTH_METERS } from '../core/teleporter';
import { uiCommands } from './commands';
import styles from './Intro.module.css';
import '../styles/intro-art.css';

/**
 * Title card and rules: the first phase. Any press hands over to the lobby.
 *
 * The keyboard shortcut is a window listener rather than the card's own
 * `onKeyDown` because the game panel holds focus at boot; the listener only
 * exists while this overlay is mounted, so it cannot leak into the run.
 */
export function Intro() {
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
        <div className={styles.copy}>
          <p className={styles.kicker}>Workers of the mine, unite!</p>
          <h2>Moleload</h2>
          <p className={styles.cta}>Press to continue</p>
          <ul className={styles.rules}>
            <li><strong>Move &amp; dig:</strong> WASD / arrows.</li>
            <li><strong>Make money:</strong> mine ore, return to surface, press Sell or Enter. Space repairs/refuels.</li>
            <li><strong>Dynamite:</strong> buy charges at the depot, then press E or Detonate underground to clear terrain.</li>
            <li><strong>Teleporter:</strong> buy one at the depot, then press T or Teleport at {MIN_TELEPORT_DEPTH_METERS} m or deeper for an emergency round trip.</li>
            <li><strong>Gun:</strong> buy the permanent gun and bullet bundles, then press G (or Arm Gun) and a direction key.</li>
            <li><strong>Do not die:</strong> deep magma pockets, tougher rock, and tunnel fiends scale with depth.</li>
            <li><strong>Enemies:</strong> drilling nearby blocks wakes them; drill them back before they chew the hull.</li>
            <li><strong>Goal:</strong> reach the Motherlode core at 10,000 m, crack it, and get home alive. The mine continues below it.</li>
            <li><strong>Upgrade:</strong> prices rise, so choose tank, hull, cargo, drill, and sensor upgrades carefully.</li>
            <li><strong>Sound:</strong> optional soundtrack starts only after the Sound button or a trusted tap/click.</li>
          </ul>
          <p className={styles.warning}>Low fuel below {FUEL.lowFuelFraction * 100}% means return to the surface immediately.</p>
        </div>
      </div>
    </div>
  );
}
