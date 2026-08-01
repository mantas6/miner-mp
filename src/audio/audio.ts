import { setSoundBlockedStatus, setSoundIcon, setSoundUnavailableStatus } from '../ui/store';
import { DEFAULT_TRACK_ID } from './tracks';
import type { TrackId } from './tracks';
import type { SoundtrackRenderedMessage, SoundtrackWorkerRequest, SoundtrackWorkerResponse } from './worker-protocol';
import type { AudioController } from '../core/types';

type ToastFn = (message: string) => void;

/**
 * Music level relative to the master bus. The retired MP3 played through an
 * HTMLAudioElement at volume 0.36, i.e. outside the graph; the rendered buffer
 * goes through `master` (0.55), so 0.36 / 0.55 keeps the same loudness.
 */
const MUSIC_GAIN = 0.65;

/** Fade applied when a loop starts, long enough to hide the buffer's first sample. */
const MUSIC_FADE_IN = 0.3;

/** Fade applied before a source is stopped, so pausing does not pop. */
const MUSIC_FADE_OUT = 0.06;

export function createAudio(toast: ToastFn): AudioController {
  /** Channels straight from the worker, held until an AudioContext can own them. */
  const rendered = new Map<TrackId, SoundtrackRenderedMessage>();
  /** Playable buffers, built lazily on first playback of each track. */
  const buffers = new Map<TrackId, AudioBuffer>();
  /** Tracks whose render is in flight, so a track is never requested twice. */
  const requested = new Set<TrackId>();
  let worker: Worker | null = null;
  let workerFailed = false;
  let warnedUnavailable = false;
  let source: AudioBufferSourceNode | null = null;
  /** Per-source fade so a stop and the next start never fight over one gain node. */
  let sourceFade: GainNode | null = null;
  /** Playback is wanted but the track has not finished rendering yet. */
  let pending = false;
  /** Offset into the loop where the next start resumes from. */
  let resumeOffset = 0;
  /** `ctx.currentTime` when the live source started, for the resume arithmetic. */
  let startedAtCtxTime = 0;

  function musicUnavailable(): void {
    if (warnedUnavailable) return;
    warnedUnavailable = true;
    toast('Music unavailable in this browser.');
  }

  /** Music is off for the rest of the session; sound effects carry on regardless. */
  function failWorker(): void {
    if (workerFailed) return;
    workerFailed = true;
    pending = false;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      worker = null;
    }
    // Never at boot: only someone who has sound on gets told music is missing.
    if (audio.enabled) musicUnavailable();
  }

  function requestRender(trackId: TrackId): void {
    if (!worker || workerFailed) return;
    if (requested.has(trackId) || rendered.has(trackId) || buffers.has(trackId)) return;
    requested.add(trackId);
    const request: SoundtrackWorkerRequest = { type: 'render', trackId };
    // `Worker.postMessage` takes no targetOrigin; the rule matches `Window.postMessage`.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    worker.postMessage(request);
  }

  function handleResponse(message: SoundtrackWorkerResponse): void {
    if (message.type === 'error') {
      failWorker();
      return;
    }
    requested.delete(message.trackId);
    rendered.set(message.trackId, message);
    if (pending && message.trackId === audio.currentTrackId) audio.startMusic(message.trackId);
  }

  function spawnWorker(): void {
    if (typeof Worker === 'undefined') {
      failWorker();
      return;
    }
    try {
      // `new URL(..., import.meta.url)` is the form Vite compiles into a worker chunk.
      worker = new Worker(new URL('./soundtrack.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      failWorker();
      return;
    }
    worker.onmessage = (event: MessageEvent<SoundtrackWorkerResponse>) => { handleResponse(event.data); };
    worker.onerror = () => { failWorker(); };
    requestRender(audio.currentTrackId);
  }

  /** The AudioBuffer for a rendered track, or null while it is still rendering. */
  function ensureBuffer(trackId: TrackId): AudioBuffer | null {
    const cached = buffers.get(trackId);
    if (cached) return cached;
    const raw = rendered.get(trackId);
    const ctx = audio.ctx;
    if (!raw || !ctx) return null;
    const buffer = ctx.createBuffer(2, raw.left.length, raw.sampleRate);
    // `set` rather than `copyToChannel`: the transferred views are typed over
    // `ArrayBufferLike`, which `copyToChannel` will not accept.
    buffer.getChannelData(0).set(raw.left);
    buffer.getChannelData(1).set(raw.right);
    buffers.set(trackId, buffer);
    rendered.delete(trackId);
    return buffer;
  }

  const audio: AudioController = {
    ctx: null,
    enabled: false,
    wantsSound: true,
    master: null,
    musicGain: null,
    currentTrackId: DEFAULT_TRACK_ID,
    lastMove: 0,
    lastLowFuel: 0,
    init() {
      if (this.ctx) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        setSoundUnavailableStatus();
        return toast('Audio is not supported in this browser.');
      }
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = MUSIC_GAIN;
      this.musicGain.connect(this.master);
    },
    async enable() {
      this.wantsSound = true;
      try {
        this.init();
        if (!this.ctx) return false;
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        this.enabled = true;
        setSoundIcon(true);
        const music = this.startMusic();
        this.blip(720, 0.10, 'square', 0.11);
        toast('Soundtrack on');
        if (!music && workerFailed) musicUnavailable();
        return true;
      } catch {
        this.enabled = false;
        setSoundBlockedStatus();
        toast('Sound blocked by browser — press Sound after a tap/click.');
        return false;
      }
    },
    disable() {
      this.wantsSound = false;
      this.enabled = false;
      setSoundIcon(false);
      this.stopMusic();
    },
    async toggle() {
      if (this.enabled) { this.blip(180, 0.05, 'square', 0.08); this.disable(); }
      else await this.enable();
    },
    blip(freq=440, dur=0.08, type: OscillatorType = 'sine', gain=0.06, slide=0) {
      if (!this.enabled || !this.ctx || !this.master) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), now + dur);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain, now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(g); g.connect(this.master);
      osc.start(now); osc.stop(now + dur + 0.02);
    },
    noise(dur=0.12, gain=0.05, filterFreq=700) {
      if (!this.enabled || !this.ctx || !this.master) return;
      const now = this.ctx.currentTime;
      const buffer = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * (1 - i/data.length);
      const src = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      filter.type = 'lowpass'; filter.frequency.value = filterFreq;
      g.gain.setValueAtTime(gain, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.buffer = buffer; src.connect(filter); filter.connect(g); g.connect(this.master);
      src.start(now); src.stop(now + dur);
    },
    mine() { this.noise(0.13, 0.16, 620); this.blip(92, 0.10, 'sawtooth', 0.10, -35); },
    ore(value=20) { this.blip(520, 0.10, 'triangle', 0.14, 220); setTimeout(()=>this.blip(760 + Math.min(500,value), 0.12, 'triangle', 0.12), 70); },
    cash(_value=10) { [0,60,120].forEach((d,i)=>setTimeout(()=>this.blip(740+i*120, 0.08, 'square', 0.11), d)); },
    bump() { this.blip(70, 0.15, 'sawtooth', 0.13, -25); },
    enemyHit() { this.noise(0.10, 0.10, 360); this.blip(230, 0.08, 'sawtooth', 0.10, -80); },
    enemyWake() { this.blip(110, 0.10, 'square', 0.12); setTimeout(()=>this.blip(150, 0.12, 'square', 0.10), 85); },
    alarm() { this.blip(180, 0.12, 'square', 0.13); setTimeout(()=>this.blip(130, 0.16, 'square', 0.13), 120); },
    lowFuel() { this.blip(880, 0.09, 'square', 0.10, -120); setTimeout(()=>this.blip(660, 0.13, 'square', 0.10, -90), 120); },
    startMusic(trackId?: TrackId) {
      const id = trackId ?? this.currentTrackId;
      this.currentTrackId = id;
      pending = false;
      if (!this.enabled || !this.ctx || !this.musicGain || workerFailed) return false;
      const buffer = ensureBuffer(id);
      if (!buffer) {
        // Silence for now; the worker's `rendered` message starts playback.
        pending = true;
        requestRender(id);
        return false;
      }
      this.stopMusic();
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const src = ctx.createBufferSource();
      const fade = ctx.createGain();
      src.buffer = buffer;
      src.loop = true;
      // The bus already sits at MUSIC_GAIN, so this envelope only rides 0 -> 1.
      fade.gain.setValueAtTime(0.0001, now);
      fade.gain.linearRampToValueAtTime(1, now + MUSIC_FADE_IN);
      src.connect(fade);
      fade.connect(this.musicGain);
      src.start(now, resumeOffset % buffer.duration);
      startedAtCtxTime = now;
      source = src;
      sourceFade = fade;
      return true;
    },
    stopMusic() {
      pending = false;
      const src = source;
      const fade = sourceFade;
      if (!src || !fade || !this.ctx) return;
      source = null;
      sourceFade = null;
      const now = this.ctx.currentTime;
      const duration = src.buffer ? src.buffer.duration : 0;
      if (duration > 0) resumeOffset = (resumeOffset + Math.max(0, now - startedAtCtxTime)) % duration;
      const stopAt = now + MUSIC_FADE_OUT;
      fade.gain.cancelScheduledValues(now);
      fade.gain.setValueAtTime(fade.gain.value, now);
      fade.gain.linearRampToValueAtTime(0.0001, stopAt);
      src.onended = () => { src.disconnect(); fade.disconnect(); };
      src.stop(stopAt);
    },
    setTrack(trackId: TrackId) {
      if (trackId === this.currentTrackId) return;
      const wasActive = source !== null || pending;
      this.stopMusic();
      this.currentTrackId = trackId;
      // A different track has no meaningful position to resume from.
      resumeOffset = 0;
      if (wasActive) this.startMusic(trackId);
      else requestRender(trackId);
    }
  };

  // Rendering a loop takes about a second, so it starts during boot rather than
  // on the first gesture. Music being unavailable never blocks sound effects.
  spawnWorker();

  return audio;
}
