// The cargo container's transfer menu.
//
// Two columns of slots — the crate on the left, the ship's bay on the right —
// and one rule: a press on a stack sends it to the other side. There is no drag,
// no quantity stepper and no confirm, because there is nothing to decide: a stack
// is either aboard or it is in the crate, and the only question the menu ever asks
// is which.
//
// Both columns are painted from the store, and both are live. The bay's slots are
// the same ones the HUD panel shows, synced every frame; the crate's are pushed by
// the game after each transfer. So the menu holds no copy of anything and cannot
// disagree with the simulation behind it.
//
// The shell/card split, the fixed header over a scrolling body, and the backdrop
// press are the shop's and the info screen's, for the same reasons.

import { useEffect, useRef, type RefObject } from 'react';
import { CARGO_CONTAINER } from '../core/cargo-container';
import type { InventoryItemKind } from '../core/inventory';
import { uiCommands } from './commands';
import { useUiStore, type InventorySlotView } from './store';
import styles from './CargoScreen.module.css';

export function CargoScreen() {
  const open = useUiStore(state => state.activeOverlay === 'container');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      closeRef.current?.focus({preventScroll: true});
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      id="cargo-screen"
      ref={dialogRef}
      className={styles.screen}
      aria-labelledby="cargo-title"
      // A native close request (Escape reaching the UA, a form submit) must not
      // leave the game thinking the crate is still open.
      onClose={() => uiCommands.closeContainer()}
      onPointerDown={event => { if (event.target === dialogRef.current) uiCommands.closeContainer(); }}
    >
      {open && <CargoCard closeRef={closeRef} />}
    </dialog>
  );
}

function CargoCard({closeRef}: {closeRef: RefObject<HTMLButtonElement | null>}) {
  const containerSlots = useUiStore(state => state.containerSlots);
  const shipSlots = useUiStore(state => state.inventorySlots);

  return (
    <div id="cargo-card" className={styles.card}>
      <div className={styles.header}>
        <h2 id="cargo-title">Cargo Container</h2>
        <button
          id="cargoCloseBtn"
          ref={closeRef}
          className={styles.closeBtn}
          aria-label="Close cargo container"
          onClick={event => { event.stopPropagation(); uiCommands.closeContainer(); }}
        >×</button>
      </div>
      <div className={styles.body}>
        <div className={styles.columns}>
          <SlotColumn
            listId="containerSlots"
            title="Container"
            hint="Press a stack to take it aboard"
            slots={containerSlots}
            action="take"
            onPress={kind => uiCommands.takeFromContainer(kind)}
          />
          <SlotColumn
            listId="shipSlots"
            title="Cargo Bay"
            hint="Press a stack to store it"
            slots={shipSlots}
            action="store"
            onPress={kind => uiCommands.storeInContainer(kind)}
          />
        </div>
        <p className={styles.note}>
          Holds {CARGO_CONTAINER.slots} stacks and keeps them through death and reload.
          Ore taken back aboard still obeys the cargo-bay limit.
        </p>
      </div>
    </div>
  );
}

interface SlotColumnProps {
  listId: string;
  title: string;
  hint: string;
  slots: InventorySlotView[];
  /** Which direction a press on this column moves a stack; also the test hook. */
  action: 'store' | 'take';
  onPress(kind: InventoryItemKind): void;
}

/** One side of the transfer: every slot, empty ones included, as it is elsewhere. */
function SlotColumn({listId, title, hint, slots, action, onPress}: SlotColumnProps) {
  return (
    <section className={styles.column} aria-labelledby={`${listId}-title`}>
      <div className={styles.columnHeading}>
        <h3 id={`${listId}-title`}>{title}</h3>
        <span>{hint}</span>
      </div>
      <ul id={listId} className={styles.slots}>
        {slots.map(slot => {
          const kind = slot.kind;
          return (
            <li key={slot.index} className={kind === null ? styles.empty : undefined}>
              {kind === null
                ? <span className={styles.emptyLabel}>Empty</span>
                : (
                  <button
                    type="button"
                    className={styles.slot}
                    data-cargo-action={action}
                    data-cargo-kind={kind}
                    onClick={() => onPress(kind)}
                  >
                    <span className={styles.icon} style={{background: slot.color}} aria-hidden="true" />
                    <span className={styles.label}>{slot.label}</span>
                    <span className={styles.count}>×{slot.count}</span>
                  </button>
                )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
