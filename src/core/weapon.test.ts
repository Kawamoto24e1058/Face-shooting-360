import { describe, expect, it } from 'vitest';
import { Weapon, WEAPON_PARAMS } from './weapon';

describe('Weapon', () => {
  it('fires until empty and blocks during reload', () => {
    const w = new Weapon();
    for (let i = 0; i < WEAPON_PARAMS.magazine; i++) expect(w.fire(0)).toBe(true);
    expect(w.fire(0)).toBe(false);
    expect(w.startReload(0)).toBe(true);
    expect(w.isReloading(0.5)).toBe(true);
    w.update(0.5);
    expect(w.fire(0.5)).toBe(false);
    w.update(1.3);
    expect(w.ammo).toBe(WEAPON_PARAMS.magazine);
    expect(w.fire(1.3)).toBe(true);
  });
  it('does not reload when full', () => {
    expect(new Weapon().startReload(0)).toBe(false);
  });
  it('power-up expires after 10s', () => {
    const w = new Weapon();
    w.equip('spread', 5);
    w.update(14.9);
    expect(w.kind).toBe('spread');
    w.update(15);
    expect(w.kind).toBe('normal');
  });
});
