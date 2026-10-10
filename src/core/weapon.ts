/** 残弾・リロード・弾種。時間は秒で外から渡す（テストしやすくするため） */

export type WeaponKind = 'normal' | 'pierce' | 'spread';

export interface WeaponSpec {
  label: string;
  /** 1発で飛ばすレイの方向（レティクル中心からの角度オフセット[rad], x=右, y=上） */
  pellets: readonly { x: number; y: number }[];
  pierce: boolean;
  scoreMultiplier: number;
}

const SPREAD = (3 * Math.PI) / 180;

export const WEAPONS: Record<WeaponKind, WeaponSpec> = {
  normal: { label: '通常弾', pellets: [{ x: 0, y: 0 }], pierce: false, scoreMultiplier: 1 },
  pierce: { label: '貫通弾', pellets: [{ x: 0, y: 0 }], pierce: true, scoreMultiplier: 1 },
  spread: {
    label: '拡散弾',
    pellets: [
      { x: 0, y: 0 },
      { x: -SPREAD, y: 0 },
      { x: SPREAD, y: 0 },
    ],
    pierce: false,
    scoreMultiplier: 0.5,
  },
};

export const WEAPON_PARAMS = {
  magazine: 12,
  reloadSec: 1.2,
  powerupSec: 10,
} as const;

export class Weapon {
  ammo: number = WEAPON_PARAMS.magazine;
  kind: WeaponKind = 'normal';
  private reloadEndAt = -1;
  private powerupEndAt = -1;

  get spec(): WeaponSpec {
    return WEAPONS[this.kind];
  }

  isReloading(now: number): boolean {
    return this.reloadEndAt > now;
  }

  reloadProgress(now: number): number {
    if (!this.isReloading(now)) return 1;
    return 1 - (this.reloadEndAt - now) / WEAPON_PARAMS.reloadSec;
  }

  powerupRemaining(now: number): number {
    return this.kind === 'normal' ? 0 : Math.max(0, this.powerupEndAt - now);
  }

  /** 毎フレーム呼ぶ。リロード完了・パワーアップ終了を反映する */
  update(now: number): void {
    if (this.reloadEndAt >= 0 && this.reloadEndAt <= now) {
      this.ammo = WEAPON_PARAMS.magazine;
      this.reloadEndAt = -1;
    }
    if (this.kind !== 'normal' && this.powerupEndAt <= now) {
      this.kind = 'normal';
    }
  }

  canFire(now: number): boolean {
    return this.ammo > 0 && !this.isReloading(now);
  }

  /** 撃てたら true */
  fire(now: number): boolean {
    if (!this.canFire(now)) return false;
    this.ammo -= 1;
    return true;
  }

  /** リロードを開始したら true（満タン・リロード中は false） */
  startReload(now: number): boolean {
    if (this.isReloading(now) || this.ammo === WEAPON_PARAMS.magazine) return false;
    this.reloadEndAt = now + WEAPON_PARAMS.reloadSec;
    return true;
  }

  equip(kind: WeaponKind, now: number): void {
    this.kind = kind;
    this.powerupEndAt = kind === 'normal' ? -1 : now + WEAPON_PARAMS.powerupSec;
  }
}
