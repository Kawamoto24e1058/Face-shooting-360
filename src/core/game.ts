import * as THREE from 'three';
import { applyShot, breakCombo, initialScoreState, ZONE_COLOR, type ScoreState, type ShotHit, type Zone } from './score';
import { pickSpawnPoint, waveConfig } from './spawner';
import { castRay, type RayHit } from './hitscan';
import { Weapon, WEAPON_PARAMS } from './weapon';
import { Target, type FaceSkin } from '../render/target';
import { Item } from '../render/item';
import type { Effects } from '../render/effects';
import type { SceneView } from '../render/scene';
import type { Sfx } from '../audio/sfx';
import type { Hud } from '../ui/hud';
import type { Settings } from '../state/store';

export const GAME_DURATION_SEC = 90;

/** 開発時のみ ?duration=秒 で1プレイの長さを変えられる（動作確認用） */
function durationSec(): number {
  if (import.meta.env.DEV) {
    const d = Number(new URLSearchParams(location.search).get('duration'));
    if (d > 0) return d;
  }
  return GAME_DURATION_SEC;
}
const ITEM_DROP_CHANCE = 0.15;
const MUZZLE = new THREE.Vector3(0.12, -0.2, -0.3);

/** 1プレイ分のゲームループ。描画・入力は外から渡し、ここでは進行とルールだけを扱う */
export class Game {
  elapsed = 0;
  score: ScoreState = initialScoreState();
  readonly weapon = new Weapon();
  private targets: Target[] = [];
  private items: Item[] = [];
  private spawnTimer = 0;
  private wave = -1;
  private finalAnnounced = false;
  private finished = false;
  private wasReloading = false;
  private readonly rng = Math.random;
  private readonly duration = durationSec();

  constructor(
    private readonly view: SceneView,
    private readonly effects: Effects,
    private readonly sfx: Sfx,
    private readonly hud: Hud,
    private readonly skins: readonly FaceSkin[],
    private readonly settings: Settings,
    private readonly onEnd: (result: ScoreState) => void,
  ) {}

  get activeTargets(): readonly Target[] {
    return this.targets.filter((t) => t.alive);
  }

  get timeLeft(): number {
    return Math.max(0, this.duration - this.elapsed);
  }

  update(dt: number): void {
    if (this.finished) return;
    this.elapsed += dt;
    const now = this.elapsed;

    this.weapon.update(now);
    const reloading = this.weapon.isReloading(now);
    if (this.wasReloading && !reloading) this.sfx.reloaded();
    this.wasReloading = reloading;

    const cfg = waveConfig(this.elapsed, this.settings.maxTargets);
    if (cfg.wave !== this.wave) {
      this.wave = cfg.wave;
      if (cfg.wave > 0 && !cfg.final) this.hud.showBanner(`WAVE ${cfg.wave + 1}`);
    }
    if (cfg.final && !this.finalAnnounced) {
      this.finalAnnounced = true;
      // ボス顔は段階4で実装する
      this.hud.showBanner('FINAL WAVE!', 2);
    }

    this.spawnTimer -= dt;
    const aliveCount = this.targets.filter((t) => t.alive).length;
    if (aliveCount < cfg.maxConcurrent && this.spawnTimer <= 0) {
      this.spawn(cfg.movingRatio, cfg.speed);
      this.spawnTimer = cfg.spawnIntervalSec * (0.6 + this.rng() * 0.8);
    }

    for (const t of this.targets) t.update(dt);
    this.targets = this.targets.filter((t) => {
      if (t.state !== 'dead') return true;
      t.dispose();
      return false;
    });
    for (const it of this.items) it.update(dt);
    this.items = this.items.filter((it) => {
      if (!it.dead) return true;
      it.dispose();
      return false;
    });
    this.effects.update(dt);

    this.hud.update({
      timeLeft: this.timeLeft,
      score: this.score.score,
      ammo: this.weapon.ammo,
      magazine: WEAPON_PARAMS.magazine,
      reloading,
      reloadProgress: this.weapon.reloadProgress(now),
      weaponLabel: this.weapon.spec.label,
      powerupRemaining: this.weapon.powerupRemaining(now),
      combo: this.score.combo,
    });
    this.hud.drawArrows(this.view.camera, this.targets);
    this.hud.setAim(this.aimAt());
    this.sfx.updateListener(this.view.camera);

    if (this.elapsed >= this.duration) this.finish();
  }

