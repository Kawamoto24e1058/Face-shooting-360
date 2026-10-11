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
import { clearBonus, ESCAPE_PENALTY_SEC, stageStars, STAGES, type StageConfig } from './stages';
import { BOSS_TIMING, BossBrain } from './boss';
import { yawOf } from './orientation';
import { BOSS_PARAMS, Target, type FaceSkin } from '../render/target';
import { Item } from '../render/item';
import type { Effects } from '../render/effects';
import type { SceneView } from '../render/scene';
import type { Sfx } from '../audio/sfx';
import type { Hud } from '../ui/hud';
import type { Settings } from '../state/store';

const ITEM_DROP_CHANCE = 0.15;
const MUZZLE = new THREE.Vector3(0.12, -0.2, -0.3);

export type GamePhase = 'wave' | 'boss' | 'cleared' | 'over';

export interface StageClearInfo {
  stage: number;
  stars: 1 | 2 | 3;
  bonus: number;
  timeLeft: number;
  score: number;
  /** 最後のステージだった */
  allClear: boolean;
}

export interface GameResult extends ScoreState {
  /** 到達したステージ（1始まり） */
  stageReached: number;
  /** 時間切れで終わった */
  timeUp: boolean;
  allClear: boolean;
  stars: number[];
}

export interface GameCallbacks {
  onStageClear: (info: StageClearInfo) => void;
  onGameOver: (result: GameResult) => void;
}

/**
 * ステージ制のゲーム進行。各ステージは制限時間内に「雑魚を規定数倒す → ボス戦（ボスだけ）」でクリア。
 * 反撃はない（360度を見回すゲームで後ろから撃たれると対処できないため）。
 * 的に逃げられると残り時間が減り、時間切れで失敗。
 * 描画・入力は外から渡し、ここでは進行とルールだけを扱う。
 */
