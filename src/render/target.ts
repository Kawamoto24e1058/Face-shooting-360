import * as THREE from 'three';
import { toCartesian, SPAWN_PARAMS, type SpawnPoint } from '../core/spawner';
import { EXPRESSION_PARAMS, PERSONALITY, type Personality } from '../core/expressions';
import { EXPRESSIONS, morphIndex, type Expression } from '../face/mesh';
import type { ZoneMask } from '../face/zoneMask';
import type { Zone } from '../core/score';
import { createDecor, hoodColor, type Decor, type DecorKind } from './decor';

const DEG = Math.PI / 180;
const planeGeometry = new THREE.PlaneGeometry(1, 1);
/** 口の中の色 */
const MOUTH_COLOR = 0x3a0d18;
/** ボスの裏（弱点）の色 */
const WEAK_COLOR = 0xff4fa3;
/** 立体の顔を見せるための首振り */
const SWAY_YAW = 8 * DEG;
const SWAY_PITCH = 3 * DEG;

export interface FaceSkin {
  texture: THREE.Texture;
  mask: ZoneMask;
  /** 部位ごとの白塗り画像（命中時に光らせる） */
  highlights?: Partial<Record<Zone, THREE.Texture>>;
  /** 立体のお面メッシュ（グループ0: 表面, 1: 側面・裏, 2: 口の中）。無ければ板で表示 */
  geometry?: THREE.BufferGeometry;
  /** 元写真のおおまかな表情（的の表情を選ぶときに少し出やすくする） */
  photoExpression?: Expression | null;
}

export type TargetState = 'enter' | 'alive' | 'hit' | 'leave' | 'dead';

const ENTER_SEC = 0.35;
const LEAVE_SEC = 0.35;
const HIT_HOLD_SEC = 0.45;
/** 1発当たって耐えたときに「痛っ」と目をつぶる時間 */
const FLINCH_SEC = 0.35;
/** 表情を切り替えるときの補間時間 */
const BLEND_SEC = 0.18;

export const BOSS_PARAMS = {
  size: 2.1,
  distance: 8.5,
  /** 裏の弱点に当てたときのダメージ */
  weakDamage: 4,
  /** 回転の速さ [rad/s]（裏の弱点を見せるとき） */
  spin: 1.6,
  /** 移動の速さ [rad/s] */
  move: 1.1,
} as const;

export interface TargetOptions {
  moving: boolean;
  speed: number;
  rng: () => number;
  expression?: Expression;
  boss?: boolean;
  /** 体力の上書き（ボスはステージごとに決める） */
  hp?: number;
  /** 寿命の上書き（Infinity でずっと残る） */
  lifeSec?: number;
}

export class Target {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
  readonly mask: ZoneMask;
  readonly skin: FaceSkin;
  readonly expression: Expression;
  readonly personality: Personality;
  readonly boss: boolean;
  state: TargetState = 'enter';
  azimuth: number;
  elevation: number;
  readonly baseElevation: number;
  distance: number;
  readonly rare: boolean;
  readonly moving: boolean;
  hp: number;
  readonly maxHp: number;
  private readonly azVel: number;
  private readonly bobAmp: number;
  private readonly bobFreq: number;
  private readonly size: number;
  private age = 0;
  private stateAge = 0;
  private readonly lifeSec: number;
  private readonly swayPhase: number;
  private readonly swayFreq: number;
  private flinch = 0;
  /** 表情の重み（morphTargetInfluences に入れる値の目標） */
  private readonly influence: number[];
  private readonly weakMaterial: THREE.MeshLambertMaterial | null = null;
  private readonly decor: Decor;
  /** ボスが子分を呼ぶ前に口を開けて知らせる残り時間 */
  windup = 0;
  /** 寿命・突進で逃げた */
  private escapePending = false;
  /** ボス：子分がいる間はガード（ダメージを受けない） */
  guarded = false;
  /** ボス：回転して裏を見せているか */
  bossSpin = false;
  private bossAzTarget: number | null = null;
  private spinAngle = 0;

