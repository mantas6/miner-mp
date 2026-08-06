import clsx from 'clsx';
import { getFuelGaugeSegments } from '../core/fuel-reserve';
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

/**
 * One labelled meter. `<meter>` is a labelable element, so the caption is a real
 * `<label for>`: without the association the label was three words of decoration
 * next to an unnamed gauge, and the reading ("70 out of 100") never said of what.
 * The value text repeats the numbers for the eye, so it stays out of the name.
 */
function Bar({id, label, value, max, text, alert}: BarProps) {
  return (
    <div className={clsx(styles.bar, alert && styles.alert)}>
      <label htmlFor={id}>{label}</label>
      <meter id={id} min={0} max={max} value={value}></meter>
      <span id={`${id}Label`} className={styles.barValue}>{text}</span>
    </div>
  );
}

/**
 * The fuel meter, split where the climb home ends: the first slice is fuel the
 * return trip will burn, the second is what would still be aboard at the depot.
 *
 * The forecast used to be its own widget under the meter, which said the same
 * thing twice in two places. Now the gauge is the forecast — a shrinking bright
 * slice means the surplus is running out, and once the climb costs more than the
 * tank holds the bright slice is gone and the whole fill reads urgent. The
 * numbers behind it stay in the accessible name, so nothing new competes for
 * screen space with the low-fuel banner.
 */
function FuelBar() {
  const fuel = useUiStore(state => state.hud.fuel);
  const fuelMax = useUiStore(state => state.hud.fuelMax);
  const alert = useUiStore(state => state.hud.fuelAlert);
  const status = useUiStore(state => state.hud.fuelReserveStatus);
  const needed = useUiStore(state => state.hud.fuelReserveNeeded);
  const margin = useUiStore(state => state.hud.fuelReserveMargin);
  const atSurface = useUiStore(state => state.hud.atSurface);

  const value = Math.max(0, fuel);
  const text = `${Math.ceil(value)}/${fuelMax}`;
  const {returnFraction, surplusFraction} = getFuelGaugeSegments(value, fuelMax, needed);
  const label = atSurface
    ? `Fuel ${text}`
    : status === 'urgent'
      ? `Fuel ${text} — climb home needs ${needed}`
      : `Fuel ${text} — ${margin} left after climbing home`;

  return (
    <div className={clsx(styles.bar, alert && styles.alert)}>
      {/* A plain caption, not a <label>: the gauge is a div, so there is no
          labelable control to point a `for` at — its name lives in aria-label. */}
      <span className={styles.barCaption}>Fuel</span>
      <div
        id="fuel"
        className={clsx(styles.gauge, styles[status])}
        data-status={status}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={fuelMax}
        aria-valuenow={value}
        aria-label={label}
        title={label}
      >
        <span id="fuelReturn" className={styles.gaugeReturn} style={{width: `${returnFraction * 100}%`}} />
        <span id="fuelSurplus" className={styles.gaugeSurplus} style={{width: `${surplusFraction * 100}%`}} />
      </div>
      <span id="fuelLabel" className={styles.barValue}>{text}</span>
    </div>
  );
}

/** Fuel, hull and cargo meters plus the extraction status line. */
export function BarRow() {
  const hull = useUiStore(state => state.hud.hull);
  const hullMax = useUiStore(state => state.hud.hullMax);
  const hullAlert = useUiStore(state => state.hud.hullAlert);
  const cargo = useUiStore(state => state.hud.cargo);
  const cargoMax = useUiStore(state => state.hud.cargoMax);
  const cargoAlert = useUiStore(state => state.hud.cargoAlert);
  const extraction = useUiStore(state => state.hud.extractionHud);

  return (
    <div className={styles.barRow}>
      <FuelBar />
      <Bar id="hull" label="Hull" value={Math.max(0, hull)} max={hullMax} text={`${Math.ceil(Math.max(0, hull))}/${hullMax}`} alert={hullAlert} />
      <Bar id="cargo" label="Cargo" value={cargo} max={cargoMax} text={`${cargo}/${cargoMax}`} alert={cargoAlert} />
      <div id="extractionStatus" className={styles.extractionStatus} aria-live="polite" hidden={!extraction}>{extraction}</div>
    </div>
  );
}
