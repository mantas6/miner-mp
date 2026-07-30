import './styles.css';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { isDeveloperToolsEnabled } from './developer';
import { MinerApp } from './ui';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element for React GUI shell.');

const root = createRoot(rootElement);
const developerToolsEnabled = isDeveloperToolsEnabled(
  import.meta.env.DEV,
  import.meta.env.VITE_ENABLE_DEVELOPER_TOOLS
);

flushSync(() => {
  root.render(<MinerApp developerToolsEnabled={developerToolsEnabled} />);
});

const { initGame } = await import('./game');
initGame({ developerToolsEnabled });