  /** 照準（画面中央）の下にあるもの */
  private aimAt(): Zone | 'item' | null {
    const camera = this.view.camera;
    camera.updateMatrixWorld();
    const hit = castRay(camera, 0, 0, this.raycastObjects(), false)[0];
    if (!hit) return null;
    return hit.kind === 'item' ? 'item' : hit.zone;
  }

  private raycastObjects(): THREE.Object3D[] {
    return [
      ...this.targets.filter((t) => t.alive).map((t) => t.mesh),
      ...this.items.filter((i) => !i.dead).map((i) => i.mesh),
    ];
  }

  fire(): void {
    if (this.finished) return;
    const now = this.elapsed;
    if (!this.weapon.canFire(now)) {
      if (!this.weapon.isReloading(now)) this.reload();
      else this.sfx.empty();
      return;
    }
    this.weapon.fire(now);
    this.sfx.fire();

    const camera = this.view.camera;
    camera.updateMatrixWorld();
    const spec = this.weapon.spec;
    const objects = this.raycastObjects();
    const muzzle = camera.localToWorld(MUZZLE.clone());

    // 全ペレットの判定を先に行う（同じ的に複数ペレットが当たってもよい）
    const pelletHits: RayHit[][] = spec.pellets.map((p) => {
      const hits = castRay(camera, p.x, p.y, objects, spec.pierce);
      const end =
        hits.length > 0
          ? hits[hits.length - 1].point
          : camera.localToWorld(new THREE.Vector3(Math.tan(p.x), Math.tan(p.y), -1).normalize().multiplyScalar(30));
      this.effects.tracer(muzzle, end);
      return hits;
    });

    const shotHits: ShotHit[] = [];
    const targetHits: Extract<RayHit, { kind: 'target' }>[] = [];
    let itemHit = false;
    for (const h of pelletHits.flat()) {
      if (h.kind === 'item') {
        if (h.item.dead) continue;
        h.item.dead = true;
        itemHit = true;
        this.weapon.equip(h.item.kind, now);
        this.sfx.powerup();
        this.hud.showBanner(this.weapon.spec.label);
        continue;
      }
      targetHits.push(h);
      shotHits.push({ zone: h.zone, distanceT: h.target.distanceT, moving: h.target.moving });
    }

    if (shotHits.length === 0 && itemHit) {
      // アイテムだけ撃った場合はミス扱いにしない
      this.score = { ...this.score, shots: this.score.shots + 1 };
    } else {
      const { state, points } = applyShot(this.score, shotHits, spec.scoreMultiplier);
      this.score = state;
      if (shotHits.length === 0) this.sfx.miss();
      targetHits.forEach((h, i) => this.onTargetHit(h, points[i]));
    }

    if (this.weapon.ammo === 0) this.reload();
  }

  reload(): void {
    if (this.finished) return;
    if (this.weapon.startReload(this.elapsed)) {
      this.score = breakCombo(this.score);
      this.sfx.reload();
    }
  }

  dispose(): void {
    this.targets.forEach((t) => t.dispose());
    this.items.forEach((i) => i.dispose());
    this.targets = [];
    this.items = [];
    this.effects.clear();
  }

  private onTargetHit(h: Extract<RayHit, { kind: 'target' }>, points: number): void {
    const wasAlive = h.target.alive;
    h.target.hit();
    const hl = h.target.skin.highlights?.[h.zone];
    if (hl) this.effects.zoneFlash(h.target.mesh, hl, ZONE_COLOR[h.zone]);
    this.effects.splash(h.target.mesh, h.point);
    this.effects.shockwave(h.point, this.view.camera.position);
    this.hud.popup(this.view.camera, h.point, h.zone, points);
    this.hud.inkFlash();
    this.sfx.hit(h.zone);
    navigator.vibrate?.(30);
    if (wasAlive && (h.target.rare || this.rng() < ITEM_DROP_CHANCE)) {
      const item = new Item(this.rng() < 0.5 ? 'pierce' : 'spread', h.target.position);
      this.items.push(item);
      this.view.scene.add(item.mesh);
    }
  }

  private spawn(movingRatio: number, speed: number): void {
    const p = pickSpawnPoint(this.rng, this.settings.seated);
    const skin = this.skins[Math.floor(this.rng() * this.skins.length)];
    const t = new Target(skin, p, { moving: this.rng() < movingRatio, speed, rng: this.rng });
    this.targets.push(t);
    this.view.scene.add(t.mesh);
    this.sfx.spawnAt(t.position);
  }

  private finish(): void {
    this.finished = true;
    this.onEnd(this.score);
  }
}
