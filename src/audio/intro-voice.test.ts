// @vitest-environment happy-dom
//
// The splash-screen voice-over loop: it waits its turn, speaks a different lyric
// each time, keeps quiet while the soundtrack is muted, keeps asking while the
// browser refuses to play unprompted, and leaves nothing running behind it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createIntroVoice,
  VOICE_BLOCKED_RETRY_MS,
  VOICE_OPENING_DELAY_MS,
  VOICE_VOLUME
} from './intro-voice';
import { VOICE_GAP_MAX_MS, VOICE_LINES } from './voice-lines';

/** Just enough `<audio>` for the loop, plus a hook to fire its events. */
class FakeVoiceElement {
  src = '';
  preload = '';
  volume = 1;
  currentTime = 0;
  paused = true;
  mp3Supported = true;
  /** Set to make `play()` reject the way a blocked autoplay does. */
  blocked = false;
  play = vi.fn(async () => {
    if (this.blocked) throw new Error('NotAllowedError');
    this.paused = false;
  });
  pause = vi.fn(() => { this.paused = true; });
  removeAttribute = vi.fn((name: string) => { if (name === 'src') this.src = ''; });
  canPlayType = (type: string) => (this.mp3Supported && type === 'audio/mpeg' ? 'probably' : '');

  private listeners = new Map<string, Set<() => void>>();
  addEventListener = vi.fn((type: string, listener: () => void) => {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  });
  removeEventListener = vi.fn((type: string, listener: () => void) => {
    this.listeners.get(type)?.delete(listener);
  });
  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

function asAudio(element: FakeVoiceElement): HTMLAudioElement {
  return element as unknown as HTMLAudioElement;
}

describe('intro voice-over', () => {
  let element: FakeVoiceElement;
  let plays: string[];
  let muted: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    element = new FakeVoiceElement();
    plays = [];
    muted = false;
    element.play.mockImplementation(async () => {
      if (element.blocked) throw new Error('NotAllowedError');
      plays.push(element.src);
      element.paused = false;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeVoice(random: () => number = () => 0.5) {
    return createIntroVoice({
      wantsVoice: () => !muted,
      random,
      createElement: () => asAudio(element)
    });
  }

  /** Finish the line the element is playing and let the next one be scheduled. */
  async function finishLine(): Promise<void> {
    element.emit('ended');
    await vi.advanceTimersByTimeAsync(VOICE_GAP_MAX_MS);
  }

  it('stays silent until the opening delay has passed', async () => {
    const voice = makeVoice();
    voice.start();

    await vi.advanceTimersByTimeAsync(VOICE_OPENING_DELAY_MS - 1);
    expect(element.play).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(element.play).toHaveBeenCalledTimes(1);
    voice.stop();
  });

  it('sets a quiet volume, under the soundtrack it belongs to', () => {
    makeVoice().start();
    expect(element.volume).toBe(VOICE_VOLUME);
    expect(VOICE_VOLUME).toBeLessThan(0.36);
  });

  it('speaks a line, waits a gap, then speaks a different one', async () => {
    const voice = makeVoice();
    voice.start();

    await vi.advanceTimersByTimeAsync(VOICE_OPENING_DELAY_MS);
    expect(plays).toHaveLength(1);

    // Nothing new starts while the current line is still talking.
    await vi.advanceTimersByTimeAsync(VOICE_GAP_MAX_MS * 2);
    expect(plays).toHaveLength(1);

    await finishLine();
    expect(plays).toHaveLength(2);
    expect(plays[1]).not.toBe(plays[0]);
    voice.stop();
  });

  it('keeps going for a long visit without an immediate repeat', async () => {
    let seed = 7;
    const voice = makeVoice(() => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    });
    voice.start();
    await vi.advanceTimersByTimeAsync(VOICE_OPENING_DELAY_MS);
    for (let i = 0; i < 10; i++) await finishLine();

    expect(plays.length).toBe(11);
    for (let i = 1; i < plays.length; i++) expect(plays[i]).not.toBe(plays[i - 1]);
    // Random order, so more than a single alternating pair shows up.
    expect(new Set(plays).size).toBeGreaterThan(2);
    voice.stop();
  });

  it('picks the encoding the browser admits to supporting', async () => {
    const voice = makeVoice();
    voice.start();
    await vi.advanceTimersByTimeAsync(VOICE_OPENING_DELAY_MS);
    expect(plays[0].endsWith('.mp3')).toBe(true);
    voice.stop();

    element.mp3Supported = false;
    const vorbis = makeVoice();
    vorbis.start();
    await vi.advanceTimersByTimeAsync(VOICE_OPENING_DELAY_MS);
    expect(plays[1].endsWith('.ogg')).toBe(true);
    vorbis.stop();
  });

  it('says nothing while the soundtrack is muted, and starts once it is not', async () => {
    muted = true;
    const voice = makeVoice();
    voice.start();

    await vi.advanceTimersByTimeAsync(VOICE_OPENING_DELAY_MS + VOICE_BLOCKED_RETRY_MS * 3);
    expect(element.play).not.toHaveBeenCalled();

    muted = false;
    await vi.advanceTimersByTimeAsync(VOICE_BLOCKED_RETRY_MS);
    expect(plays).toHaveLength(1);
    voice.stop();
  });

  it('keeps asking while the browser blocks playback, then speaks when allowed', async () => {
    element.blocked = true;
    const voice = makeVoice();
    voice.start();

    await vi.advanceTimersByTimeAsync(VOICE_OPENING_DELAY_MS);
    expect(element.play).toHaveBeenCalledTimes(1);
    expect(plays).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(VOICE_BLOCKED_RETRY_MS);
    expect(element.play).toHaveBeenCalledTimes(2);

    element.blocked = false;
    await vi.advanceTimersByTimeAsync(VOICE_BLOCKED_RETRY_MS);
    expect(plays).toHaveLength(1);
    voice.stop();
  });

  it('does not spend a turn of the no-repeat rotation on a blocked line', async () => {
    // Always the first eligible choice, so a consumed turn would be visible as
    // the rotation stepping past the line the block silenced.
    const voice = makeVoice(() => 0);
    voice.start();

    element.blocked = true;
    await vi.advanceTimersByTimeAsync(VOICE_OPENING_DELAY_MS);
    element.blocked = false;
    await vi.advanceTimersByTimeAsync(VOICE_BLOCKED_RETRY_MS);

    expect(plays[0]).toBe(VOICE_LINES[0].mp3);
    voice.stop();
  });

  it('recovers from a line whose asset fails to load', async () => {
    const voice = makeVoice();
    voice.start();
    await vi.advanceTimersByTimeAsync(VOICE_OPENING_DELAY_MS);

    element.emit('error');
    await vi.advanceTimersByTimeAsync(VOICE_GAP_MAX_MS);

    expect(plays).toHaveLength(2);
    voice.stop();
  });

  it('stops the line, the timer and the download when the splash is dismissed', async () => {
    const voice = makeVoice();
    voice.start();
    await vi.advanceTimersByTimeAsync(VOICE_OPENING_DELAY_MS);
    expect(plays).toHaveLength(1);

    voice.stop();

    expect(element.pause).toHaveBeenCalled();
    expect(element.removeAttribute).toHaveBeenCalledWith('src');
    expect(element.removeEventListener).toHaveBeenCalledTimes(2);

    // Neither a finished line nor any amount of waiting brings it back.
    element.emit('ended');
    await vi.advanceTimersByTimeAsync(VOICE_GAP_MAX_MS * 5);
    expect(plays).toHaveLength(1);
  });

  it('ignores a second start and a stop that has nothing to stop', async () => {
    const voice = makeVoice();
    voice.stop();
    voice.start();
    voice.start();

    await vi.advanceTimersByTimeAsync(VOICE_OPENING_DELAY_MS);
    expect(plays).toHaveLength(1);

    voice.stop();
    voice.stop();
    expect(element.pause).toHaveBeenCalledTimes(1);
  });

  it('runs again after a stop, for a player who comes back to the splash', async () => {
    const voice = makeVoice();
    voice.start();
    await vi.advanceTimersByTimeAsync(VOICE_OPENING_DELAY_MS);
    voice.stop();

    voice.start();
    await vi.advanceTimersByTimeAsync(VOICE_OPENING_DELAY_MS);
    expect(plays).toHaveLength(2);
    voice.stop();
  });
});
