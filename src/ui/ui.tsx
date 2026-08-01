// The application shell.
//
// Everything inside is a component subscribed to `store.ts`; the game writes to
// that store once per frame and never touches the DOM outside the canvas. The
// element ids that remain (#game, #game-panel, and the button/dialog ids the
// tests and the keyboard layer reach for) are a deliberate, documented contract.
//
// The boot overlays are mounted by phase, not hidden by class: at most one of
// Intro/Lobby exists in the tree at any time, so neither can bleed through the
// other and no z-index has to arbitrate between them.

import { FuelWarning } from './FuelWarning';
import { Hud } from './Hud';
import { InfoScreen } from './InfoScreen';
import { Intro } from './Intro';
import { Lobby } from './Lobby';
import { ShopScreen } from './ShopScreen';
import { useUiStore } from './store';
import { Toast } from './Toast';

export function MinerApp({ developerToolsEnabled = false }: { developerToolsEnabled?: boolean }) {
  const phase = useUiStore(state => state.phase);
  return (
    <main id="shell">
      {/* The game panel is the keyboard surface: it has to be focusable and hold
          focus from the first frame, or WASD/arrow input goes nowhere. */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-autofocus */}
      <section id="game-panel" tabIndex={0} autoFocus>
        <canvas id="game" width={960} height={640} tabIndex={0} aria-label="Stalinload mining game" />
        <Hud />
        <ShopScreen />
        <InfoScreen developerToolsEnabled={developerToolsEnabled} />
        <FuelWarning />
        <Toast />
        {phase === 'intro' && <Intro />}
        {phase === 'lobby' && <Lobby />}
      </section>
    </main>
  );
}
