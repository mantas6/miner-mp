import clsx from 'clsx';
import { useUiStore } from './store';
import styles from './FuelWarning.module.css';

/** The low-fuel banner, driven by the same alert flag as the fuel meter. */
export function FuelWarning() {
  const lowFuel = useUiStore(state => state.hud.fuelAlert);
  return (
    <div id="fuel-warning" className={clsx(styles.warning, lowFuel && styles.show)} role="alert">⚠ LOW FUEL — return to the surface</div>
  );
}
