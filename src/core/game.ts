import * as THREE from 'three';
import {
  applyShot,
  BOSS_BONUS,
  breakCombo,
  defeatBoss,
  initialScoreState,
  ZONE_COLOR,
  type ScoreState,
  type ShotHit,
  type Zone,
} from './score';
import { pickSpawnPoint, SPAWN_PARAMS } from './spawner';
import { pickExpression } from './expressions';
import { castRay, type RayHit } from './hitscan';
import { Weapon, WEAPON_PARAMS } from './weapon';
import { clearBonus, livesAfterClear, MAX_LIVES, stageStars, STAGES, type StageConfig } from './stages';
import { BOSS_TIMING, BossBrain } from './boss';
import { yawOf } from './orientation';
import { BOSS_PARAMS, Target, type FaceSkin } from '../render/target';
import { Item } from '../render/item';
import { InkShot } from '../render/projectile';
import type { Effects } from '../render/effects';
import type { SceneView } from '../render/scene';
import type { Sfx } from '../audio/sfx';
import type { Hud } from '../ui/hud';
import type { Settings } from '../state/store';

const ITEM_DROP_CHANCE = 0.15;
const MUZZLE = new THREE.Vector3(0.12, -0.2, -0.3);
/** インク弾を撃ち落としたときの点 */
const SHOT_POINTS = 50;
/** 被弾後の無敵時間 [秒] */
const INVULNERABLE_SEC = 1.3;
/** 扇状射撃の1発ごとのずれ [rad] */
const FAN_STEP = 0.12;

export type GamePhase = 'wave' | 'boss' | 'cleared' | 'over';

export interface StageClearInfo {
  stage: number;
  stars: 1 | 2 | 3;
  bonus: number;
  lives: number;
  score: number;
  /** 最後のステージだった */
  allClear: boolean;
}

export interface GameResult extends ScoreState {
  /** 到達したステージ（1始まり） */
  stageReached: number;
  allClear: boolean;
  stars: number[];
}

export interface GameCallbacks {
  onStageClear: (info: StageClearInfo) => void;
  onGameOver: (result: GameResult) => void;
}

/**
 * ステージ制のゲーム進行。各ステージは「雑魚を規定数倒す → ボス戦（ボスだけ）」でクリア。
 * 顔はインク弾を撃ち返してきて、当たるとライフが減る。ライフ0でゲームオーバー。
 * 描画・入力は外から渡し、ここでは進行とルールだけを扱う。
 */
export class Game {
  score: ScoreState = initialScoreState();
  readonly weapon = new Weapon();
  phase: GamePhase = 'wave';
  stageIndex = 0;
  lives = MAX_LIVES;
  kills = 0;
  private time = 0;
  private damageTaken = 0;
  private invulnerable = 0;
  private stars: number[] = [];
  private targets: Target[] = [];
  private items: Item[] = [];
  private shots: InkShot[] = [];
  private spawnTimer = 0;
  private boss: Target | null = null;
  private brain: BossBrain | null = null;
  private wasReloading = false;
  private readonly rng = Math.random;

  constructor(
    private readonly view: SceneView,
    private readonly effects: Effects,
    private readonly sfx: Sfx,
    private readonly hud: Hud,
    private readonly skins: readonly FaceSkin[],
    private readonly settings: Settings,
    private readonly cb: GameCallbacks,
  ) {}

  get stage(): StageConfig {
    return STAGES[this.stageIndex];
  }

  get activeTargets(): readonly Target[] {
    return this.targets.filter((t) => t.alive);
  }

  /** ステージを始める（最初のステージ、またはクリア後の次のステージ） */
  startStage(index: number): void {
    this.clearField();
    this.stageIndex = index;
    this.phase = 'wave';
    this.kills = 0;
    this.damageTaken = 0;
    this.invulnerable = 0;
    this.spawnTimer = 0.5;
    this.weapon.ammo = WEAPON_PARAMS.magazine;
    this.weapon.equip('normal', this.time);
    this.hud.setBoss(null);
    this.hud.showBanner(`STAGE ${index + 1}`, 2);
  }

