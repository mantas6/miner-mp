import './styles.css';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { initGame } from './game.js';
import { MinerApp } from './ui.jsx';

const rootElement = document.getElementById('root');
const root = createRoot(rootElement);

flushSync(() => {
  root.render(<MinerApp />);
});

initGame();
