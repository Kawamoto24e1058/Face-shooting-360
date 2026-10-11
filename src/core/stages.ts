import type { Expression } from '../face/mesh';

/**
 * ステージ構成（純データ＋純関数）。各ステージは「雑魚を規定数倒す → ボス戦」でクリア。
 * 数値はすべて初期値。実機で調整する。
 */
export interface StageConfig {
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
  /** 雑魚の射撃間隔の倍率（小さいほど頻繁） */
  fireIntervalMul: number;
  /** インク弾の速さ [距離/秒] */
  shotSpeed: number;
  bossHp: number;
  /** ボスの扇状射撃の弾数 */
  bossVolley: number;
  /** ボスが呼ぶ子分の数 */
  bossMinions: number;
}

export const STAGES: readonly StageConfig[] = [
  {
    quota: 8,
    maxConcurrent: 3,
    expressions: ['neutral', 'smile'],
    speed: 0.12,
    movingRatio: 0.2,
    fireIntervalMul: 1.4,
    shotSpeed: 2.2,
    bossHp: 12,
    bossVolley: 3,
    bossMinions: 2,
  },
  {
    quota: 10,
    maxConcurrent: 4,
    expressions: ['neutral', 'smile', 'surprise', 'eyesClosed'],
    speed: 0.18,
    movingRatio: 0.4,
    fireIntervalMul: 1.2,
    shotSpeed: 2.5,
    bossHp: 16,
    bossVolley: 4,
    bossMinions: 2,
  },
  {
    quota: 12,
    maxConcurrent: 5,
    expressions: ['neutral', 'smile', 'surprise', 'eyesClosed', 'angry', 'mouthOpen'],
    speed: 0.24,
    movingRatio: 0.55,
    fireIntervalMul: 1,
    shotSpeed: 2.8,
    bossHp: 20,
    bossVolley: 5,
    bossMinions: 3,
  },
  {
    quota: 14,
    maxConcurrent: 6,
    expressions: ['neutral', 'smile', 'surprise', 'eyesClosed', 'angry', 'mouthOpen'],
    speed: 0.3,
    movingRatio: 0.7,
    fireIntervalMul: 0.85,
    shotSpeed: 3.1,
    bossHp: 24,
    bossVolley: 6,
    bossMinions: 3,
  },
  {
    quota: 16,
    maxConcurrent: 7,
    expressions: ['neutral', 'smile', 'surprise', 'eyesClosed', 'angry', 'mouthOpen'],
    speed: 0.36,
    movingRatio: 0.8,
    fireIntervalMul: 0.7,
    shotSpeed: 3.4,
    bossHp: 30,
    bossVolley: 7,
    bossMinions: 4,
  },
];

export const MAX_LIVES = 3;

/** ステージの評価（★1〜3）。被弾しなければ★3、1回までなら★2、それ以上は★1 */
export function stageStars(damageTaken: number): 1 | 2 | 3 {
  if (damageTaken <= 0) return 3;
  if (damageTaken <= 1) return 2;
  return 1;
}

/** ステージクリア時の回復（ライフ上限まで1回復） */
export function livesAfterClear(lives: number): number {
  return Math.min(MAX_LIVES, lives + 1);
}

/** ステージクリアのボーナス（★の数と残りライフで決める） */
export function clearBonus(stars: number, lives: number): number {
  return stars * 1000 + lives * 500;
}
