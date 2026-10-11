import * as THREE from 'three';

/** 顔が撃ってくるインク弾。プレイヤー（原点）へまっすぐ飛ぶ。撃ち落とせる */

const core = new THREE.SphereGeometry(0.13, 16, 12);
const glow = new THREE.SphereGeometry(0.22, 16, 12);
/** 当たり判定は見た目より少し大きくして撃ち落としやすくする */
const hitbox = new THREE.SphereGeometry(0.4, 10, 8);
const coreMat = new THREE.MeshBasicMaterial({ color: 0xff2d8a });
const glowMat = new THREE.MeshBasicMaterial({ color: 0xff7ac0, transparent: true, opacity: 0.35, depthWrite: false });
const hitMat = new THREE.MeshBasicMaterial({ visible: false });

/** プレイヤーに当たったとみなす距離（目の前で画面を覆う前に当たり判定にする） */
export const SHOT_HIT_DISTANCE = 1.1;

export class InkShot {
  readonly group = new THREE.Group();
  readonly hitMesh: THREE.Mesh;
  dead = false;
  /** プレイヤーに届いた */
  reached = false;
  private readonly vel: THREE.Vector3;
  private age = 0;
  private readonly glowMesh: THREE.Mesh;

  constructor(from: THREE.Vector3, speed: number, to = new THREE.Vector3()) {
    this.group.position.copy(from);
    this.vel = to.clone().sub(from).normalize().multiplyScalar(speed);
    this.group.add(new THREE.Mesh(core, coreMat));
    this.glowMesh = new THREE.Mesh(glow, glowMat);
    this.group.add(this.glowMesh);
    this.hitMesh = new THREE.Mesh(hitbox, hitMat);
    this.hitMesh.userData.shot = this;
    this.group.add(this.hitMesh);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  update(dt: number): void {
    if (this.dead) return;
    this.age += dt;
    this.group.position.addScaledVector(this.vel, dt);
    this.glowMesh.scale.setScalar(1 + 0.15 * Math.sin(this.age * 14));
    if (this.group.position.length() <= SHOT_HIT_DISTANCE) {
      this.reached = true;
      this.dead = true;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
  }
}
