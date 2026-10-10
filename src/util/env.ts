/** アプリ内ブラウザ（LINE・Instagram・Facebook等）ではカメラやセンサーが使えないことがある */
export function isInAppBrowser(ua = navigator.userAgent): boolean {
  return /\bLine\/|Instagram|FBAN|FBAV|FB_IAB|Twitter|TikTok|musical_ly|BytedanceWebview/i.test(ua);
}

export function isSecure(): boolean {
  return window.isSecureContext;
}

/** 画面消灯防止。非対応端末では何もしない */
export class ScreenWakeLock {
  private lock: WakeLockSentinel | null = null;

  async acquire(): Promise<void> {
    try {
      this.lock = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      this.lock = null;
    }
  }

  async release(): Promise<void> {
    await this.lock?.release().catch(() => undefined);
    this.lock = null;
  }
}
