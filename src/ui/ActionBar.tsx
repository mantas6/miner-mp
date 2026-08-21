import clsx from 'clsx';
import { MIN_TELEPORT_DEPTH_METERS } from '../core/teleporter';
import { uiCommands } from './commands';
import { useUiStore } from './store';
import styles from './ActionBar.module.css';

/**
 * The surface/underground action buttons. Keyboard equivalents live in input.ts.
 *
 * Deployables are not here: a scanner and a stick of dynamite are placed from the
 * inventory slot that holds them. The Linebreaker and the teleporter are carried
 * the same way but kept on the bar, because neither is aimed at a tile: one takes
 * a direction key and the other acts on the ship, and the bar is where the state
 * of both — armed, deep enough, how many are left — is shown.
 */
export function ActionBar() {
  const atSurface = useUiStore(state => state.hud.atSurface);
  const gameOver = useUiStore(state => state.hud.gameOver);
  const cargoValue = useUiStore(state => state.hud.cargoValue);
  const teleporters = useUiStore(state => state.hud.teleporters);
  const teleportReturn = useUiStore(state => state.hud.teleportReturn);
  const teleportDepthReached = useUiStore(state => state.hud.teleportDepthReached);
  const teleportUsable = useUiStore(state => state.hud.teleportUsable);
  const gunArmed = useUiStore(state => state.hud.gunArmed);
  const guns = useUiStore(state => state.hud.guns);

  const teleportLabel = atSurface
    ? 'Return (T)'
    : teleportDepthReached
      ? `Teleport (T) · x${teleporters}`
      : `Teleport at ${MIN_TELEPORT_DEPTH_METERS} m (T) · x${teleporters}`;

  return (
    <div className={styles.actionBar}>
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
      {/* Underground the button is only worth showing with a teleporter aboard,
          the way the gun button follows its own stack; at the depot it is the
          stored return point, not an item, that the trip back spends. */}
      <button
        id="teleporterBtn"
        hidden={atSurface ? !teleportReturn : teleporters <= 0}
        disabled={gameOver || !teleportUsable}
        onClick={() => uiCommands.useTeleporter()}
      >{teleportLabel}</button>
      <button
        id="gunBtn"
        className={clsx(styles.gunBtn, gunArmed && styles.armed)}
        hidden={atSurface || guns <= 0}
        disabled={gameOver}
        aria-pressed={gunArmed}
        onClick={() => uiCommands.toggleGunArmed()}
      >{gunArmed ? `AIMING — press direction · x${guns}` : `Arm Gun (G) · x${guns}`}</button>
      <button id="infoBtn" onClick={event => { event.stopPropagation(); uiCommands.openInfo(); }}>Info / Cargo</button>
    </div>
  );
}