  update(dt: number): void {
    if (this.phase === 'cleared' || this.phase === 'over') return;
    this.time += dt;
    const now = this.time;
    this.invulnerable = Math.max(0, this.invulnerable - dt);

    this.weapon.update(now);
    const reloading = this.weapon.isReloading(now);
    if (this.wasReloading && !reloading) this.sfx.reloaded();
    this.wasReloading = reloading;

    if (this.phase === 'wave') this.updateWave(dt);
    else this.updateBoss(dt);

    for (const t of this.targets) {
      t.update(dt);
      // 突進がたどり着いた
      if (t.consumeAttack()) this.damagePlayer();
      // 射撃
      const n = t.takeFire(dt, this.rng);
      if (n > 0) this.fireFan(t, n, this.stage.shotSpeed);
    }
    this.targets = this.targets.filter((t) => {
      if (t.state !== 'dead') return true;
      t.dispose();
      return false;
    });
    for (const sh of this.shots) {
      sh.update(dt);
      if (sh.reached) {
        sh.reached = false;
        this.damagePlayer();
      }
    }
    this.shots = this.shots.filter((sh) => {
      if (!sh.dead) return true;
      sh.dispose();
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
      lives: this.lives,
      maxLives: MAX_LIVES,
      status: this.phase === 'boss' ? `STAGE ${this.stageIndex + 1}　BOSS` : `STAGE ${this.stageIndex + 1}　あと${Math.max(0, this.stage.quota - this.kills)}体`,
      score: this.score.score,
      ammo: this.weapon.ammo,
      magazine: WEAPON_PARAMS.magazine,
      reloading,
      reloadProgress: this.weapon.reloadProgress(now),
      weaponLabel: this.weapon.spec.label,
      powerupRemaining: this.weapon.powerupRemaining(now),
      combo: this.score.combo,
    });
    this.hud.drawArrows(this.view.camera, this.targets, this.shots);
    this.hud.setAim(this.aimAt());
    this.sfx.updateListener(this.view.camera);
  }

  private updateWave(dt: number): void {
    const st = this.stage;
    this.spawnTimer -= dt;
    const alive = this.targets.filter((t) => t.alive).length;
    const max = Math.min(st.maxConcurrent, this.settings.maxTargets);
    // 倒した数＋今いる数がノルマを超えないようにする
    if (alive < max && this.kills + alive < st.quota && this.spawnTimer <= 0) {
      this.spawn();
      this.spawnTimer = 0.8 + this.rng() * 1.2;
    }
    if (this.kills >= st.quota) this.startBoss();
  }

  /** ボス戦の開始：他の的・弾はすべて退場させ、ボスだけにする */
  private startBoss(): void {
    this.phase = 'boss';
    for (const t of this.targets) t.dismiss();
    for (const sh of this.shots) sh.dead = true;
    const skin = this.skins[0];
    // プレイヤーが今向いている方向に出す（見失わないように）
    const az = yawOf(this.view.camera.quaternion);
    const p = { azimuth: az, elevation: 0.08, distance: BOSS_PARAMS.distance, rare: false };
    this.boss = new Target(skin, p, { moving: false, speed: 0, rng: this.rng, boss: true, hp: this.stage.bossHp });
    this.targets.push(this.boss);
    this.view.scene.add(this.boss.mesh);
    this.brain = new BossBrain({ volley: this.stage.bossVolley, minions: this.stage.bossMinions });
    this.hud.setBoss(1);
    this.hud.showBanner('BOSS！ 裏の弱点を狙え', 2.5);
    this.sfx.spawnAt(this.boss.position);
  }

  private updateBoss(dt: number): void {
    const boss = this.boss;
    const brain = this.brain;
    if (!boss || !brain || !boss.alive) return;
    for (const a of brain.update(dt, boss.hp / boss.maxHp)) {
      switch (a.type) {
        case 'pattern':
          boss.bossSpin = a.pattern === 'spin';
          if (a.pattern === 'move') {
            // 90〜150度回り込んで、プレイヤーに振り向かせる（座りモードは前方の範囲内）
            const half = this.settings.seated ? SPAWN_PARAMS.seatedAzimuthHalf : Math.PI;
            let to = boss.azimuth + (this.rng() < 0.5 ? -1 : 1) * (Math.PI / 2 + this.rng() * (Math.PI / 3));
            if (this.settings.seated) to = Math.max(-half, Math.min(half, (this.rng() * 2 - 1) * half));
            boss.bossMoveTo(to);
          }
          break;
        case 'windup':
          boss.windup = BOSS_TIMING.windup;
          break;
        case 'volley':
          this.fireFan(boss, a.count, this.stage.shotSpeed * 1.1);
          break;
        case 'summon':
          this.summonMinions(boss, a.count);
          break;
      }
    }
    boss.windup = Math.max(0, boss.windup - dt);
  }

