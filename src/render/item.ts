import * as THREE from 'three';
import type { WeaponKind } from '../core/weapon';

const geometry = new THREE.OctahedronGeometry(0.22);
const COLORS: Record<Exclude<WeaponKind, 'normal'>, number> = { pierce: 0x4fe3ff, spread: 0xffe14f };

/** 的が落とす弾種アイテム。撃つと弾種が切り替わる */
export class Item {
  readonly mesh: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  private age = 0;
  private readonly base: THREE.Vector3;
  dead = false;

  constructor(
    readonly kind: Exclude<WeaponKind, 'normal'>,
    position: THREE.Vector3,
    private readonly lifeSec = 6,
  ) {
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: COLORS[kind], transparent: true, wireframe: false }));
    this.mesh.userData.item = this;
    // プレイヤー側に少し寄せる
    this.base = position.clone().multiplyScalar(0.85);
    this.mesh.position.copy(this.base);
  }

  update(dt: number): void {
    this.age += dt;
    this.mesh.rotation.y += dt * 3;
    this.mesh.rotation.x += dt * 1.3;
    this.mesh.position.copy(this.base);
    this.mesh.position.y += Math.sin(this.age * 3) * 0.1;
    const remain = this.lifeSec - this.age;
    // 消える直前は点滅させる代わりに透明度を下げる（光過敏への配慮）
    this.mesh.material.opacity = remain < 1.5 ? 0.4 + 0.6 * (remain / 1.5) : 1;
    if (remain <= 0) this.dead = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.material.dispose();
  }
}
