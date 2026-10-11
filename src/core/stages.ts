import type { Expression } from '../face/mesh';

/**
 * ステージ構成（純データ＋純関数）。各ステージは制限時間内に「雑魚を規定数倒す → ボスを倒す」でクリア。
 * 反撃はなく、時間切れで失敗。的に逃げられると残り時間が減る。
 * 数値はすべて初期値。実機で調整する。
 */
export interface StageConfig {
  /** 制限時間 [秒]（ボス戦を含む） */
  timeLimit: number;
  /** ボス戦までに倒す数 */
  quota: number;
  /** 同時に出る雑魚の上限（設定の上限とも比べて小さい方） */
  maxConcurrent: number;
  /** 出現させる表情 */
  expressions: readonly Expression[];
  /** 雑魚の動く速さ [rad/s] */
  speed: number;
  /** 動く的の割合 */
  movingRatio: number;
  /** 雑魚が逃げるまでの時間 [秒] */
  stay: number;
  bossHp: number;
  /** ボスが呼ぶ子分の数（子分がいる間、ボスはガードする） */
  bossMinions: number;
}

const ALL: readonly Expression[] = ['neutral', 'smile', 'surprise', 'eyesClosed', 'angry', 'mouthOpen'];

export const STAGES: readonly StageConfig[] = [
  { timeLimit: 50, quota: 8, maxConcurrent: 3, expressions: ['neutral', 'smile'], speed: 0.12, movingRatio: 0.2, stay: 9, bossHp: 12, bossMinions: 2 },
  { timeLimit: 55, quota: 10, maxConcurrent: 4, expressions: ['neutral', 'smile', 'surprise', 'eyesClosed'], speed: 0.18, movingRatio: 0.4, stay: 8, bossHp: 16, bossMinions: 2 },
  { timeLimit: 60, quota: 12, maxConcurrent: 5, expressions: ALL, speed: 0.24, movingRatio: 0.55, stay: 7, bossHp: 20, bossMinions: 3 },
  { timeLimit: 65, quota: 14, maxConcurrent: 6, expressions: ALL, speed: 0.3, movingRatio: 0.7, stay: 6.5, bossHp: 24, bossMinions: 3 },
  { timeLimit: 70, quota: 16, maxConcurrent: 7, expressions: ALL, speed: 0.36, movingRatio: 0.8, stay: 6, bossHp: 30, bossMinions: 4 },
];

/** 的に逃げられたときに減る時間 [秒] */
export const ESCAPE_PENALTY_SEC = 2;

/** ★評価：残り時間が半分以上で★3、4分の1以上で★2、それ未満は★1 */
export function stageStars(timeLeft: number, timeLimit: number): 1 | 2 | 3 {
  const r = timeLeft / timeLimit;
  if (r >= 0.5) return 3;
  if (r >= 0.25) return 2;
  return 1;
}

/** ステージクリアのボーナス（★と残り時間で決める） */
export function clearBonus(stars: number, timeLeft: number): number {
  return stars * 1000 + Math.floor(timeLeft) * 50;
}
