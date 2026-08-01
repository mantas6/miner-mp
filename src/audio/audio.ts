import { setMusicIcon, setSfxIcon, setSoundBlockedStatus, setSoundUnavailableStatus } from '../ui/store';
import { loadAudioSettings, saveAudioSettings } from './audio-settings';
import { pickSource, prefersMp3 } from './encoding';
import { DEFAULT_TRACK_ID, TRACKS } from './tracks';
import type { MusicTrack, TrackId } from './tracks';
import type { AudioController } from '../core/types';

type ToastFn = (message: string) => void;

export function createAudio(toast: ToastFn): AudioController {
  /** Which encoding this browser gets; decided once, when the element is made. */
  let preferMp3 = true;
  const settings = loadAudioSettings();

  function trackSrc(track: MusicTrack): string {
    return pickSource(track, preferMp3);
  }

  function persist(): void {
    saveAudioSettings({music: audio.musicEnabled, sfx: audio.sfxEnabled});
  }

  /**
   * The buttons show what is *audible*, not what is merely wanted: before the
   * browser grants audio both read as off, so pressing one retries the unlock.
   */
  function syncButtons(): void {
    setMusicIcon(audio.enabled && audio.musicEnabled);
    setSfxIcon(audio.enabled && audio.sfxEnabled);
  }

  /** Resume the shared context. Every way of turning audio on funnels in here. */
  async function unlock(): Promise<boolean> {
    if (audio.enabled) return true;
    try {
      audio.init();
      if (!audio.ctx) return false;
      if (audio.ctx.state === 'suspended') await audio.ctx.resume();
      audio.enabled = true;
      return true;
    } catch {
      audio.enabled = false;
      setSoundBlockedStatus();
      toast('Audio blocked by browser — press Music or Sound after a tap/click.');
      return false;
    }
  }

  const audio: AudioController = {
    ctx: null,
    enabled: false,
    musicEnabled: settings.music,
    sfxEnabled: settings.sfx,
    get wantsSound() { return this.musicEnabled || this.sfxEnabled; },
    master: null,
    musicGain: null,
    musicEl: null,
    musicTimer: null,
    step: 0,
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
      this.musicGain.gain.value = 0.065;
      this.musicGain.connect(this.master);
      this.musicEl = new Audio();
      preferMp3 = prefersMp3(this.musicEl);
      this.musicEl.src = trackSrc(TRACKS[this.currentTrackId]);
      this.musicEl.loop = true;
      this.musicEl.preload = 'auto';
      this.musicEl.volume = 0.36;
    },
    /** The gesture-unlock path: bring back whatever the player left switched on. */
    async enable() {
      if (!await unlock()) return false;
      if (this.musicEnabled) await this.startMusic();
      syncButtons();
      if (this.sfxEnabled) this.blip(720, 0.10, 'square', 0.11);
      if (this.wantsSound) toast(this.musicEnabled ? 'Soundtrack on' : 'Sound effects on');
      return true;
    },
    async toggleMusic() {
      if (this.enabled && this.musicEnabled) {
        this.musicEnabled = false;
        this.stopMusic();
        persist();
        syncButtons();
        // The click itself is an effect, so it only sounds if effects are on.
        this.blip(180, 0.05, 'square', 0.08);
        return toast('Music off');
      }
      this.musicEnabled = true;
      persist();
      if (!await unlock()) return;
      await this.startMusic();
      syncButtons();
      toast('Music on');
    },
    async toggleSfx() {
      if (this.enabled && this.sfxEnabled) {
        this.blip(180, 0.05, 'square', 0.08);
        this.sfxEnabled = false;
        persist();
        syncButtons();
        return toast('Sound effects off');
      }
      this.sfxEnabled = true;
      persist();
      if (!await unlock()) return;
      syncButtons();
      this.blip(720, 0.10, 'square', 0.11);
      toast('Sound effects on');
    },
    blip(freq=440, dur=0.08, type: OscillatorType = 'sine', gain=0.06, slide=0) {
      if (!this.enabled || !this.sfxEnabled || !this.ctx || !this.master) return;
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
      if (!this.enabled || !this.sfxEnabled || !this.ctx || !this.master) return;
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
    async startMusic() {
      this.stopMusic();
      if (!this.enabled || !this.musicEnabled) return false;
      if (this.musicEl) {
        this.musicEl.currentTime = this.musicEl.currentTime || 0;
        try {
          await this.musicEl.play();
          return true;
        } catch {
          this.startSynthMusic();
          return false;
        }
      }
      this.startSynthMusic();
      return false;
    },
    startSynthMusic() {
      const bass = [55,55,65.4,55,73.4,65.4,49,49];
      const lead = [220,0,247,262,0,196,185,0,220,247,294,262,0,196,165,0];
      this.musicTimer = window.setInterval(() => {
        if (!this.enabled || !this.musicEnabled || !this.ctx) return;
        const i = this.step++;
        const now = this.ctx.currentTime;
        const root = bass[i % bass.length];
        this.musicNote(root, 0.28, 'sine', 0.026, now);
        if (i % 2 === 0) {
          const f = lead[(i/2) % lead.length | 0];
          if (f) this.musicNote(f, 0.16, 'triangle', 0.018, now + 0.02);
        }
      }, 240);
    },
    musicNote(freq: number, dur: number, type: OscillatorType, gain: number, start: number) {
      if (!this.ctx || !this.musicGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const filt = this.ctx.createBiquadFilter();
      osc.type = type; osc.frequency.value = freq;
      filt.type = 'lowpass'; filt.frequency.value = 850;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(gain, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(filt); filt.connect(g); g.connect(this.musicGain);
      osc.start(start); osc.stop(start + dur + 0.05);
    },
    stopMusic() { if (this.musicTimer) clearInterval(this.musicTimer); this.musicTimer = null; if (this.musicEl) this.musicEl.pause(); },
    setTrack(trackId: TrackId) {
      if (trackId === this.currentTrackId) return;
      // Swapping the source pauses the element, so remember the state first and
      // pick playback back up on the new track from its own beginning.
      const wasPlaying = this.musicTimer !== null || (this.musicEl !== null && !this.musicEl.paused);
      this.currentTrackId = trackId;
      if (this.musicEl) {
        this.musicEl.src = trackSrc(TRACKS[trackId]);
        this.musicEl.currentTime = 0;
      }
      if (wasPlaying) void this.startMusic();
    }
  };

  return audio;
}
