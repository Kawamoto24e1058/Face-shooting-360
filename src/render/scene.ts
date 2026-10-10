import * as THREE from 'three';

/** 透明canvasをカメラ映像の上に重ねる。カメラOFF時は仮想背景を表示する */
export class SceneView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 100);
  private readonly virtualBg = new THREE.Group();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.scene.add(this.camera);
    this.buildVirtualBackground();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setVirtualBackground(on: boolean): void {
    this.virtualBg.visible = on;
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** 仮想の部屋（カメラ許可が取れない場合の保険）。方向感覚が掴めるよう床と柱を置く */
  private buildVirtualBackground(): void {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(40, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {},
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader:
          'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 top = vec3(0.10,0.12,0.30); vec3 mid = vec3(0.45,0.25,0.45); vec3 bot = vec3(0.06,0.06,0.10); vec3 c = h > 0.0 ? mix(mid, top, h) : mix(mid, bot, min(1.0, -h * 4.0)); gl_FragColor = vec4(c,1.0); }',
      }),
    );
    sky.renderOrder = -10;
    this.virtualBg.add(sky);
    const grid = new THREE.GridHelper(60, 60, 0xff4fa3, 0x553366);
    grid.position.y = -1.6;
    this.virtualBg.add(grid);
    const pillarMat = new THREE.MeshBasicMaterial({ color: 0x4fe3ff, transparent: true, opacity: 0.35 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 8, 0.3), pillarMat);
      p.position.set(Math.sin(a) * 14, 2, Math.cos(a) * 14);
      this.virtualBg.add(p);
    }
    this.virtualBg.visible = false;
    this.scene.add(this.virtualBg);
  }
}
