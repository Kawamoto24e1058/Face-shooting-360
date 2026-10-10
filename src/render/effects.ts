import * as THREE from 'three';

interface Fx {
  obj: THREE.Object3D;
  age: number;
  life: number;
  tick(t: number): void;
  dispose(): void;
}

const INK_COLORS = [0xff4fa3, 0x4fe3ff, 0xffe14f, 0x7cff6b, 0xb36bff];

function makeInkTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  const blob = (x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  blob(64, 64, 30);
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 26 + Math.random() * 32;
    blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 3 + Math.random() * 9);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 弾道・インク飛沫・衝撃波など、短時間で消える演出 */
export class Effects {
  enabled = true;
  private readonly list: Fx[] = [];
  private readonly inkTextures = [makeInkTexture(), makeInkTexture(), makeInkTexture()];
  private readonly ringGeo = new THREE.RingGeometry(0.8, 1, 32);
  private readonly planeGeo = new THREE.PlaneGeometry(1, 1);
  private readonly tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).rotateX(Math.PI / 2);

  constructor(private readonly scene: THREE.Scene) {}

  /** 銃口から着弾点への光の線（約0.1秒）。判定はヒットスキャンで済んでいるので見た目だけ */
  tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xfff3a0): void {
    const len = from.distanceTo(to);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(this.tracerGeo, mat);
    m.position.copy(from).lerp(to, 0.5);
    m.lookAt(to);
    m.scale.set(0.012, 0.012, len);
    this.add({
      obj: m,
      age: 0,
      life: 0.1,
      tick: (t) => {
        mat.opacity = 1 - t;
      },
      dispose: () => mat.dispose(),
    });
  }

  /** 着弾点にインクの飛沫を貼る（的の子にするので一緒に動く） */
  splash(target: THREE.Object3D, worldPoint: THREE.Vector3): void {
    if (!this.enabled) return;
    const mat = new THREE.MeshBasicMaterial({
      map: this.inkTextures[Math.floor(Math.random() * this.inkTextures.length)],
      color: INK_COLORS[Math.floor(Math.random() * INK_COLORS.length)],
      transparent: true,
      depthWrite: false,
    });
    const m = new THREE.Mesh(this.planeGeo, mat);
    target.worldToLocal(m.position.copy(worldPoint));
    m.position.z = 0.01;
    m.rotation.z = Math.random() * Math.PI * 2;
    target.add(m);
    this.add({
      obj: m,
      age: 0,
      life: 1.2,
      tick: (t) => {
        const s = 0.25 + 0.15 * Math.min(1, t * 8);
        m.scale.setScalar(s);
        mat.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      },
      dispose: () => mat.dispose(),
    });
  }

  /** 衝撃波リング */
  shockwave(worldPoint: THREE.Vector3, facing: THREE.Vector3): void {
    if (!this.enabled) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.ringGeo, mat);
    m.position.copy(worldPoint);
    m.lookAt(facing);
    this.add({
      obj: m,
      age: 0,
      life: 0.35,
      tick: (t) => {
        m.scale.setScalar(0.1 + t * 0.6);
        mat.opacity = 1 - t;
      },
      dispose: () => mat.dispose(),
    });
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const fx = this.list[i];
      fx.age += dt;
      const t = Math.min(1, fx.age / fx.life);
      fx.tick(t);
      if (t >= 1) {
        fx.obj.removeFromParent();
        fx.dispose();
        this.list.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const fx of this.list) {
      fx.obj.removeFromParent();
      fx.dispose();
    }
    this.list.length = 0;
  }

  private add(fx: Fx): void {
    if (!fx.obj.parent) this.scene.add(fx.obj);
    fx.tick(0);
    this.list.push(fx);
  }
}
