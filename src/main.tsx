import './styles/base.css';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { isDeveloperToolsEnabled } from './core/developer';
import { MinerApp } from './ui/ui';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element for React GUI shell.');

const root = createRoot(rootElement);
const developerToolsEnabled = isDeveloperToolsEnabled(
  import.meta.env.DEV,
  import.meta.env.VITE_ENABLE_DEVELOPER_TOOLS
);

// The game module grabs the canvas and the panel at import time, so the first
// render has to be committed synchronously before it loads. Everything else the
// game needs from the UI now goes through the store.
flushSync(() => {
  root.render(<MinerApp developerToolsEnabled={developerToolsEnabled} />);
});

const { initGame } = await import('./game/game');
initGame({ developerToolsEnabled });
