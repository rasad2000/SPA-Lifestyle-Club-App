import { describe, expect, it } from 'vitest';

import { absolutize, FALLBACK_BASE, resolveBaseUrl, toWsUrl } from '../src/api/base-url';

describe('resolveBaseUrl', () => {
  it('explicit env wins, trailing slash stripped', () => {
    expect(resolveBaseUrl({ envUrl: 'https://api.example.de/', platform: 'ios', hostUri: '10.0.0.2:8081' })).toBe(
      'https://api.example.de',
    );
  });
  it('web uses same origin when served by the API server', () => {
    expect(resolveBaseUrl({ platform: 'web', origin: 'http://192.168.1.10:8790' })).toBe('http://192.168.1.10:8790');
    expect(resolveBaseUrl({ platform: 'web', origin: 'https://app.spa.club' })).toBe('https://app.spa.club');
  });
  it('web on the Metro dev server points at :8790 on the same host', () => {
    expect(resolveBaseUrl({ platform: 'web', origin: 'http://localhost:8081' })).toBe('http://localhost:8790');
  });
  it('device dev derives the host from hostUri', () => {
    expect(resolveBaseUrl({ platform: 'ios', hostUri: '192.168.1.20:8081' })).toBe('http://192.168.1.20:8790');
    expect(resolveBaseUrl({ platform: 'android', hostUri: 'box.local:8081/some/path' })).toBe('http://box.local:8790');
  });
  it('ignores non-string config values instead of throwing', () => {
    const junk = { apiUrl: 1 } as unknown as string;
    expect(resolveBaseUrl({ envUrl: junk, platform: 'web', origin: 'http://h:8790' })).toBe('http://h:8790');
    expect(resolveBaseUrl({ envUrl: junk, platform: 'ios', hostUri: junk })).toBe(FALLBACK_BASE);
  });
  it('falls back to loopback in dev only', () => {
    expect(resolveBaseUrl({ platform: 'ios' })).toBe(FALLBACK_BASE);
    expect(resolveBaseUrl({ platform: 'ios', envUrl: '   ' })).toBe(FALLBACK_BASE);
  });
  it('a release build with no URL is unconfigured (null), never the phone\'s own loopback', () => {
    expect(resolveBaseUrl({ platform: 'ios', dev: false })).toBeNull();
    expect(resolveBaseUrl({ platform: 'android', dev: false, envUrl: 'https://api.spa.club' })).toBe('https://api.spa.club');
    expect(resolveBaseUrl({ platform: 'web', dev: false, origin: 'https://app.spa.club' })).toBe('https://app.spa.club');
  });
});

describe('toWsUrl / absolutize', () => {
  it('swaps the scheme', () => {
    expect(toWsUrl('http://h:8790', '/v1/live')).toBe('ws://h:8790/v1/live');
    expect(toWsUrl('https://api.spa.club', '/v1/live')).toBe('wss://api.spa.club/v1/live');
  });
  it('prefixes only server-relative urls', () => {
    expect(absolutize('http://h:8790', '/media/a.jpg')).toBe('http://h:8790/media/a.jpg');
    expect(absolutize('http://h:8790', 'https://cdn.x/a.jpg')).toBe('https://cdn.x/a.jpg');
  });
});
