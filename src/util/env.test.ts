import { describe, expect, it } from 'vitest';
import { isInAppBrowser } from './env';

describe('isInAppBrowser', () => {
  it('detects LINE and Instagram', () => {
    expect(isInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari Line/14.0.0')).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36 Instagram 300.0')).toBe(true);
  });
  it('passes Safari and Chrome', () => {
    expect(isInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe(false);
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36')).toBe(false);
  });
});
