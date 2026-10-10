/** 的の配置ルール（純関数）。カメラを原点とした球面上の方位・仰角で決める */

const DEG = Math.PI / 180;

export const SPAWN_PARAMS = {
  /** 標準の仰角範囲 */
  elevationMin: -60 * DEG,
  elevationMax: 75 * DEG,
  /** 座りモードで許可する方位（前方±60度 = 120度） */
  seatedAzimuthHalf: 60 * DEG,
  distanceMin: 4,
  distanceMax: 9,
  /** 真上・真下のレア的が出る確率 */
  rareChance: 0.05,
  waveSec: 10,
  finalWaveAt: 60,
} as const;

export interface SpawnPoint {
  /** 方位。0 = 正面(-Z)、正 = 左回り */
  azimuth: number;
  elevation: number;
  distance: number;
  rare: boolean;
}

export type Rng = () => number;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function pickSpawnPoint(rng: Rng, seated: boolean): SpawnPoint {
  const distance = lerp(SPAWN_PARAMS.distanceMin, SPAWN_PARAMS.distanceMax, rng());
  if (seated) {
    return {
      azimuth: lerp(-SPAWN_PARAMS.seatedAzimuthHalf, SPAWN_PARAMS.seatedAzimuthHalf, rng()),
      elevation: lerp(-30 * DEG, 45 * DEG, rng()),
      distance,
      rare: false,
    };
  }
  if (rng() < SPAWN_PARAMS.rareChance) {
    // 真上（75〜88度）または真下（-60〜-80度）のレア的専用ゾーン
    const top = rng() < 0.6;
    return {
      azimuth: lerp(-Math.PI, Math.PI, rng()),
      elevation: top ? lerp(76 * DEG, 88 * DEG, rng()) : lerp(-80 * DEG, -61 * DEG, rng()),
      distance,
      rare: true,
    };
  }
  // 球面上で偏りが出にくいよう sin(仰角) を一様にとる
  const sMin = Math.sin(SPAWN_PARAMS.elevationMin);
  const sMax = Math.sin(SPAWN_PARAMS.elevationMax);
  return {
    azimuth: lerp(-Math.PI, Math.PI, rng()),
    elevation: Math.asin(lerp(sMin, sMax, rng())),
    distance,
    rare: false,
  };
}

/** 球面座標 → ワールド座標（Y up, 正面 -Z） */
export function toCartesian(azimuth: number, elevation: number, distance: number): [number, number, number] {
  const c = Math.cos(elevation);
  return [-Math.sin(azimuth) * c * distance, Math.sin(elevation) * distance, -Math.cos(azimuth) * c * distance];
}

export function waveIndex(elapsedSec: number): number {
  return Math.floor(elapsedSec / SPAWN_PARAMS.waveSec);
}

export interface WaveConfig {
  wave: number;
  maxConcurrent: number;
  /** 動く的の割合 */
  movingRatio: number;
  /** 角速度[rad/s]の上限 */
  speed: number;
  spawnIntervalSec: number;
  final: boolean;
}

/** cap: 同時表示数の上限（設定・端末性能で調整） */
export function waveConfig(elapsedSec: number, cap: number): WaveConfig {
  const wave = waveIndex(elapsedSec);
  return {
    wave,
    maxConcurrent: Math.min(cap, 3 + wave * 2),
    movingRatio: Math.min(0.9, 0.1 + wave * 0.15),
    speed: (8 + wave * 4) * DEG,
    spawnIntervalSec: Math.max(0.4, 1.6 - wave * 0.2),
    final: elapsedSec >= SPAWN_PARAMS.finalWaveAt,
  };
}
