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

// 段階2: ダミー顔。段階3で写真から作った顔（IndexedDB保存）に差し替える
const skins: FaceSkin[] = [20, 35, 200, 300].map((hue) => {
  const { texture, mask } = createDummyFace(hue);
  const tex = new THREE.CanvasTexture(texture);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { texture: tex, mask: ZoneMask.fromCanvas(mask) };
});

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
      onStart: () => void start(),
      onSettings: (patch) => {
        updateSettings(patch);
        applySettings();
      },
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
  game = new Game(view, effects, sfx, hud, skins, store.getState().settings, (result) => {
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

applySettings();
goTitle();
requestAnimationFrame(frame);
