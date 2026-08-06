// The application shell.
//
// Everything inside is a component subscribed to `store.ts`; the game writes to
// that store once per frame and never touches the DOM outside the canvas. The
// element ids that remain (#game, #game-panel, and the button/dialog ids the
// tests and the keyboard layer reach for) are a deliberate, documented contract.
//
// The canvas and the panel are also the two elements the simulation is mounted
// *against*: `useGameRuntime` hands the refs to the injected runtime factory and
// disposes it on unmount, so the game's lifetime is this component's lifetime.
// Rendering the shell without a factory (the UI tests) mounts chrome and no game.
//
// The boot overlays are mounted by phase, not hidden by class: at most one of
// Intro/Lobby exists in the tree at any time, so neither can bleed through the
// other and no z-index has to arbitrate between them.

import { RuntimeFailure } from './Failure';
import { FuelWarning } from './FuelWarning';
import { Hud } from './Hud';
import { InfoScreen } from './InfoScreen';
import { Intro } from './Intro';
import { Lobby } from './Lobby';
import { ShopScreen } from './ShopScreen';
import { useUiStore } from './store';
import { Toast } from './Toast';
import { useGameRuntime, type GameRuntimeFactory } from './useGameRuntime';

export interface MinerAppProps {
  developerToolsEnabled?: boolean;
  /** Builds the simulation around the mounted canvas. Omitted: chrome only. */
  createRuntime?: GameRuntimeFactory;
}

export function MinerApp({ developerToolsEnabled = false, createRuntime }: MinerAppProps) {
  const phase = useUiStore(state => state.phase);
  const { canvasRef, panelRef } = useGameRuntime(createRuntime);
  return (
    <main id="shell">
      {/* The game panel is the keyboard surface: it has to be focusable and hold
          focus from the first frame, or WASD/arrow input goes nowhere. */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-autofocus */}
      <section id="game-panel" ref={panelRef} tabIndex={0} autoFocus>
        <canvas ref={canvasRef} id="game" width={960} height={640} tabIndex={0} aria-label="Stalinload mining game" />
        <Hud />
        <ShopScreen />
        <InfoScreen developerToolsEnabled={developerToolsEnabled} />
        <FuelWarning />
        <Toast />
        {phase === 'intro' && <Intro />}
        {phase === 'lobby' && <Lobby />}
      </section>
      <RuntimeFailure />
    </main>
  );
}