  constructor(skin: FaceSkin, p: SpawnPoint, opts: TargetOptions) {
    const { rng } = opts;
    this.skin = skin;
    this.mask = skin.mask;
    this.boss = !!opts.boss;
    this.expression = opts.expression ?? (this.boss ? 'angry' : 'neutral');
    this.personality = PERSONALITY[this.expression];
    this.azimuth = p.azimuth;
    this.elevation = this.baseElevation = p.elevation;
    this.distance = this.boss ? BOSS_PARAMS.distance : p.distance;
    this.rare = p.rare;
    this.moving = this.boss || opts.moving || this.personality.alwaysMoving || this.personality.charge;
    const speed = opts.speed * this.personality.speedMul;
    this.azVel = this.boss
      ? 0
      : this.moving && !this.personality.charge
        ? (rng() < 0.5 ? -1 : 1) * speed * (0.5 + rng() * 0.5)
        : 0;
    this.bobAmp = this.moving ? (4 + rng() * 6) * DEG : 0;
    this.bobFreq = 0.5 + rng();
    this.hp = this.maxHp = opts.hp ?? this.personality.hp;
    // 遠くても見えるよう、距離に応じて少し大きくする
    this.size = this.boss ? BOSS_PARAMS.size : (p.rare ? 1.0 : 1.35) * (0.7 + 0.3 * (p.distance / SPAWN_PARAMS.distanceMin));
    this.lifeSec = opts.lifeSec ?? (this.boss ? Infinity : 9 + rng() * 4);
    this.swayPhase = rng() * Math.PI * 2;
    this.swayFreq = 0.3 + rng() * 0.3;
    this.influence = new Array(EXPRESSIONS.length - 1).fill(0);

    const decorKind: DecorKind = this.boss ? 'boss' : p.rare ? 'rare' : this.expression;
    if (skin.geometry) {
      const shell = new THREE.MeshLambertMaterial({ color: this.boss ? WEAK_COLOR : hoodColor(decorKind) });
      if (this.boss) {
        shell.emissive.set(WEAK_COLOR);
        this.weakMaterial = shell;
      }
      this.mesh = new THREE.Mesh(skin.geometry, [
        new THREE.MeshLambertMaterial({ map: skin.texture }),
        shell,
        new THREE.MeshLambertMaterial({ color: MOUTH_COLOR }),
      ]);
    } else {
      this.mesh = new THREE.Mesh(
        planeGeometry,
        new THREE.MeshBasicMaterial({ map: skin.texture, transparent: true, alphaTest: 0.05, side: THREE.FrontSide }),
      );
    }
    this.mesh.userData.target = this;
    // 頭まわりの装飾（性格が見た目で分かるように）
    this.decor = createDecor(decorKind);
    this.mesh.add(this.decor.group);
    this.mesh.scale.setScalar(0.001);
    this.place();
  }

  get alive(): boolean {
    return this.state === 'alive' || this.state === 'enter';
  }

  get position(): THREE.Vector3 {
    return this.mesh.position;
  }

  /** 0（近い）〜1（遠い） */
  get distanceT(): number {
    return Math.max(0, (this.distance - SPAWN_PARAMS.distanceMin) / (SPAWN_PARAMS.distanceMax - SPAWN_PARAMS.distanceMin));
  }

  /** 目つぶりの的が目を開けている瞬間（どこに当てても弱点扱い） */
  get weakOpen(): boolean {
    if (!this.personality.blinkWeak || !this.alive) return false;
    const P = EXPRESSION_PARAMS;
    return this.age % (P.blinkClosedSec + P.blinkWeakSec) >= P.blinkClosedSec;
  }

  /** 命中時の部位を性格に応じて読み替える */
  effectiveZone(zone: Zone): Zone {
    return this.weakOpen ? 'eye' : zone;
  }

  /** 口の位置（インク弾の発射点） */
  mouthWorld(): THREE.Vector3 {
    return this.mesh.localToWorld(new THREE.Vector3(0, -0.28, 0.15));
  }

  /** 寿命で逃げた（ゲーム側で1回だけ時間ペナルティにする） */
  consumeEscape(): boolean {
    const e = this.escapePending;
    this.escapePending = false;
    return e;
  }

  /** 退場させる（ボス戦の開始時など） */
  dismiss(): void {
    if (this.alive) this.setState('leave');
  }

  /** ボス：指定の方位へ移動する */
  bossMoveTo(azimuth: number): void {
    this.bossAzTarget = azimuth;
  }

  get bossMoving(): boolean {
    return this.bossAzTarget !== null;
  }

  /** ダメージを与える。倒したら true */
  damage(amount = 1): boolean {
    if (!this.alive) return false;
    if (this.guarded) {
      this.flinch = FLINCH_SEC * 0.5;
      return false;
    }
    this.hp -= amount;
    if (this.hp > 0) {
      this.flinch = FLINCH_SEC;
      return false;
    }
    this.setState('hit');
    return true;
  }

  update(dt: number): void {
    this.age += dt;
    this.stateAge += dt;
    this.flinch = Math.max(0, this.flinch - dt);
    if (this.alive && this.moving) {
      this.azimuth += this.azVel * dt;
      this.elevation = this.rare
        ? this.baseElevation
        : Math.min(
            SPAWN_PARAMS.elevationMax,
            Math.max(SPAWN_PARAMS.elevationMin, this.baseElevation + Math.sin(this.age * this.bobFreq * Math.PI * 2) * this.bobAmp),
          );
    }
    // ボスは怒り顔だが突進はしない（攻撃パターンはゲーム側で決める）
    if (this.alive && this.personality.charge && !this.boss) this.updateCharge(dt);
    if (this.boss) this.updateBoss(dt);

    let scale = 1;
    switch (this.state) {
      case 'enter':
        scale = easeOutBack(Math.min(1, this.stateAge / ENTER_SEC));
        if (this.stateAge >= ENTER_SEC) this.setState('alive');
        break;
      case 'alive':
        if (this.age >= this.lifeSec) {
          this.escapePending = true;
          this.setState('leave');
        }
        break;
      case 'hit':
        // 顔は崩さず、少し揺れてから引っ込む
        scale = 1 + Math.sin(this.stateAge * 40) * 0.05 * (1 - this.stateAge / HIT_HOLD_SEC);
        if (this.stateAge >= HIT_HOLD_SEC) this.setState('leave');
        break;
      case 'leave':
        scale = 1 - Math.min(1, this.stateAge / LEAVE_SEC);
        if (this.stateAge >= LEAVE_SEC) this.setState('dead');
        break;
      case 'dead':
        scale = 0.001;
        break;
    }
    // 耐えたときは一瞬ちぢむ
    if (this.flinch > 0) scale *= 1 - 0.08 * Math.sin((this.flinch / FLINCH_SEC) * Math.PI);
    this.mesh.scale.setScalar(Math.max(0.001, scale * this.size));
    this.updateExpression(dt);
    this.decor.update(dt);
    if (this.weakMaterial) this.weakMaterial.emissiveIntensity = 0.4 + 0.3 * Math.sin(this.age * 6);
    this.place();
  }

