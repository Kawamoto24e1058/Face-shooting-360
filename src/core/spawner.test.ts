import { describe, expect, it } from 'vitest';
import { pickSpawnPoint, SPAWN_PARAMS, toCartesian, waveConfig } from './spawner';

function seq(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('spawner', () => {
  it('keeps normal targets within elevation range and rare ones outside', () => {
    const rng = seq(42);
    for (let i = 0; i < 2000; i++) {
      const p = pickSpawnPoint(rng, false);
      if (p.rare) {
        expect(p.elevation > SPAWN_PARAMS.elevationMax || p.elevation < SPAWN_PARAMS.elevationMin).toBe(true);
      } else {
        expect(p.elevation).toBeGreaterThanOrEqual(SPAWN_PARAMS.elevationMin - 1e-9);
        expect(p.elevation).toBeLessThanOrEqual(SPAWN_PARAMS.elevationMax + 1e-9);
      }
      expect(p.distance).toBeGreaterThanOrEqual(SPAWN_PARAMS.distanceMin);
      expect(p.distance).toBeLessThanOrEqual(SPAWN_PARAMS.distanceMax);
    }
  });
  it('seated mode limits azimuth to front 120 degrees', () => {
    const rng = seq(7);
    for (let i = 0; i < 1000; i++) {
      const p = pickSpawnPoint(rng, true);
      expect(Math.abs(p.azimuth)).toBeLessThanOrEqual(SPAWN_PARAMS.seatedAzimuthHalf + 1e-9);
      expect(p.rare).toBe(false);
    }
  });
  it('azimuth 0 is straight ahead (-Z)', () => {
    const [x, y, z] = toCartesian(0, 0, 5);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
    expect(z).toBeCloseTo(-5);
  });
  it('waves ramp up and respect cap', () => {
    expect(waveConfig(0, 12).maxConcurrent).toBe(3);
    expect(waveConfig(85, 12).maxConcurrent).toBe(12);
    expect(waveConfig(59.9, 12).final).toBe(false);
    expect(waveConfig(60, 12).final).toBe(true);
  });
});
