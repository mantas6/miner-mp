import clsx from 'clsx';
import { useUiStore } from './store';
import { useSurfaceHint } from './SurfaceHint';
import styles from './FuelWarning.module.css';

/**
 * One banner, two reasons to panic: the tank is nearly dry, or there is still
 * fuel but no longer enough to climb home from this depth. A dry tank wins the
 * wording, because refuelling is the only cure for it; the depth-aware warning
 * only speaks up while the tank still looks healthy.
 *
 * The depot prompt takes the same spot and outranks both: while it is up the ship
 * is parked next to the pump, so "return to the surface" is advice it has already
 * taken, and the line worth reading is the key that fixes it.
 */
export function FuelWarning() {
  const lowFuel = useUiStore(state => state.hud.fuelAlert);
  const reserveUrgent = useUiStore(state => state.hud.fuelReserveStatus === 'urgent');
  const gameOver = useUiStore(state => state.hud.gameOver);
  const atSurface = useUiStore(state => state.hud.atSurface);
  const surfaceHint = useSurfaceHint();
  const noReturnFuel = reserveUrgent && !gameOver && !atSurface;

  return (
    <div id="fuel-warning" className={clsx(styles.warning, !surfaceHint && (lowFuel || noReturnFuel) && styles.show)} role="alert">
      {lowFuel ? '⚠ LOW FUEL — return to the surface' : '⚠ RETURN FUEL SPENT — climb to the depot now'}
    </div>
  );
}