  /** 口から扇状にインク弾を撃つ */
  private fireFan(from: Target, count: number, speed: number): void {
    const origin = from.mouthWorld();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * FAN_STEP;
      // プレイヤー（原点）の左右に少しずらした点を狙う
      const aim = new THREE.Vector3().sub(origin).normalize();
      aim.applyAxisAngle(up, offset);
      const to = origin.clone().add(aim.multiplyScalar(origin.length()));
      const shot = new InkShot(origin, speed, count === 1 ? new THREE.Vector3() : to);
      this.shots.push(shot);
      this.view.scene.add(shot.group);
    }
    this.sfx.shotFired(origin);
  }

  private summonMinions(boss: Target, count: number): void {
    for (let i = 0; i < count; i++) {
      const az = boss.azimuth + (i - (count - 1) / 2) * 0.35;
      const p = { azimuth: az, elevation: boss.elevation + (this.rng() - 0.5) * 0.3, distance: BOSS_PARAMS.distance - 1, rare: false };
      const t = new Target(this.skins[0], p, { moving: false, speed: 0, rng: this.rng, expression: 'angry', lifeSec: Infinity });
      this.targets.push(t);
      this.view.scene.add(t.mesh);
    }
    this.sfx.spawnAt(boss.position);
  }

  private damagePlayer(): void {
    if (this.invulnerable > 0 || this.phase === 'cleared' || this.phase === 'over') return;
    this.lives -= 1;
    this.damageTaken += 1;
    this.invulnerable = INVULNERABLE_SEC;
    this.score = breakCombo(this.score);
    this.hud.damage();
    this.sfx.hurt();
    navigator.vibrate?.(200);
    if (this.lives <= 0) this.gameOver();
  }

  /** 照準（画面中央）の下にあるもの */
  private aimAt(): Zone | 'item' | 'shot' | null {
    const camera = this.view.camera;
    camera.updateMatrixWorld();
    const hit = castRay(camera, 0, 0, this.raycastObjects(), false)[0];
    if (!hit) return null;
    return hit.kind === 'target' ? hit.zone : hit.kind;
  }

  private raycastObjects(): THREE.Object3D[] {
    return [
      ...this.targets.filter((t) => t.alive).map((t) => t.mesh),
      ...this.items.filter((i) => !i.dead).map((i) => i.mesh),
      ...this.shots.filter((s) => !s.dead).map((s) => s.hitMesh),
    ];
  }

  fire(): void {
    if (this.phase !== 'wave' && this.phase !== 'boss') return;
    const now = this.time;
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
    let otherHit = false;
    for (const h of pelletHits.flat()) {
      if (h.kind === 'item') {
        if (h.item.dead) continue;
        h.item.dead = true;
        otherHit = true;
        this.weapon.equip(h.item.kind, now);
        this.sfx.powerup();
        this.hud.showBanner(this.weapon.spec.label);
        continue;
      }
      if (h.kind === 'shot') {
        if (h.shot.dead) continue;
        // インク弾を撃ち落とした
        h.shot.dead = true;
        otherHit = true;
        this.score = { ...this.score, score: this.score.score + SHOT_POINTS };
        this.effects.shockwave(h.point, camera.position);
        this.sfx.shotPop();
        continue;
      }
      targetHits.push(h);
      // ボスは回っているだけなので「動いている的」扱いにしない
      shotHits.push({ zone: h.zone, distanceT: h.target.distanceT, moving: h.target.moving && !h.target.boss });
    }

    if (shotHits.length === 0 && otherHit) {
      // アイテムやインク弾だけ撃った場合はミス扱いにしない
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
    if (this.phase !== 'wave' && this.phase !== 'boss') return;
    if (this.weapon.startReload(this.time)) {
      this.score = breakCombo(this.score);
      this.sfx.reload();
    }
  }

  dispose(): void {
    this.clearField();
    this.hud.setBoss(null);
  }

  /** 開発用：雑魚のノルマを満たしてボス戦へ */
  debugToBoss(): void {
    if (this.phase === 'wave') this.kills = this.stage.quota;
  }

  private clearField(): void {
    this.targets.forEach((t) => t.dispose());
    this.items.forEach((i) => i.dispose());
    this.shots.forEach((s) => s.dispose());
    this.targets = [];
    this.items = [];
    this.shots = [];
    this.boss = null;
    this.brain = null;
    this.effects.clear();
  }

  private onTargetHit(h: Extract<RayHit, { kind: 'target' }>, points: number): void {
    const t = h.target;
    const wasAlive = t.alive;
    const defeated = t.damage(h.weak ? BOSS_PARAMS.weakDamage : 1);
    const hl = t.skin.highlights?.[h.zone];
    if (hl) this.effects.zoneFlash(t.mesh, hl, ZONE_COLOR[h.zone]);
    this.effects.splash(t.mesh, h.point, h.normal);
    this.effects.shockwave(h.point, this.view.camera.position);
    this.hud.popup(this.view.camera, h.point, h.zone, points, h.weak ? 'WEAK!' : undefined);
    this.hud.inkFlash();
    this.sfx.hit(h.zone);
    navigator.vibrate?.(30);
    if (t.boss) {
      this.hud.setBoss(t.hp / t.maxHp);
      if (defeated) this.stageClear();
      return;
    }
    // 雑魚戦で倒した数を数える（ボスの子分は数えない）
    if (defeated && wasAlive && this.phase === 'wave') this.kills += 1;
    // 口開けの的は、口に当てると必ずアイテムを出す
    const mouthBonus = t.personality.mouthBonus && h.zone === 'mouth';
    if (wasAlive && defeated && (t.rare || mouthBonus || this.rng() < ITEM_DROP_CHANCE)) {
      const item = new Item(this.rng() < 0.5 ? 'pierce' : 'spread', t.position);
      this.items.push(item);
      this.view.scene.add(item.mesh);
    }
  }

  private stageClear(): void {
    this.phase = 'cleared';
    this.score = defeatBoss(this.score);
    const stars = stageStars(this.damageTaken);
    this.stars.push(stars);
    this.lives = livesAfterClear(this.lives);
    const bonus = clearBonus(stars, this.lives);
    this.score = { ...this.score, score: this.score.score + bonus };
    for (const t of this.targets) if (!t.boss) t.dismiss();
    for (const sh of this.shots) sh.dead = true;
    this.hud.setBoss(null);
    this.hud.showBanner(`BOSS DOWN! +${BOSS_BONUS}`, 2);
    this.sfx.fanfare();
    const allClear = this.stageIndex >= STAGES.length - 1;
    // 撃破演出を少し見せてから通知する
    window.setTimeout(() => {
      this.cb.onStageClear({ stage: this.stageIndex + 1, stars, bonus, lives: this.lives, score: this.score.score, allClear });
    }, 1400);
  }

  private gameOver(): void {
    this.phase = 'over';
    this.hud.setBoss(null);
    this.hud.showBanner('GAME OVER', 2);
    window.setTimeout(() => this.cb.onGameOver(this.result(false)), 1400);
  }

  /** 全ステージクリア後に呼ぶ */
  finishAllClear(): GameResult {
    return this.result(true);
  }

  private result(allClear: boolean): GameResult {
    return { ...this.score, stageReached: this.stageIndex + 1, allClear, stars: [...this.stars] };
  }

  private spawn(): void {
    const st = this.stage;
    const p = pickSpawnPoint(this.rng, this.settings.seated);
    const skin = this.skins[Math.floor(this.rng() * this.skins.length)];
    const expression = pickExpression(this.rng, st.expressions, skin.photoExpression);
    const t = new Target(skin, p, {
      moving: this.rng() < st.movingRatio,
      speed: st.speed,
      rng: this.rng,
      expression,
      fireIntervalMul: st.fireIntervalMul,
    });
    this.targets.push(t);
    this.view.scene.add(t.mesh);
    this.sfx.spawnAt(t.position);
  }
}
