import { registerSW } from 'virtual:pwa-register';

/**
 * PWA まわり：Service Worker の登録、更新の通知、ホーム画面への追加。
 * 更新はプレイを邪魔しないよう、タイトル画面でユーザーが選んだときだけ適用する。
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Listener = () => void;

class PwaState {
  needRefresh = false;
  offlineReady = false;
  private installEvent: BeforeInstallPromptEvent | null = null;
  private updateSW: ((reload?: boolean) => Promise<void>) | null = null;
  private readonly listeners = new Set<Listener>();

  init(): void {
    this.updateSW = registerSW({
      immediate: true,
      onNeedRefresh: () => {
        this.needRefresh = true;
        this.emit();
      },
      onOfflineReady: () => {
        this.offlineReady = true;
        this.emit();
      },
    });
    window.addEventListener('beforeinstallprompt', (e) => {
      // ブラウザ既定のバナーは出さず、タイトル画面のボタンから出す
      e.preventDefault();
      this.installEvent = e as BeforeInstallPromptEvent;
      this.emit();
    });
    window.addEventListener('appinstalled', () => {
      this.installEvent = null;
      this.emit();
    });
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** ホーム画面から起動しているか */
  get standalone(): boolean {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    );
  }

  /** Android Chrome など、ボタンからインストールできる */
  get canPrompt(): boolean {
    return this.installEvent !== null && !this.standalone;
  }

  /** iOS Safari は手動（共有 → ホーム画面に追加）の案内が必要 */
  get needsIosGuide(): boolean {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return ios && !this.standalone;
  }

  async install(): Promise<void> {
    const e = this.installEvent;
    if (!e) return;
    await e.prompt();
    await e.userChoice.catch(() => undefined);
    this.installEvent = null;
    this.emit();
  }

  async update(): Promise<void> {
    await this.updateSW?.(true);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }
}

export const pwa = new PwaState();
