import './styles.css';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { initGame } from './game';
import { MinerApp } from './ui';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element for React GUI shell.');

const root = createRoot(rootElement);

flushSync(() => {
  root.render(<MinerApp />);
});

initGame();
