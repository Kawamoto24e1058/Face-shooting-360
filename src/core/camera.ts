/** 背面カメラの映像を背景の <video> に流す。HTTPS（または localhost）必須 */
export class CameraFeed {
  private stream: MediaStream | null = null;

  constructor(private readonly video: HTMLVideoElement) {}

  get active(): boolean {
    return this.stream !== null;
  }

  async start(): Promise<boolean> {
    if (this.stream) return true;
    if (!navigator.mediaDevices?.getUserMedia) return false;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      this.video.srcObject = this.stream;
      this.video.hidden = false;
      await this.video.play().catch(() => undefined);
      return true;
    } catch {
      this.stream = null;
      return false;
    }
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.video.hidden = true;
  }
}
