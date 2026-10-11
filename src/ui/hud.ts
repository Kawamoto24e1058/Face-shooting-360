import * as THREE from 'three';
import { ZONE_BASE, ZONE_COLOR, ZONE_LABEL, ZONE_NAME_JA, type Zone } from '../core/score';
import type { Target } from '../render/target';

export interface HudValues {
  /** 残り時間 [秒] */
  timeLeft: number;
  /** 画面上部中央の進行表示（例：「STAGE 1　あと5体」） */
  status: string;
  score: number;
  ammo: number;
  magazine: number;
  reloading: boolean;
  reloadProgress: number;
  weaponLabel: string;
  powerupRemaining: number;
  combo: number;
}

const v = new THREE.Vector3();
const inv = new THREE.Quaternion();

/** プレイ中の HUD（DOM）と、画面外の的を示す矢印（2D canvas） */
export class Hud {
  private readonly el: HTMLElement;
  private readonly time: HTMLElement;
  private readonly status: HTMLElement;
  private readonly hurt: HTMLElement;
  private readonly score: HTMLElement;
  private readonly ammo: HTMLElement;
  private readonly weapon: HTMLElement;
  private readonly combo: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly reloadBtn: HTMLButtonElement;
  private readonly aim: HTMLElement;
  private aimKey: string | null = null;
  private readonly bossBar: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly octx: CanvasRenderingContext2D;
  private readonly ink: HTMLElement;
  private last = '';
  effects = true;

