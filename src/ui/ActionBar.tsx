import clsx from 'clsx';
import { MIN_TELEPORT_DEPTH_METERS } from '../core/teleporter';
import { uiCommands } from './commands';
import { useUiStore } from './store';
import styles from './ActionBar.module.css';

/** The surface/underground action buttons. Keyboard equivalents live in input.ts. */
export function ActionBar() {
  const atSurface = useUiStore(state => state.hud.atSurface);
  const gameOver = useUiStore(state => state.hud.gameOver);
  const cargoValue = useUiStore(state => state.hud.cargoValue);
  const dynamite = useUiStore(state => state.hud.dynamite);
  const teleporters = useUiStore(state => state.hud.teleporters);
  const teleportReturn = useUiStore(state => state.hud.teleportReturn);
  const teleportDepthReached = useUiStore(state => state.hud.teleportDepthReached);
  const teleportUsable = useUiStore(state => state.hud.teleportUsable);
  const gunOwned = useUiStore(state => state.hud.gunOwned);
  const gunArmed = useUiStore(state => state.hud.gunArmed);
  const bullets = useUiStore(state => state.hud.bullets);
  // The depot keyboard prompt rides above the surface buttons it stands in for.
  // The overlays are modal, so it would only be prompting at a backdrop.
  const surfaceHint = useUiStore(state => state.hud.surfaceHint);
  const overlayOpen = useUiStore(state => state.shopOpen || state.infoOpen);

  const teleportLabel = atSurface
    ? 'Return (T)'
    : teleportDepthReached
      ? `Teleport (T) · x${teleporters}`
      : `Teleport at ${MIN_TELEPORT_DEPTH_METERS} m (T) · x${teleporters}`;

  return (
    <div className={styles.actionBar}>
      <div id="surfaceHint" className={styles.surfaceHint} aria-live="polite" hidden={!surfaceHint || overlayOpen}>{surfaceHint}</div>
      {/* `hidden` is the only gate on where a button applies (the CSS hides it and
          the UA takes it out of the tab order); `disabled` only says why an
          otherwise-visible button cannot fire, so the two never repeat a term. */}
      <button id="sell" hidden={!atSurface} disabled={cargoValue <= 0} onClick={() => uiCommands.sell()}>Sell</button>
      <button
        id="shopBtn"
        className={styles.openShopBtn}
        hidden={!atSurface}
        onClick={event => { event.stopPropagation(); uiCommands.openShop(); }}
      >Shop &amp; Equipment</button>
      <button
        id="dynamiteBtn"
        hidden={atSurface}
        disabled={dynamite <= 0 || gameOver}
        onClick={() => uiCommands.detonateDynamite()}
      >Detonate (E) · x{dynamite}</button>
      <button
        id="teleporterBtn"
        hidden={atSurface && !teleportReturn}
        disabled={gameOver || !teleportUsable}
        onClick={() => uiCommands.useTeleporter()}
      >{teleportLabel}</button>
      <button
        id="gunBtn"
        className={clsx(styles.gunBtn, gunArmed && styles.armed)}
        hidden={atSurface || !gunOwned}
        disabled={bullets <= 0 || gameOver}
        aria-pressed={gunArmed}
        onClick={() => uiCommands.toggleGunArmed()}
      >{gunArmed ? `AIMING — press direction · x${bullets}` : `Arm Gun (G) · x${bullets}`}</button>
      <button id="infoBtn" onClick={event => { event.stopPropagation(); uiCommands.openInfo(); }}>Info / Cargo</button>
    </div>
  );
}
