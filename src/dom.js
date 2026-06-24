import { TILE } from './constants.js';

export const canvas = document.getElementById('game');
export const gamePanel = document.getElementById('game-panel');
export const ctx = canvas.getContext('2d');
export const W = Math.floor(canvas.width / TILE);
export const H = Math.floor(canvas.height / TILE);
export const keys = new Set();

export const ui = {
  cash: document.getElementById('cash'),
  depth: document.getElementById('depth'),
  fuel: document.getElementById('fuel'),
  hull: document.getElementById('hull'),
  cargo: document.getElementById('cargo'),
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
  drillBtn: document.getElementById('drillBtn')
};
