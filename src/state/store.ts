import { createStore } from 'zustand/vanilla';
import type { ScoreState } from '../core/score';

export interface Settings {
  seated: boolean;
  camera: boolean;
  volume: number;
  effects: boolean;
  /** 同時表示数の上限（端末性能に応じて下げる） */
  maxTargets: number;
}

export type Phase = 'title' | 'calibrate' | 'countdown' | 'play' | 'result';

export interface AppState {
  phase: Phase;
  settings: Settings;
  bestScore: number;
  lastResult: ScoreState | null;
  /** カメラ・センサーの取得結果（UI 表示用） */
  cameraActive: boolean;
  sensorActive: boolean;
}

const SETTINGS_KEY = 'face360.settings';
const BEST_KEY = 'face360.best';

export const DEFAULT_SETTINGS: Settings = { seated: false, camera: true, volume: 0.8, effects: true, maxTargets: 12 };

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
}

function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** UI状態（画面・設定・結果）。ゲーム中の毎フレームの状態は Game クラス側に持つ */
export const store = createStore<AppState>(() => ({
  phase: 'title',
  settings: load(SETTINGS_KEY, DEFAULT_SETTINGS),
  bestScore: loadBest(),
  lastResult: null,
  cameraActive: false,
  sensorActive: false,
}));

export function updateSettings(patch: Partial<Settings>): void {
  const settings = { ...store.getState().settings, ...patch };
  store.setState({ settings });
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* 保存できなくても続行 */
  }
}

export function submitResult(result: ScoreState): void {
  const best = Math.max(store.getState().bestScore, result.score);
  store.setState({ lastResult: result, bestScore: best, phase: 'result' });
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch {
    /* 保存できなくても続行 */
  }
}
