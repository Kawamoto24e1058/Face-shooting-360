import * as THREE from 'three';
import { toCartesian, SPAWN_PARAMS, type SpawnPoint } from '../core/spawner';
import type { ZoneMask } from '../face/zoneMask';
import type { Zone } from '../core/score';

const DEG = Math.PI / 180;
const planeGeometry = new THREE.PlaneGeometry(1, 1);
/** お面の側面・裏の色 */
const SHELL_COLOR = 0xf3e7da;
/** 立体の顔を見せるための首振り */
const SWAY_YAW = 28 * DEG;
const SWAY_PITCH = 8 * DEG;

export interface FaceSkin {
  texture: THREE.Texture;
  mask: ZoneMask;
  /** 部位ごとの白塗り画像（命中時に光らせる） */
  highlights?: Partial<Record<Zone, THREE.Texture>>;
  /** 立体のお面メッシュ（グループ0: 表面, 1: 側面・裏）。無ければ板で表示 */
  geometry?: THREE.BufferGeometry;
}

export type TargetState = 'enter' | 'alive' | 'hit' | 'leave' | 'dead';

const ENTER_SEC = 0.35;
const LEAVE_SEC = 0.35;
const HIT_HOLD_SEC = 0.45;

export class Target {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
  readonly mask: ZoneMask;
  readonly skin: FaceSkin;
  state: TargetState = 'enter';
  azimuth: number;
  elevation: number;
  readonly baseElevation: number;
  readonly distance: number;
  readonly rare: boolean;
  readonly moving: boolean;
  private readonly azVel: number;
  private readonly bobAmp: number;
  private readonly bobFreq: number;
  private readonly size: number;
  private age = 0;
  private stateAge = 0;
  private readonly lifeSec: number;
  private readonly swayPhase: number;
  private readonly swayFreq: number;

  constructor(skin: FaceSkin, p: SpawnPoint, opts: { moving: boolean; speed: number; rng: () => number }) {
    const { rng } = opts;
    this.skin = skin;
    this.mask = skin.mask;
    this.azimuth = p.azimuth;
    this.elevation = this.baseElevation = p.elevation;
    this.distance = p.distance;
    this.rare = p.rare;
    this.moving = opts.moving;
    this.azVel = opts.moving ? (rng() < 0.5 ? -1 : 1) * opts.speed * (0.5 + rng() * 0.5) : 0;
    this.bobAmp = opts.moving ? (4 + rng() * 6) * DEG : 0;
    this.bobFreq = 0.5 + rng();
    // 遠くても見えるよう、距離に応じて少し大きくする
    this.size = (p.rare ? 1.0 : 1.35) * (0.7 + 0.3 * (p.distance / SPAWN_PARAMS.distanceMin));
    this.lifeSec = 6 + rng() * 4;
    this.swayPhase = rng() * Math.PI * 2;
    this.swayFreq = 0.3 + rng() * 0.3;
    this.mesh = skin.geometry
      ? new THREE.Mesh(skin.geometry, [
          new THREE.MeshLambertMaterial({ map: skin.texture }),
          new THREE.MeshLambertMaterial({ color: SHELL_COLOR }),
        ])
      : new THREE.Mesh(
          planeGeometry,
          new THREE.MeshBasicMaterial({ map: skin.texture, transparent: true, alphaTest: 0.05, side: THREE.FrontSide }),
        );
    this.mesh.userData.target = this;
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
    return (this.distance - SPAWN_PARAMS.distanceMin) / (SPAWN_PARAMS.distanceMax - SPAWN_PARAMS.distanceMin);
  }

  hit(): void {
    if (!this.alive) return;
    this.setState('hit');
  }

  update(dt: number): void {
    this.age += dt;
    this.stateAge += dt;
    if (this.alive && this.moving) {
      this.azimuth += this.azVel * dt;
      this.elevation = this.rare
        ? this.baseElevation
        : Math.min(
            SPAWN_PARAMS.elevationMax,
            Math.max(SPAWN_PARAMS.elevationMin, this.baseElevation + Math.sin(this.age * this.bobFreq * Math.PI * 2) * this.bobAmp),
          );
    }
    let scale = 1;
    switch (this.state) {
      case 'enter':
        scale = easeOutBack(Math.min(1, this.stateAge / ENTER_SEC));
        if (this.stateAge >= ENTER_SEC) this.setState('alive');
        break;
      case 'alive':
        if (this.age >= this.lifeSec) this.setState('leave');
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
    this.mesh.scale.setScalar(Math.max(0.001, scale * this.size));
    this.place();
  }

  dispose(): void {
    this.mesh.removeFromParent();
    const mats = this.mesh.material;
    (Array.isArray(mats) ? mats : [mats]).forEach((m) => m.dispose());
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
    if (this.skin.geometry) {
      // 少し首を振らせて、立体であることが分かるようにする
      const t = this.age * this.swayFreq * Math.PI * 2 + this.swayPhase;
      this.mesh.rotateY(Math.sin(t) * SWAY_YAW);
      this.mesh.rotateX(Math.sin(t * 0.7) * SWAY_PITCH);
    }
  }
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