  constructor(root: HTMLElement, overlay: HTMLCanvasElement, ink: HTMLElement, onReload: () => void) {
    this.el = root;
    root.innerHTML = `
      <div class="hurt" data-k="hurt"></div>
      <div class="hud-top"><span data-k="time" class="time"></span><span data-k="status" class="status"></span><span data-k="score"></span></div>
      <div class="boss-bar" data-k="boss" hidden><span>BOSS</span><i><b data-k="bossfill"></b></i></div>
      <div class="combo" data-k="combo"></div>
      <div class="combo" data-k="banner" style="top:40%;font-size:28px;color:#fff"></div>
      <div class="reticle"></div>
      <div class="reticle-label" data-k="aim"></div>
      <div class="hud-bottom">
        <div><div class="ammo" data-k="ammo"></div><div class="weapon" data-k="weapon"></div></div>
        <button class="reload-btn" data-k="reload" type="button">RELOAD</button>
      </div>`;
    const q = (k: string) => root.querySelector(`[data-k="${k}"]`) as HTMLElement;
    this.time = q('time');
    this.status = q('status');
    this.hurt = q('hurt');
    this.score = q('score');
    this.ammo = q('ammo');
    this.weapon = q('weapon');
    this.combo = q('combo');
    this.banner = q('banner');
    this.reloadBtn = q('reload') as HTMLButtonElement;
    this.aim = q('aim');
    this.bossBar = q('boss');
    this.bossFill = q('bossfill');
    this.reloadBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      onReload();
    });
    this.overlay = overlay;
    this.octx = overlay.getContext('2d')!;
    this.ink = ink;
  }

  show(on: boolean): void {
    this.el.hidden = !on;
    if (!on) this.clearOverlay();
  }

  update(h: HudValues): void {
    const key = [
      Math.ceil(h.timeLeft),
      h.status,
      h.score,
      h.ammo,
      h.reloading ? Math.round(h.reloadProgress * 10) : -1,
      h.weaponLabel,
      Math.ceil(h.powerupRemaining),
      h.combo,
    ].join('|');
    if (key === this.last) return;
    this.last = key;
    this.time.textContent = `⏱ ${Math.max(0, Math.ceil(h.timeLeft))}`;
    this.time.classList.toggle('low', h.timeLeft <= 10);
    this.status.textContent = h.status;
    this.score.textContent = h.score.toLocaleString();
    this.ammo.textContent = h.reloading ? `RELOAD ${Math.round(h.reloadProgress * 100)}%` : `${h.ammo} / ${h.magazine}`;
    this.weapon.textContent = h.powerupRemaining > 0 ? `${h.weaponLabel} ${Math.ceil(h.powerupRemaining)}s` : h.weaponLabel;
    this.combo.textContent = h.combo >= 2 ? `${h.combo} COMBO` : '';
    this.reloadBtn.classList.toggle('busy', h.reloading);
  }

  /** ボスの体力（0〜1）。null で非表示 */
  setBoss(ratio: number | null): void {
    this.bossBar.hidden = ratio === null;
    if (ratio !== null) this.bossFill.style.width = `${Math.max(0, ratio) * 100}%`;
  }

  /** 照準の下にある部位を、名前と基本点で示す */
  setAim(target: Zone | 'item' | null): void {
    if (target === this.aimKey) return;
    this.aimKey = target;
    if (target === null) {
      this.aim.textContent = '';
      return;
    }
    if (target === 'item') {
      this.aim.style.color = '#ffffff';
      this.aim.textContent = 'アイテム';
      return;
    }
    this.aim.style.color = ZONE_COLOR[target];
    this.aim.textContent = `${ZONE_NAME_JA[target]} ${ZONE_BASE[target]}`;
  }

  /** 時間ペナルティ：画面の縁を一瞬赤くする（演出OFFでも出す） */
  penalty(): void {
    this.hurt.classList.remove('show');
    void this.hurt.offsetWidth;
    this.hurt.classList.add('show');
  }

  showBanner(text: string, sec = 1.5): void {
    this.banner.textContent = text;
    window.setTimeout(() => {
      if (this.banner.textContent === text) this.banner.textContent = '';
    }, sec * 1000);
  }

  /** 命中位置に部位ラベルと得点を出す */
  popup(camera: THREE.Camera, world: THREE.Vector3, zone: Zone, points: number, label?: string): void {
    v.copy(world).project(camera);
    if (v.z > 1) return;
    const d = document.createElement('div');
    d.className = 'popup';
    d.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
    // 照準と重ならないよう少し上に出す
    d.style.top = `${((1 - v.y) / 2) * window.innerHeight - 56}px`;
    d.style.color = ZONE_COLOR[zone];
    const sub = label ? (points > 0 ? `+${points}` : '') : `${ZONE_NAME_JA[zone]} +${points}`;
    d.innerHTML = `${label ?? ZONE_LABEL[zone]}${sub ? `<small>${sub}</small>` : ''}`;
    this.el.appendChild(d);
    window.setTimeout(() => d.remove(), 800);
  }

  /** 命中時に画面の縁へインクを散らす */
  inkFlash(): void {
    if (!this.effects) return;
    const hue = Math.floor(Math.random() * 360);
    const spots = Array.from({ length: 5 }, () => {
      const edge = Math.floor(Math.random() * 4);
      const p = Math.random() * 100;
      const [x, y] = edge === 0 ? [p, 0] : edge === 1 ? [100, p] : edge === 2 ? [p, 100] : [0, p];
      const r = 4 + Math.random() * 6;
      return `radial-gradient(circle at ${x}% ${y}%, hsla(${hue},90%,60%,0.45) ${r}%, transparent ${r + 1}%)`;
    });
    this.ink.style.background = spots.join(',');
    this.ink.classList.add('show');
    requestAnimationFrame(() => requestAnimationFrame(() => this.ink.classList.remove('show')));
  }

  /** 画面外の的の方向を、画面端の矢印で示す */
  drawArrows(camera: THREE.Camera, targets: readonly Target[]): void {
    const c = this.overlay;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = this.octx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    inv.copy(camera.quaternion).invert();
    for (const t of targets) {
      if (!t.alive) continue;
      const color = t.boss ? '#ffffff' : t.rare ? '#ffe14f' : '#ff4fa3';
      this.arrow(camera, t.position, color, t.boss ? 1.8 : 1, w, h);
    }
  }

  private arrow(camera: THREE.Camera, pos: THREE.Vector3, color: string, scale: number, w: number, h: number): void {
    const ctx = this.octx;
    const margin = 28;
    v.copy(pos).project(camera);
    const onScreen = v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
    if (onScreen) return;
    // カメラ座標系での方向（x: 右, y: 上）
    v.copy(pos).applyQuaternion(inv);
    let dx = v.x;
    let dy = -v.y;
    if (Math.hypot(dx, dy) < 1e-3) dy = 1; // 真後ろは下向き矢印
    const ang = Math.atan2(dy, dx);
    // 画面端（矩形）との交点
    const hw = w / 2 - margin;
    const hh = h / 2 - margin;
    const s = Math.min(hw / Math.abs(Math.cos(ang) || 1e-6), hh / Math.abs(Math.sin(ang) || 1e-6));
    ctx.save();
    ctx.translate(w / 2 + Math.cos(ang) * s, h / 2 + Math.sin(ang) * s);
    ctx.rotate(ang);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, -11);
    ctx.lineTo(-8, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  clearOverlay(): void {
    this.octx.setTransform(1, 0, 0, 1, 0, 0);
    this.octx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }
}
