// The application shell.
//
// Everything inside is a component subscribed to `store.ts`; the game writes to
// that store once per frame and never touches the DOM outside the canvas. The
// element ids that remain (#game, #game-panel, and the button/dialog ids the
// tests and the keyboard layer reach for) are a deliberate, documented contract.

import { FuelWarning } from './FuelWarning';
import { Hud } from './Hud';
import { InfoScreen } from './InfoScreen';
import { Intro } from './Intro';
import { Lobby } from './Lobby';
import { ShopScreen } from './ShopScreen';
import { Toast } from './Toast';

export function MinerApp({ developerToolsEnabled = false }: { developerToolsEnabled?: boolean }) {
  return (
    <main id="shell">
      <section id="game-panel" tabIndex={0} autoFocus>
        <canvas id="game" width={960} height={640} tabIndex={0} aria-label="Moleload mining game" />
        <Hud />
        <ShopScreen />
        <InfoScreen developerToolsEnabled={developerToolsEnabled} />
        <FuelWarning />
        <Toast />
        <Lobby />
        <Intro />
      </section>
    </main>
  );
}
