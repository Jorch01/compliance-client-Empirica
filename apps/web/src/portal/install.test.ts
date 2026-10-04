import { describe, expect, it } from 'vitest';
import { detectPlatform, isIosOtherBrowser } from './install.ts';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  android:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
};

describe('which install instructions to show', () => {
  it('tells iPhone, iPad (which says it is a Mac, with touch), Android and computers apart', () => {
    expect(detectPlatform(UA.iphoneSafari, 5)).toBe('ios');
    expect(detectPlatform(UA.ipad, 5)).toBe('ios');
    expect(detectPlatform(UA.android, 5)).toBe('android');
    expect(detectPlatform(UA.mac, 0)).toBe('desktop');
  });

  it('on iPhone, only Safari installs: other browsers are told to open Safari', () => {
    expect(isIosOtherBrowser(UA.iphoneChrome)).toBe(true);
    expect(isIosOtherBrowser(UA.iphoneSafari)).toBe(false);
  });
});
