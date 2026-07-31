import clsx from 'clsx';
import { useRef } from 'react';
import { useUiStore } from './store';
import styles from './Toast.module.css';

/**
 * The transient status line. One element for the whole queue on purpose: swapping
 * the text keeps the fade-in from restarting, exactly like the imperative version
 * did. The expired message stays in the (invisible) element rather than being
 * cleared, again matching the previous behaviour.
 */
export function Toast() {
  const message = useUiStore(state => state.toasts.at(-1)?.message);
  const lastShown = useRef('');
  if (message) lastShown.current = message;

  return (
    <div id="toast" className={clsx(styles.toast, message && styles.show)} role="status">{lastShown.current}</div>
  );
}