export class Game {
  score: ScoreState = initialScoreState();
  readonly weapon = new Weapon();
  phase: GamePhase = 'wave';
  stageIndex = 0;
  kills = 0;
  /** ステージの残り時間 [秒] */
  timeLeft = 0;
  private time = 0;
  private stars: number[] = [];
  private targets: Target[] = [];
  private items: Item[] = [];
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
    this.timeLeft = this.stage.timeLimit;
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
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.timeUpFail();
      return;
    }

    this.weapon.update(now);
    const reloading = this.weapon.isReloading(now);
    if (this.wasReloading && !reloading) this.sfx.reloaded();
    this.wasReloading = reloading;

    if (this.phase === 'wave') this.updateWave(dt);
    else this.updateBoss(dt);

    for (const t of this.targets) {
      t.update(dt);
      // 逃げられたら時間ペナルティ（ボス戦の子分は除く）
      if (t.consumeEscape() && this.phase === 'wave') this.escapePenalty(t);
    }
    // 子分がいる間、ボスはガードする
    if (this.boss) this.boss.guarded = this.targets.some((t) => t.alive && t !== this.boss);
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
      status:
        this.phase === 'boss'
          ? `STAGE ${this.stageIndex + 1}　${this.boss?.guarded ? '子分を倒せ' : 'BOSS'}`
          : `STAGE ${this.stageIndex + 1}　あと${Math.max(0, this.stage.quota - this.kills)}体`,
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

  /** ボス戦の開始：他の的はすべて退場させ、ボスだけにする */
  private startBoss(): void {
    this.phase = 'boss';
    for (const t of this.targets) t.dismiss();
    const skin = this.skins[0];
    // プレイヤーが今向いている方向に出す（見失わないように）
    const az = yawOf(this.view.camera.quaternion);
    const p = { azimuth: az, elevation: 0.08, distance: BOSS_PARAMS.distance, rare: false };
    this.boss = new Target(skin, p, { moving: false, speed: 0, rng: this.rng, boss: true, hp: this.stage.bossHp });
    this.targets.push(this.boss);
    this.view.scene.add(this.boss.mesh);
    this.brain = new BossBrain({ minions: this.stage.bossMinions });
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
        case 'summon':
          this.summonMinions(boss, a.count);
          break;
      }
    }
    boss.windup = Math.max(0, boss.windup - dt);
  }

  private summonMinions(boss: Target, count: number): void {
    for (let i = 0; i < count; i++) {
      // ボスの左右・上下に散らして、ボスと重ならないようにする（ボスと同じくらいの距離）
      const side = i % 2 === 0 ? 1 : -1;
      const az = boss.azimuth + side * (0.42 + Math.floor(i / 2) * 0.32);
      const el = boss.elevation + (i % 4 < 2 ? 0.22 : -0.18);
      const p = { azimuth: az, elevation: el, distance: BOSS_PARAMS.distance - 2.5, rare: false };
      const t = new Target(this.skins[0], p, { moving: false, speed: 0, rng: this.rng, expression: 'angry', lifeSec: Infinity });
      this.targets.push(t);
      this.view.scene.add(t.mesh);
    }
    this.sfx.spawnAt(boss.position);
    this.hud.showBanner('子分を倒せ！', 1.6);
  }

  /** 的に逃げられた：残り時間を減らす */
  private escapePenalty(t: Target): void {
    this.timeLeft = Math.max(0, this.timeLeft - ESCAPE_PENALTY_SEC);
    this.score = breakCombo(this.score);
    this.hud.penalty();
    this.hud.popup(this.view.camera, t.position, 'cheek', 0, `-${ESCAPE_PENALTY_SEC}秒`);
    this.sfx.escaped();
  }

  /** 照準（画面中央）の下にあるもの */
  private aimAt(): Zone | 'item' | null {
    const camera = this.view.camera;
    camera.updateMatrixWorld();
    const hit = castRay(camera, 0, 0, this.raycastObjects(), false)[0];
    if (!hit) return null;
    return hit.kind === 'target' ? hit.zone : 'item';
  }

  private raycastObjects(): THREE.Object3D[] {
    return [
      ...this.targets.filter((t) => t.alive).map((t) => t.mesh),
      ...this.items.filter((i) => !i.dead).map((i) => i.mesh),
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
      if (h.target.boss && h.target.guarded) {
        // ガード中のボス：点も入らず、ミスにもしない
        otherHit = true;
        h.target.damage();
        this.hud.popup(camera, h.point, h.zone, 0, 'GUARD');
        this.sfx.empty();
        continue;
      }
      targetHits.push(h);
      // ボスは回っているだけなので「動いている的」扱いにしない
      shotHits.push({ zone: h.zone, distanceT: h.target.distanceT, moving: h.target.moving && !h.target.boss });
    }

    if (shotHits.length === 0 && otherHit) {
      // アイテムやガード中のボスだけ撃った場合はミス扱いにしない
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
    this.targets = [];
    this.items = [];
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
    const stars = stageStars(this.timeLeft, this.stage.timeLimit);
    this.stars.push(stars);
    const bonus = clearBonus(stars, this.timeLeft);
    this.score = { ...this.score, score: this.score.score + bonus };
    for (const t of this.targets) if (!t.boss) t.dismiss();
    this.hud.setBoss(null);
    this.hud.showBanner(`BOSS DOWN! +${BOSS_BONUS}`, 2);
    this.sfx.fanfare();
    const allClear = this.stageIndex >= STAGES.length - 1;
    // 撃破演出を少し見せてから通知する
    window.setTimeout(() => {
      this.cb.onStageClear({ stage: this.stageIndex + 1, stars, bonus, timeLeft: this.timeLeft, score: this.score.score, allClear });
    }, 1400);
  }

  private timeUpFail(): void {
    this.phase = 'over';
    this.hud.setBoss(null);
    this.hud.showBanner('TIME UP', 2);
    this.sfx.timeUp();
    for (const t of this.targets) t.dismiss();
    window.setTimeout(() => this.cb.onGameOver(this.result(false, true)), 1400);
  }

  /** 全ステージクリア後に呼ぶ */
  finishAllClear(): GameResult {
    return this.result(true);
  }

  private result(allClear: boolean, timeUp = false): GameResult {
    return { ...this.score, stageReached: this.stageIndex + 1, allClear, timeUp, stars: [...this.stars] };
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
      lifeSec: st.stay + this.rng() * 2,
    });
    this.targets.push(t);
    this.view.scene.add(t.mesh);
    this.sfx.spawnAt(t.position);
  }
}
