import { createStore } from 'zustand/vanilla';
import type { GameResult } from '../core/game';

export interface Settings {
  seated: boolean;
  camera: boolean;
  volume: number;
  effects: boolean;
  /** 同時表示数の上限（端末性能に応じて下げる） */
  maxTargets: number;
}

export type Phase = 'title' | 'calibrate' | 'countdown' | 'play' | 'stageClear' | 'result';

export interface AppState {
  phase: Phase;
  settings: Settings;
  bestScore: number;
  /** 到達した最高ステージ（1始まり、0 は未プレイ） */
  bestStage: number;
  lastResult: GameResult | null;
  /** カメラ・センサーの取得結果（UI 表示用） */
  cameraActive: boolean;
  sensorActive: boolean;
}

const SETTINGS_KEY = 'face360.settings';
const BEST_KEY = 'face360.best';
const BEST_STAGE_KEY = 'face360.bestStage';

export const DEFAULT_SETTINGS: Settings = { seated: false, camera: true, volume: 0.8, effects: true, maxTargets: 7 };

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
}

function loadBest(key = BEST_KEY): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

/** UI状態（画面・設定・結果）。ゲーム中の毎フレームの状態は Game クラス側に持つ */
export const store = createStore<AppState>(() => ({
  phase: 'title',
  settings: load(SETTINGS_KEY, DEFAULT_SETTINGS),
  bestScore: loadBest(),
  bestStage: loadBest(BEST_STAGE_KEY),
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

export function submitResult(result: GameResult): void {
  const best = Math.max(store.getState().bestScore, result.score);
  const bestStage = Math.max(store.getState().bestStage, result.allClear ? result.stageReached + 1 : result.stageReached);
  store.setState({ lastResult: result, bestScore: best, bestStage, phase: 'result' });
  try {
    localStorage.setItem(BEST_KEY, String(best));
    localStorage.setItem(BEST_STAGE_KEY, String(bestStage));
  } catch {
    /* 保存できなくても続行 */
  }
}
