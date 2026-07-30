import { describe, expect, it } from 'vitest';
import { shouldAttemptAutoAudio } from './audio-permission';

describe('audio startup permission helpers', () => {
  it('does not auto-enable sound from keyboard, synthetic startup, or non-gesture paths', () => {
    expect(shouldAttemptAutoAudio({ wantsSound: true, enabled: false })).toBe(false);
    expect(shouldAttemptAutoAudio({ wantsSound: true, enabled: false, eventType: 'keydown', isTrusted: true })).toBe(false);
    expect(shouldAttemptAutoAudio({ wantsSound: true, enabled: false, eventType: 'pointerdown', isTrusted: false })).toBe(false);
  });

  it('allows trusted pointer and touch gestures to try enabling audio once requested', () => {
    expect(shouldAttemptAutoAudio({ wantsSound: true, enabled: false, eventType: 'pointerdown', isTrusted: true })).toBe(true);
    expect(shouldAttemptAutoAudio({ wantsSound: true, enabled: false, eventType: 'touchstart', isTrusted: true })).toBe(true);
  });

  it('does not retry auto-audio when sound is disabled by preference or already enabled', () => {
    expect(shouldAttemptAutoAudio({ wantsSound: false, enabled: false, eventType: 'pointerdown', isTrusted: true })).toBe(false);
    expect(shouldAttemptAutoAudio({ wantsSound: true, enabled: true, eventType: 'pointerdown', isTrusted: true })).toBe(false);
  });
});
