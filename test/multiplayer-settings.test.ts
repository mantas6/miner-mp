// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadServerUrl,
  MULTIPLAYER_SETTINGS_KEY,
  saveServerUrl
} from '../src/multiplayer-settings';

describe('multiplayer settings persistence', () => {
  let values: Map<string, string>;

  beforeEach(() => {
    values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      clear: vi.fn(() => values.clear())
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves the provided default when no server URL has been saved', () => {
    expect(loadServerUrl('wss://default.example')).toBe('wss://default.example');
  });

  it('saves and restores the server URL', () => {
    saveServerUrl('wss://relay.example');

    expect(loadServerUrl('wss://default.example')).toBe('wss://relay.example');
    expect(JSON.parse(localStorage.getItem(MULTIPLAYER_SETTINGS_KEY)!)).toEqual({
      serverUrl: 'wss://relay.example'
    });
  });

  it('uses the default for corrupt saved settings', () => {
    localStorage.setItem(MULTIPLAYER_SETTINGS_KEY, '{bad json');

    expect(loadServerUrl('wss://default.example')).toBe('wss://default.example');
  });

  it('does not fail when localStorage is unavailable', () => {
    vi.mocked(localStorage.getItem).mockImplementation(() => {
      throw new Error('Storage disabled');
    });
    vi.mocked(localStorage.setItem).mockImplementation(() => {
      throw new Error('Storage disabled');
    });

    expect(loadServerUrl('wss://default.example')).toBe('wss://default.example');
    expect(() => saveServerUrl('wss://relay.example')).not.toThrow();
  });
});
