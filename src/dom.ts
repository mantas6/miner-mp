import { TILE } from './constants';

export const VIEW_WIDTH = 960;
export const VIEW_HEIGHT = 640;

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required game DOM element #${id}`);
  return element as T;
}

export const canvas = requireElement<HTMLCanvasElement>('game');
export const gamePanel = requireElement<HTMLElement>('game-panel');

const deviceScale = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
canvas.width = Math.round(VIEW_WIDTH * deviceScale);
canvas.height = Math.round(VIEW_HEIGHT * deviceScale);
canvas.style.aspectRatio = `${VIEW_WIDTH} / ${VIEW_HEIGHT}`;

export const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2D canvas rendering context is unavailable.');
ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
ctx.imageSmoothingEnabled = true;

export const W = Math.floor(VIEW_WIDTH / TILE);
export const H = Math.floor(VIEW_HEIGHT / TILE);
export const keys = new Set();

export const ui = {
  cash: requireElement<HTMLElement>('cash'),
  depth: requireElement<HTMLElement>('depth'),
  fuel: requireElement<HTMLMeterElement>('fuel'),
  hull: requireElement<HTMLMeterElement>('hull'),
  cargo: requireElement<HTMLMeterElement>('cargo'),
  fuelLabel: requireElement<HTMLElement>('fuelLabel'),
  hullLabel: requireElement<HTMLElement>('hullLabel'),
  cargoLabel: requireElement<HTMLElement>('cargoLabel'),
  cargoList: requireElement<HTMLElement>('cargoList'),
  toast: requireElement<HTMLElement>('toast'),
  fuelWarning: requireElement<HTMLElement>('fuel-warning'),
  soundBtn: requireElement<HTMLButtonElement>('soundBtn'),
  intro: requireElement<HTMLElement>('intro'),
  sell: requireElement<HTMLButtonElement>('sell'),
  fuelBtn: requireElement<HTMLButtonElement>('fuelBtn'),
  repairBtn: requireElement<HTMLButtonElement>('repairBtn'),
  cargoBtn: requireElement<HTMLButtonElement>('cargoBtn'),
  tankBtn: requireElement<HTMLButtonElement>('tankBtn'),
  drillBtn: requireElement<HTMLButtonElement>('drillBtn'),
  infoBtn: requireElement<HTMLButtonElement>('infoBtn'),
  infoScreen: requireElement<HTMLElement>('info-screen'),
  infoCloseBtn: requireElement<HTMLButtonElement>('infoCloseBtn')
};

export type GameUi = typeof ui;

export function setSoundIcon(on: boolean): void {
  ui.soundBtn.textContent = on ? '🔊' : '🔇';
}
