import clsx from 'clsx';
import { useUiStore } from './store';
import styles from './BarRow.module.css';

interface BarProps {
  id: string;
  label: string;
  value: number;
  max: number;
  text: string;
  alert: boolean;
}

function Bar({id, label, value, max, text, alert}: BarProps) {
  return (
    <div className={clsx(styles.bar, alert && styles.alert)}>
      <label>{label}</label>
      <meter id={id} min={0} max={max} value={value}></meter>
      <span id={`${id}Label`} className={styles.barValue}>{text}</span>
    </div>
  );
}

/**
 * The return-fuel forecast, reading as part of the fuel meter it hangs under.
 *
 * It answers a different question than the low-fuel alert next to it: that one
 * flashes when the tank runs dry, this one warns while there is still fuel but no
 * longer enough to climb out from this depth. Only the meter and the banner
 * flash; the forecast stays steady so the two alarms never compete.
 */
function FuelReserve() {
  const status = useUiStore(state => state.hud.fuelReserveStatus);
  const needed = useUiStore(state => state.hud.fuelReserveNeeded);
  const margin = useUiStore(state => state.hud.fuelReserveMargin);
  const atSurface = useUiStore(state => state.hud.atSurface);

  return (
    <div id="fuelReserve" className={clsx(styles.reserve, styles[status])} data-status={status} hidden={atSurface}>
      <label>Reserve</label>
      <span className={styles.reserveStatus}>{status.toUpperCase()}</span>
      <span id="fuelReserveLabel" className={styles.barValue}>
        {status === 'urgent' ? `needs ${needed}` : `${margin} after climb`}
      </span>
    </div>
  );
}

/** Fuel, hull and cargo meters plus the extraction status line. */
export function BarRow() {
  const fuel = useUiStore(state => state.hud.fuel);
  const fuelMax = useUiStore(state => state.hud.fuelMax);
  const fuelAlert = useUiStore(state => state.hud.fuelAlert);
  const hull = useUiStore(state => state.hud.hull);
  const hullMax = useUiStore(state => state.hud.hullMax);
  const hullAlert = useUiStore(state => state.hud.hullAlert);
  const cargo = useUiStore(state => state.hud.cargo);
  const cargoMax = useUiStore(state => state.hud.cargoMax);
  const cargoAlert = useUiStore(state => state.hud.cargoAlert);
  const extraction = useUiStore(state => state.hud.extractionHud);

  return (
    <div className={styles.barRow}>
      <Bar id="fuel" label="Fuel" value={Math.max(0, fuel)} max={fuelMax} text={`${Math.ceil(Math.max(0, fuel))}/${fuelMax}`} alert={fuelAlert} />
      <FuelReserve />
      <Bar id="hull" label="Hull" value={Math.max(0, hull)} max={hullMax} text={`${Math.ceil(Math.max(0, hull))}/${hullMax}`} alert={hullAlert} />
      <Bar id="cargo" label="Cargo" value={cargo} max={cargoMax} text={`${cargo}/${cargoMax}`} alert={cargoAlert} />
      <div id="extractionStatus" className={styles.extractionStatus} aria-live="polite" hidden={!extraction}>{extraction}</div>
    </div>
  );
}
