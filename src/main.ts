import './style.css';
import * as THREE from 'three';
import { registerSW } from 'virtual:pwa-register';
import { OrientationController, requestOrientationPermission } from './core/orientation';
import { CameraFeed } from './core/camera';
import { Game } from './core/game';
import { SceneView } from './render/scene';
import { Effects } from './render/effects';
import type { FaceSkin } from './render/target';
import { Sfx } from './audio/sfx';
import { Hud } from './ui/hud';
import { createDummyFace } from './face/dummyFace';
import { ZoneMask } from './face/zoneMask';
import { store, submitResult, updateSettings } from './state/store';
import { calibrateScreen, countdownScreen, resultScreen, titleScreen } from './screens/screens';
import { captureScreen, type CaptureDone } from './screens/capture';
import { blobToCanvas, canvasToBlob, deleteFace, loadFace, saveFace } from './face/store';
import { isInAppBrowser, isSecure, ScreenWakeLock } from './util/env';

registerSW({ immediate: true });

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const screenRoot = $('screen');

const view = new SceneView($<HTMLCanvasElement>('gl'));
const orientation = new OrientationController();
const cameraFeed = new CameraFeed($<HTMLVideoElement>('camera'));
const sfx = new Sfx();
const effects = new Effects(view.scene);
const wakeLock = new ScreenWakeLock();
let game: Game | null = null;

const hud = new Hud($('hud'), $<HTMLCanvasElement>('overlay'), $('ink'), () => game?.reload());

// ---- 顔 ----

let faceSkin: FaceSkin | null = null;
let faceThumb: HTMLCanvasElement | null = null;
let dummySkins: FaceSkin[] | null = null;
/** 「サンプルの顔で遊ぶ」を選んだ（このセッションのみ） */
let useSample = false;

function skinFrom(texture: HTMLCanvasElement, mask: HTMLCanvasElement): FaceSkin {
  const tex = new THREE.CanvasTexture(texture);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { texture: tex, mask: ZoneMask.fromCanvas(mask) };
}

function setFace(texture: HTMLCanvasElement, mask: HTMLCanvasElement): void {
  faceSkin?.texture.dispose();
  faceSkin = skinFrom(texture, mask);
  const thumb = document.createElement('canvas');
  thumb.width = thumb.height = 192;
  thumb.getContext('2d')!.drawImage(texture, 0, 0, 192, 192);
  faceThumb = thumb;
}

function clearFace(): void {
  faceSkin?.texture.dispose();
  faceSkin = null;
  faceThumb = null;
}

async function restoreFace(): Promise<void> {
  const f = await loadFace();
  if (!f) return;
  try {
    setFace(await blobToCanvas(f.texture), await blobToCanvas(f.mask));
  } catch {
    clearFace();
  }
}

async function persistFace(d: CaptureDone): Promise<void> {
  try {
    await saveFace({
      texture: await canvasToBlob(d.cutout.texture),
      mask: await canvasToBlob(d.cutout.mask),
      landmarks: d.cutout.landmarks,
      blendshapes: d.blendshapes,
      createdAt: Date.now(),
    });
  } catch {
    // 保存できなくても今回のプレイは続けられる（次回は取り込み直し）
  }
}

function currentSkins(): FaceSkin[] {
  if (faceSkin && !useSample) return [faceSkin];
  // 顔を取り込んでいない場合のサンプル（図形描画のダミー顔）
  dummySkins ??= [20, 35, 200, 300].map((hue) => {
    const { texture, mask } = createDummyFace(hue);
    return skinFrom(texture, mask);
  });
  return dummySkins;
}

function show(node: HTMLElement | null): void {
  screenRoot.replaceChildren(...(node ? [node] : []));
}

function applySettings(): void {
  const s = store.getState().settings;
  sfx.setVolume(s.volume);
  effects.enabled = s.effects;
  hud.effects = s.effects;
}

// ---- 画面遷移 ----

function goTitle(): void {
  store.setState({ phase: 'title' });
  cameraFeed.stop();
  view.setVirtualBackground(true);
  const st = store.getState();
  show(
    titleScreen({
      settings: st.settings,
      bestScore: st.bestScore,
      inAppBrowser: isInAppBrowser(),
      insecure: !isSecure(),
      faceThumb,
      onStart: () => {
        if (faceSkin) {
          useSample = false;
          void start();
        } else {
          goCapture();
        }
      },
      onRecapture: goCapture,
      onDeleteFace: () => {
        if (!confirm('この端末に保存した顔データを削除しますか？')) return;
        clearFace();
        void deleteFace().finally(goTitle);
      },
      onSettings: (patch) => {
        updateSettings(patch);
        applySettings();
      },
    }),
  );
}

