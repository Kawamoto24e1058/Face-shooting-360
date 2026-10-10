import * as THREE from 'three';
import { createFaceSkin, disposeFaceSkin } from './skin';
import type { Cutout } from '../face/cutout';

/** 取り込み確認画面で、立体の顔をゆっくり左右に回して見せる。戻り値で停止・解放する */
export function startFacePreview(canvas: HTMLCanvasElement, cutout: Cutout): () => void {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const size = canvas.clientWidth || 240;
  renderer.setSize(size, size, false);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
  camera.position.set(0, 0, 2.2);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f99, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(0.6, 0.8, 1);
  scene.add(key);

  const skin = createFaceSkin(cutout.texture, cutout.mask, cutout.landmarks);
  const mats = skin.geometry
    ? [new THREE.MeshLambertMaterial({ map: skin.texture }), new THREE.MeshLambertMaterial({ color: 0xf3e7da })]
    : [new THREE.MeshBasicMaterial({ map: skin.texture, transparent: true })];
  const mesh = new THREE.Mesh(skin.geometry ?? new THREE.PlaneGeometry(1, 1), skin.geometry ? mats : mats[0]);
  scene.add(mesh);

  let raf = 0;
  const t0 = performance.now();
  const loop = (t: number) => {
    const s = (t - t0) / 1000;
    mesh.rotation.y = Math.sin(s * 0.9) * 0.75;
    mesh.rotation.x = Math.sin(s * 0.6) * 0.12;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf);
    mats.forEach((m) => m.dispose());
    if (!skin.geometry) mesh.geometry.dispose();
    disposeFaceSkin(skin);
    renderer.dispose();
  };
}
