import { TILE } from './constants';

export let VIEW_WIDTH = 960;
export let VIEW_HEIGHT = 640;

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required game DOM element #${id}`);
  return element as T;
}

export const canvas = requireElement<HTMLCanvasElement>('game');
export const gamePanel = requireElement<HTMLElement>('game-panel');

export const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2D canvas rendering context is unavailable.');

export let W = Math.floor(VIEW_WIDTH / TILE);
export let H = Math.floor(VIEW_HEIGHT / TILE);

function resizeCanvas(): void {
  VIEW_WIDTH = Math.max(1, Math.round(gamePanel.clientWidth || window.innerWidth));
  VIEW_HEIGHT = Math.max(1, Math.round(gamePanel.clientHeight || window.innerHeight));
  W = Math.floor(VIEW_WIDTH / TILE);
  H = Math.floor(VIEW_HEIGHT / TILE);

  const deviceScale = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  canvas.width = Math.round(VIEW_WIDTH * deviceScale);
  canvas.height = Math.round(VIEW_HEIGHT * deviceScale);
  ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
  ctx.imageSmoothingEnabled = true;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

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
  objectiveStatus: requireElement<HTMLElement>('objectiveStatus'),
  terrainScanner: requireElement<HTMLElement>('terrainScanner'),
  fuelReserve: requireElement<HTMLElement>('fuelReserve'),
  depthMilestone: requireElement<HTMLElement>('depthMilestone'),
  extractionStatus: requireElement<HTMLElement>('extractionStatus'),
  objectiveInfoStatus: requireElement<HTMLElement>('objectiveInfoStatus'),
  extractionInfoStatus: requireElement<HTMLElement>('extractionInfoStatus'),
  cargoFeedback: requireElement<HTMLElement>('cargoFeedback'),
  cargoList: requireElement<HTMLElement>('cargoList'),
  expeditionStats: requireElement<HTMLElement>('expeditionStats'),
  developerUpgrades: requireElement<HTMLElement>('developerUpgrades'),
  toast: requireElement<HTMLElement>('toast'),
  fuelWarning: requireElement<HTMLElement>('fuel-warning'),
  soundBtn: requireElement<HTMLButtonElement>('soundBtn'),
  soundStatus: requireElement<HTMLElement>('soundStatus'),
  connectionStatus: requireElement<HTMLElement>('connectionStatus'),
  serviceStatus: requireElement<HTMLElement>('serviceStatus'),
  lobby: requireElement<HTMLElement>('lobby-screen'),
  lobbyConnectionStatus: requireElement<HTMLElement>('lobbyConnectionStatus'),
  serverUrl: requireElement<HTMLInputElement>('serverUrl'),
  connectBtn: requireElement<HTMLButtonElement>('connectBtn'),
  soloBtn: requireElement<HTMLButtonElement>('soloBtn'),
  intro: requireElement<HTMLElement>('intro'),
  sell: requireElement<HTMLButtonElement>('sell'),
  shopBtn: requireElement<HTMLButtonElement>('shopBtn'),
  fuelBtn: requireElement<HTMLButtonElement>('fuelBtn'),
  repairBtn: requireElement<HTMLButtonElement>('repairBtn'),
  cargoBtn: requireElement<HTMLButtonElement>('cargoBtn'),
  tankBtn: requireElement<HTMLButtonElement>('tankBtn'),
  hullBtn: requireElement<HTMLButtonElement>('hullBtn'),
  drillBtn: requireElement<HTMLButtonElement>('drillBtn'),
  visibilityBtn: requireElement<HTMLButtonElement>('visibilityBtn'),
  dynamiteBtn: requireElement<HTMLButtonElement>('dynamiteBtn'),
  teleporterBtn: requireElement<HTMLButtonElement>('teleporterBtn'),
  gunBtn: requireElement<HTMLButtonElement>('gunBtn'),
  shopDynamiteBtn: requireElement<HTMLButtonElement>('shopDynamiteBtn'),
  shopTeleporterBtn: requireElement<HTMLButtonElement>('shopTeleporterBtn'),
  shopGunBtn: requireElement<HTMLButtonElement>('shopGunBtn'),
  shopBulletsBtn: requireElement<HTMLButtonElement>('shopBulletsBtn'),
  shopScreen: requireElement<HTMLElement>('shop-screen'),
  shopCard: requireElement<HTMLElement>('shop-card'),
  shopCloseBtn: requireElement<HTMLButtonElement>('shopCloseBtn'),
  infoBtn: requireElement<HTMLButtonElement>('infoBtn'),
  infoScreen: requireElement<HTMLElement>('info-screen'),
  infoCard: requireElement<HTMLElement>('info-card'),
  infoCloseBtn: requireElement<HTMLButtonElement>('infoCloseBtn'),
  resetPlayerDataBtn: requireElement<HTMLButtonElement>('resetPlayerDataBtn')
};

export type GameUi = typeof ui;

export function setSoundIcon(on: boolean): void {
  ui.soundBtn.textContent = on ? '🔊' : '🔇';
  ui.soundBtn.setAttribute('aria-label', on ? 'Disable sound' : 'Enable optional sound');
  ui.soundBtn.title = on ? 'Disable sound' : 'Enable optional sound';
  ui.soundStatus.textContent = on ? 'Sound on' : 'Sound off — press Sound to enable';
}

export function setSoundUnavailableStatus(message = 'Sound unavailable in this browser'): void {
  ui.soundBtn.setAttribute('aria-label', message);
  ui.soundBtn.title = message;
  ui.soundStatus.textContent = message;
}

export function setSoundBlockedStatus(): void {
  setSoundIcon(false);
  ui.soundStatus.textContent = 'Sound blocked — press Sound after a tap/click';
}
