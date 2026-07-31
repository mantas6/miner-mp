import { useUiStore } from './store';
import styles from './StatsGrid.module.css';

/** Cash and depth readouts. Each cell subscribes to its own number. */
export function StatsGrid() {
  const cash = useUiStore(state => state.hud.cash);
  const depthMeters = useUiStore(state => state.hud.depthMeters);
  return (
    <div className={styles.statsGrid}>
      <div className={styles.stat}><span>Cash</span><strong id="cash">${Math.floor(cash)}</strong></div>
      <div className={styles.stat}><span>Depth</span><strong id="depth">{depthMeters} m</strong></div>
    </div>
  );
}
