import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { useUiStore } from './store';
import styles from './Toast.module.css';

/** Length of the fade-out in `Toast.module.css`, so the text outlives it. */
const FADE_MS = 200;

/**
 * The transient status line. One element for the whole queue on purpose: swapping
 * the text keeps the fade-in from restarting, exactly like the imperative version
 * did.
 *
 * The message on screen is state, not a ref written during render: a ref mutation
 * is a side effect the concurrent renderer is free to run twice, throw away, or
 * replay, and this element is also a `role="status"` live region — so a stale
 * write is not just a wrong pixel, it is a wrong announcement. The expired
 * message is cleared once the fade has finished, which both empties the live
 * region and leaves the pill something to fade out with.
 */
export function Toast() {
  const message = useUiStore(state => state.toasts.at(-1)?.message);
  const [shown, setShown] = useState('');

  useEffect(() => {
    if (message) {
      setShown(message);
      return;
    }
    const timer = setTimeout(() => setShown(''), FADE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div id="toast" className={clsx(styles.toast, message && styles.show)} role="status">{shown}</div>
  );
}
