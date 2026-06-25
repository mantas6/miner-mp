import { TILE } from './constants.js';

export const VIEW_WIDTH = 960;
export const VIEW_HEIGHT = 640;

export const canvas = document.getElementById('game');
export const gamePanel = document.getElementById('game-panel');

const deviceScale = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
canvas.width = Math.round(VIEW_WIDTH * deviceScale);
canvas.height = Math.round(VIEW_HEIGHT * deviceScale);
canvas.style.aspectRatio = `${VIEW_WIDTH} / ${VIEW_HEIGHT}`;

export const ctx = canvas.getContext('2d');
ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
ctx.imageSmoothingEnabled = true;

export const W = Math.floor(VIEW_WIDTH / TILE);
export const H = Math.floor(VIEW_HEIGHT / TILE);
export const keys = new Set();

export const ui = {
  cash: document.getElementById('cash'),
  depth: document.getElementById('depth'),
  fuel: document.getElementById('fuel'),
  hull: document.getElementById('hull'),
  cargo: document.getElementById('cargo'),
  fuelLabel: document.getElementById('fuelLabel'),
  hullLabel: document.getElementById('hullLabel'),
  cargoLabel: document.getElementById('cargoLabel'),
  cargoList: document.getElementById('cargoList'),
  toast: document.getElementById('toast'),
  fuelWarning: document.getElementById('fuel-warning'),
  soundBtn: document.getElementById('soundBtn'),
  intro: document.getElementById('intro'),
  sell: document.getElementById('sell'),
  fuelBtn: document.getElementById('fuelBtn'),
  repairBtn: document.getElementById('repairBtn'),
  cargoBtn: document.getElementById('cargoBtn'),
  tankBtn: document.getElementById('tankBtn'),
  drillBtn: document.getElementById('drillBtn'),
  infoBtn: document.getElementById('infoBtn'),
  infoScreen: document.getElementById('info-screen'),
  infoCloseBtn: document.getElementById('infoCloseBtn')
};

export function setSoundIcon(on) {
  ui.soundBtn.textContent = on ? '🔊' : '🔇';
}
