import { useUiStore } from './store';
import styles from './SurfaceHint.module.css';

/**
 * The depot keyboard prompt, centred over the mine.
 *
 * It sits where the fuel banner sits, because that spot is where the game already
 * puts the one line worth reading mid-run — but it is plain text, not a banner:
 * "press Space" is an offer, not an emergency, and boxing it would give a routine
 * prompt the same weight as a warning the player has to act on.
 *
 * The overlays are modal, so under one of them the prompt would only be prompting
 * at a backdrop.
 */
export function useSurfaceHint(): string | null {
  const hint = useUiStore(state => state.hud.surfaceHint);
  const overlayOpen = useUiStore(state => state.activeOverlay !== null);
  return overlayOpen ? null : hint;
}

export function SurfaceHint() {
  const hint = useSurfaceHint();

  return (
    <div id="surfaceHint" className={styles.hint} aria-live="polite" hidden={!hint}>{hint}</div>
  );
}
