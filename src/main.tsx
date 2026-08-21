import './styles/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createGameRuntime } from './game/game';
import { AppErrorBoundary } from './ui/Failure';
import { MinerApp } from './ui/ui';
import type { GameRuntimeFactory } from './ui/useGameRuntime';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element for React GUI shell.');

// One stable identity, so the effect that owns the runtime never re-runs for a
// changed prop — only for an actual mount or unmount.
const createRuntime: GameRuntimeFactory = surface => createGameRuntime(surface);

const root = createRoot(rootElement, {
  // <AppErrorBoundary> renders the visible surface for a crash; these two keep the
  // console honest about what it caught, and about anything that escaped it (which
  // unmounts the tree, and with it the runtime).
  onCaughtError(error) {
    console.error('React error handled by the app shell', error);
  },
  onUncaughtError(error) {
    console.error('React error escaped the app shell', error);
    rootElement.dataset.crashed = 'true';
  }
});

// No `flushSync`: the runtime is mounted by an effect against real refs, so the
// game no longer needs the first render to have been committed before it loads.
root.render(
  <StrictMode>
    <AppErrorBoundary>
      <MinerApp createRuntime={createRuntime} />
    </AppErrorBoundary>
  </StrictMode>
);
