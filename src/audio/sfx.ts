import type * as THREE from 'three';
import type { Zone } from '../core/score';

/**
 * 効果音はすべて Web Audio でその場で合成する（外部素材なし＝ライセンス管理が不要）。
 * 的の出現音は PannerNode で左右・前後を表現する。
 * 素材を使う段階で Howler.js に置き換える想定。
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.8;

  /** ユーザー操作（タップ）の中で呼ぶ */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.3);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** リスナーの向きをカメラに合わせる */
  updateListener(camera: THREE.Camera): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const e = camera.matrixWorld.elements;
    const fx = -e[8], fy = -e[9], fz = -e[10];
    const ux = e[4], uy = e[5], uz = e[6];
    const l = ctx.listener;
    if (l.forwardX) {
      const t = ctx.currentTime;
      l.forwardX.setTargetAtTime(fx, t, 0.02);
      l.forwardY.setTargetAtTime(fy, t, 0.02);
      l.forwardZ.setTargetAtTime(fz, t, 0.02);
      l.upX.setTargetAtTime(ux, t, 0.02);
      l.upY.setTargetAtTime(uy, t, 0.02);
      l.upZ.setTargetAtTime(uz, t, 0.02);
    } else {
      (l as unknown as { setOrientation: (...a: number[]) => void }).setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  fire(): void {
    this.noiseBurst(0.08, 1800, 0.5);
    this.tone(220, 90, 0.08, 'square', 0.15);
  }

  hit(zone: Zone): void {
    const pitch: Record<Zone, number> = { eye: 1320, forehead: 990, mouth: 880, nose: 740, cheek: 620, chin: 560 };
    this.tone(pitch[zone], pitch[zone] * 1.5, 0.12, 'triangle', 0.35);
    this.noiseBurst(0.12, 600, 0.3);
  }

  miss(): void {
    this.tone(180, 120, 0.1, 'sine', 0.12);
  }

  empty(): void {
    this.tone(1200, 1200, 0.03, 'square', 0.1);
  }

  reload(): void {
    this.tone(500, 500, 0.04, 'square', 0.15);
    this.tone(700, 700, 0.04, 'square', 0.15, 0.12);
  }

  reloaded(): void {
    this.tone(900, 900, 0.05, 'square', 0.18);
  }

  powerup(): void {
    this.tone(660, 1320, 0.25, 'sawtooth', 0.15);
  }

  beep(high = false): void {
    this.tone(high ? 1320 : 880, high ? 1320 : 880, high ? 0.3 : 0.12, 'sine', 0.3);
  }

  /** 的の出現音。position の方向から聞こえる */
  spawnAt(position: THREE.Vector3): void {
    const p = this.panner(position);
    if (p) this.tone(400, 800, 0.15, 'sine', 0.5, 0, p);
  }

  /** 的に逃げられた（時間ペナルティ） */
  escaped(): void {
    this.tone(500, 250, 0.25, 'triangle', 0.25);
  }

  /** 時間切れ */
  timeUp(): void {
    [440, 349, 262].forEach((f, i) => this.tone(f, f * 0.98, 0.25, 'square', 0.2, i * 0.18));
  }

  /** ステージクリア */
  fanfare(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.18, 'triangle', 0.3, i * 0.12));
  }

  private panner(position: THREE.Vector3): PannerNode | null {
    const ctx = this.ctx;
    if (!ctx || !this.master) return null;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 3;
    if (p.positionX) {
      p.positionX.value = position.x;
      p.positionY.value = position.y;
      p.positionZ.value = position.z;
    } else {
      (p as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(position.x, position.y, position.z);
    }
    p.connect(this.master);
    return p;
  }

  private tone(
    f0: number,
    f1: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    delay = 0,
    dest: AudioNode | null = this.master,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !dest) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseBurst(dur: number, cutoff: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur);
  }
}
