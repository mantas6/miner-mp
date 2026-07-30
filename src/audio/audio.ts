import { setSoundBlockedStatus, setSoundIcon, setSoundUnavailableStatus } from '../game/dom';
import type { GameUi } from '../game/dom';
import type { AudioController } from '../core/types';

type ToastFn = (message: string) => void;

export function createAudio(ui: GameUi, toast: ToastFn): AudioController {
  const audio: AudioController = {
    ctx: null,
    enabled: false,
    wantsSound: true,
    master: null,
    musicGain: null,
    musicEl: null,
    musicTimer: null,
    step: 0,
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
      const canMp3 = this.musicEl.canPlayType && this.musicEl.canPlayType('audio/mpeg');
      this.musicEl.src = canMp3 ? 'assets/soviet-soundtrack.mp3' : 'assets/soviet-soundtrack.ogg';
      this.musicEl.loop = true;
      this.musicEl.preload = 'auto';
      this.musicEl.volume = 0.36;
    },
    async enable() {
      this.wantsSound = true;
      try {
        this.init();
        if (!this.ctx) return false;
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        this.enabled = true;
        setSoundIcon(true);
        await this.startMusic();
        this.blip(720, 0.10, 'square', 0.11);
        toast('Soundtrack on');
        return true;
      } catch (err) {
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
    blip(freq=440, dur=0.08, type='sine', gain=0.06, slide=0) {
      if (!this.enabled || !this.ctx) return;
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
      if (!this.enabled || !this.ctx) return;
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
    cash(value=10) { [0,60,120].forEach((d,i)=>setTimeout(()=>this.blip(740+i*120, 0.08, 'square', 0.11), d)); },
    bump() { this.blip(70, 0.15, 'sawtooth', 0.13, -25); },
    enemyHit() { this.noise(0.10, 0.10, 360); this.blip(230, 0.08, 'sawtooth', 0.10, -80); },
    enemyWake() { this.blip(110, 0.10, 'square', 0.12); setTimeout(()=>this.blip(150, 0.12, 'square', 0.10), 85); },
    alarm() { this.blip(180, 0.12, 'square', 0.13); setTimeout(()=>this.blip(130, 0.16, 'square', 0.13), 120); },
    lowFuel() { this.blip(880, 0.09, 'square', 0.10, -120); setTimeout(()=>this.blip(660, 0.13, 'square', 0.10, -90), 120); },
    async startMusic() {
      this.stopMusic();
      if (this.musicEl) {
        this.musicEl.currentTime = this.musicEl.currentTime || 0;
        try {
          await this.musicEl.play();
          return true;
        } catch (err) {
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
        if (!this.enabled || !this.ctx) return;
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
    musicNote(freq, dur, type, gain, start) {
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
    stopMusic() { if (this.musicTimer) clearInterval(this.musicTimer); this.musicTimer = null; if (this.musicEl) this.musicEl.pause(); }
  };

  return audio;
}

