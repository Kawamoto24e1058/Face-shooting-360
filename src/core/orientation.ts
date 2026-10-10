import * as THREE from 'three';

const DEG = Math.PI / 180;
const zee = new THREE.Vector3(0, 0, 1);
const up = new THREE.Vector3(0, 1, 0);
// デバイス座標系（画面が上向き）→ カメラ座標系（画面の奥を見る）への補正: X軸まわりに-90度
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const q0 = new THREE.Quaternion();
const euler = new THREE.Euler();

/** deviceorientation の角度（ラジアン）からカメラ姿勢を求める */
export function orientationToQuaternion(
  out: THREE.Quaternion,
  alpha: number,
  beta: number,
  gamma: number,
  screenAngle: number,
): THREE.Quaternion {
  euler.set(beta, alpha, -gamma, 'YXZ');
  out.setFromEuler(euler);
  out.multiply(q1);
  out.multiply(q0.setFromAxisAngle(zee, -screenAngle));
  return out;
}

export function getScreenAngle(): number {
  const a = screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0;
  return a * DEG;
}

/** 視線の水平方位（ヨー）。-Z が 0 */
export function yawOf(q: THREE.Quaternion): number {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return Math.atan2(-f.x, -f.z);
}

type PermissionFn = () => Promise<'granted' | 'denied'>;

/**
 * iOS 13+ ではユーザー操作（タップ）の中で requestPermission() を呼ぶ必要がある。
 * それ以外の環境では何もしないで granted を返す。
 */
export async function requestOrientationPermission(): Promise<boolean> {
  const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: PermissionFn } })
    .DeviceOrientationEvent;
  if (!DOE) return false;
  if (typeof DOE.requestPermission === 'function') {
    try {
      return (await DOE.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * ジャイロ → カメラ姿勢。
 * - キャリブレーション時の水平方位を正面とする相対方式
 *   （alpha を直接引くと縦持ち時に alpha/gamma が連動するため、姿勢から求めたヨーで補正する）
 * - slerp による軽いローパスフィルタでぶれを抑える
 * - センサーが無い環境（PC）ではドラッグで視点を回せる
 */
export class OrientationController {
  /** 0〜1。大きいほど追従が速い（60fps換算の1フレームあたり係数） */
  smoothing = 0.4;

  private raw: { alpha: number; beta: number; gamma: number } | null = null;
  private readonly sensorQ = new THREE.Quaternion();
  private readonly target = new THREE.Quaternion();
  private readonly current = new THREE.Quaternion();
  private readonly offset = new THREE.Quaternion();
  private initialized = false;

  // ドラッグ操作（センサー非対応時の代替）
  private dragYaw = 0;
  private dragPitch = 0;
  private dragging: { id: number; x: number; y: number; moved: number } | null = null;

  private readonly onOrientation = (e: DeviceOrientationEvent) => {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    this.raw = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
  };

  start(): void {
    window.addEventListener('deviceorientation', this.onOrientation);
  }

  stop(): void {
    window.removeEventListener('deviceorientation', this.onOrientation);
  }

  get hasSensor(): boolean {
    return this.raw !== null;
  }

  /** 今向いている水平方位を正面（-Z）にする */
  calibrate(): void {
    if (this.hasSensor) {
      this.computeAbsolute(this.sensorQ);
      this.offset.setFromAxisAngle(up, -yawOf(this.sensorQ));
    } else {
      this.dragYaw = 0;
      this.dragPitch = 0;
      this.offset.identity();
    }
    this.initialized = false;
  }

  update(camera: THREE.Camera, dt: number): void {
    this.computeAbsolute(this.sensorQ);
    this.target.copy(this.offset).multiply(this.sensorQ);
    if (!this.initialized) {
      this.current.copy(this.target);
      this.initialized = true;
    } else {
      const k = 1 - Math.pow(1 - this.smoothing, dt * 60);
      this.current.slerp(this.target, Math.min(1, k));
    }
    camera.quaternion.copy(this.current);
  }

  private computeAbsolute(out: THREE.Quaternion): void {
    if (this.raw) {
      orientationToQuaternion(out, this.raw.alpha * DEG, this.raw.beta * DEG, this.raw.gamma * DEG, getScreenAngle());
    } else {
      out.setFromEuler(euler.set(this.dragPitch, this.dragYaw, 0, 'YXZ'));
    }
  }

  /** ドラッグ操作時の視線を直接設定する（開発時の自動テスト用） */
  setDragAngles(yaw: number, pitch: number): void {
    this.dragYaw = yaw;
    this.dragPitch = pitch;
  }

  // ---- ドラッグ操作 ----
  /** pointerdown（センサーが無いときだけドラッグを始める） */
  dragStart(e: PointerEvent): void {
    if (this.hasSensor) return;
    this.dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
  }

  dragMove(e: PointerEvent): void {
    const d = this.dragging;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    d.moved += Math.abs(dx) + Math.abs(dy);
    const k = 0.005;
    this.dragYaw += dx * k;
    this.dragPitch = Math.max(-85 * DEG, Math.min(85 * DEG, this.dragPitch + dy * k));
  }

  /** pointerup。ほとんど動いていなければ（=タップ）true を返す */
  dragEnd(e: PointerEvent): boolean {
    const d = this.dragging;
    if (!d || d.id !== e.pointerId) return true;
    this.dragging = null;
    return d.moved < 8;
  }
}