  dispose(): void {
    this.decor.dispose();
    this.mesh.removeFromParent();
    const mats = this.mesh.material;
    (Array.isArray(mats) ? mats : [mats]).forEach((m) => m.dispose());
  }

  /** 突進：近づいてきて、目の前まで来ると逃げていく（逃げられると時間ペナルティ） */
  private updateCharge(dt: number): void {
    const P = EXPRESSION_PARAMS;
    if (this.state === 'enter' || this.lifeSec === Infinity) return;
    this.distance = Math.max(P.chargeMinDistance, this.distance - P.chargeSpeed * this.personality.speedMul * dt);
    if (this.distance <= P.chargeMinDistance) {
      this.escapePending = true;
      this.setState('leave');
    }
  }

  private updateBoss(dt: number): void {
    if (this.bossAzTarget !== null) {
      // 近い向きで回り込む
      let d = this.bossAzTarget - this.azimuth;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const step = BOSS_PARAMS.move * dt;
      if (Math.abs(d) <= step) {
        this.azimuth = this.bossAzTarget;
        this.bossAzTarget = null;
      } else {
        this.azimuth += Math.sign(d) * step;
      }
    }
    // 回転して裏を見せる／正面に戻る
    const full = Math.PI * 2;
    if (this.bossSpin) this.spinAngle = (this.spinAngle + BOSS_PARAMS.spin * dt) % full;
    else if (this.spinAngle !== 0) {
      const back = full - this.spinAngle;
      const step = BOSS_PARAMS.spin * 1.5 * dt;
      this.spinAngle = back <= step ? 0 : this.spinAngle + step;
    }
  }

  /** 今の状態に合わせた表情の重みを決めて、なめらかに近づける */
  private updateExpression(dt: number): void {
    const infl = this.mesh.morphTargetInfluences;
    if (!infl) return;
    const target = new Array(this.influence.length).fill(0);
    const set = (e: Expression, v: number) => {
      const i = morphIndex(e);
      if (i >= 0) target[i] = Math.max(target[i], v);
    };
    const e = this.expression;
    if (this.windup > 0 && this.alive) {
      // 子分を呼ぶ前：口を大きく開けて知らせる
      set('mouthOpen', 1);
    } else if (this.state === 'hit' || this.flinch > 0) {
      // 当たったら目をつぶる（顔は崩さない）
      set('eyesClosed', 1);
      set('smile', 0.3);
    } else if (e === 'eyesClosed') {
      // 閉じている時間が長く、弱点の瞬間だけ目を見開く
      if (this.weakOpen) set('surprise', 0.8);
      else set('eyesClosed', 1);
    } else if (e === 'mouthOpen') {
      // 口をパクパクさせる
      set('mouthOpen', 0.55 + 0.45 * Math.abs(Math.sin(this.age * 3.2)));
    } else if (e !== 'neutral') {
      set(e, 1);
      // ときどきまばたき
      if (this.age % 3.1 < 0.12) set('eyesClosed', 1);
    } else if (this.age % 2.7 < 0.12) {
      set('eyesClosed', 1);
    }
    const k = Math.min(1, dt / BLEND_SEC);
    for (let i = 0; i < target.length; i++) {
      this.influence[i] += (target[i] - this.influence[i]) * k;
      infl[i] = this.influence[i];
    }
  }

  private setState(s: TargetState) {
    this.state = s;
    this.stateAge = 0;
  }

  private place() {
    const [x, y, z] = toCartesian(this.azimuth, this.elevation, this.distance);
    this.mesh.position.set(x, y, z);
    // 原点（プレイヤー）に正面を向ける
    this.mesh.lookAt(0, 0, 0);
    if (!this.skin.geometry) return;
    if (this.boss) {
      // ボスは攻撃パターンに合わせて回転し、裏の弱点を見せる
      this.mesh.rotateY(this.spinAngle);
      return;
    }
    // 少し首を振らせて、立体であることが分かるようにする
    const t = this.age * this.swayFreq * Math.PI * 2 + this.swayPhase;
    this.mesh.rotateY(Math.sin(t) * SWAY_YAW);
    this.mesh.rotateX(Math.sin(t * 0.7) * SWAY_PITCH);
  }
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
