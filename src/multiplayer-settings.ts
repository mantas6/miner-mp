export const MULTIPLAYER_SETTINGS_KEY = 'moleload:multiplayer-settings:v1';

export function loadServerUrl(fallback: string): string {
  try {
    const settings = JSON.parse(localStorage.getItem(MULTIPLAYER_SETTINGS_KEY) || 'null');
    return typeof settings?.serverUrl === 'string' && settings.serverUrl.trim()
      ? settings.serverUrl
      : fallback;
  } catch {
    return fallback;
  }
}

export function saveServerUrl(serverUrl: string): void {
  try {
    localStorage.setItem(MULTIPLAYER_SETTINGS_KEY, JSON.stringify({ serverUrl }));
  } catch {
    // Storage may be disabled or unavailable; connecting should still work.
  }
}