function goCapture(): void {
  show(
    captureScreen({
      onConfirm: (d) => {
        // センサー許可はこのタップ内で取る必要があるので、保存より先に start() を呼ぶ
        setFace(d.cutout.texture, d.cutout.mask);
        useSample = false;
        void start();
        void persistFace(d);
      },
      onSkip: () => {
        useSample = true;
        void start();
      },
      onBack: goTitle,
    }),
  );
}

/** スタートのタップ内で、モーションセンサー → カメラの順に許可を取る（iOSはタップ内が必須） */
async function start(): Promise<void> {
  sfx.unlock();
  const permitted = await requestOrientationPermission();
  orientation.start();
  const { settings } = store.getState();
  const cameraOk = settings.camera ? await cameraFeed.start() : false;
  if (!cameraOk) cameraFeed.stop();
  view.setVirtualBackground(!cameraOk);
  // センサー値が届くまで少し待つ（PCなど非対応環境ではドラッグ操作になる）
  if (permitted) await waitFor(() => orientation.hasSensor, 800);
  store.setState({ cameraActive: cameraOk, sensorActive: orientation.hasSensor });
  goCalibrate();
}

function goCalibrate(): void {
  store.setState({ phase: 'calibrate' });
  const st = store.getState();
  show(
    calibrateScreen({
      sensor: st.sensorActive,
      camera: st.cameraActive,
      onReady: () => {
        orientation.calibrate();
        void goCountdown();
      },
    }),
  );
}

async function goCountdown(): Promise<void> {
  store.setState({ phase: 'countdown' });
  const c = countdownScreen();
  show(c.root);
  for (const n of ['3', '2', '1']) {
    c.set(n);
    sfx.beep();
    await sleep(1000);
  }
  c.set('GO!');
  sfx.beep(true);
  await sleep(400);
  goPlay();
}

function goPlay(): void {
  store.setState({ phase: 'play' });
  show(null);
  hud.show(true);
  void wakeLock.acquire();
  game = new Game(view, effects, sfx, hud, currentSkins(), store.getState().settings, (result) => {
    const prevBest = store.getState().bestScore;
    hud.show(false);
    game?.dispose();
    game = null;
    void wakeLock.release();
    submitResult(result);
    show(
      resultScreen({
        result,
        best: store.getState().bestScore,
        isBest: result.score > prevBest,
        onRetry: goCalibrate,
        onTitle: goTitle,
      }),
    );
  });
}

// ---- 入力 ----

const gl = $<HTMLCanvasElement>('gl');
gl.addEventListener('pointerdown', (e) => {
  if (orientation.hasSensor) {
    if (store.getState().phase === 'play') game?.fire();
  } else {
    orientation.dragStart(e);
  }
});
gl.addEventListener('pointermove', (e) => orientation.dragMove(e));
const onUp = (e: PointerEvent) => {
  if (orientation.hasSensor) return;
  const tap = orientation.dragEnd(e);
  if (tap && store.getState().phase === 'play') game?.fire();
};
gl.addEventListener('pointerup', onUp);
gl.addEventListener('pointercancel', onUp);
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') game?.reload();
  if (e.key === ' ') game?.fire();
});

// ---- ループ ----

let lastT = performance.now();
function frame(t: number): void {
  // バックグラウンド復帰時などに大きく進まないよう制限する
  const dt = Math.min(0.1, (t - lastT) / 1000);
  lastT = t;
  orientation.update(view.camera, dt);
  if (!document.hidden) game?.update(dt);
  view.render();
  requestAnimationFrame(frame);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(cond: () => boolean, timeoutMs: number): Promise<void> {
  const end = performance.now() + timeoutMs;
  while (!cond() && performance.now() < end) await sleep(50);
}

if (import.meta.env.DEV) {
  // 自動テスト用：最寄りの的に照準を合わせる（センサーが無い環境のみ有効）
  (window as unknown as Record<string, unknown>).__debugAim = (du = 0, dv = 0) => {
    const t = game?.activeTargets[0];
    if (!t) return false;
    orientation.setDragAngles(t.azimuth + du, t.elevation + dv);
    return true;
  };
}

applySettings();
requestAnimationFrame(frame);
void restoreFace().finally(goTitle);
