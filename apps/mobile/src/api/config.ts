/** The resolved base URL for this run (see base-url.ts for the rules). */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { absolutize, resolveBaseUrl, toWsUrl } from './base-url';

const rawExtra: unknown = (Constants.expoConfig?.extra as { apiUrl?: unknown } | undefined)?.apiUrl;
const extraUrl = typeof rawExtra === 'string' ? rawExtra : null;

const resolved = resolveBaseUrl({
  // EXPO_PUBLIC_* is inlined at bundle time; extra.apiUrl covers builds where the
  // value was only present when the config was evaluated.
  envUrl: process.env.EXPO_PUBLIC_API_URL || extraUrl,
  platform: Platform.OS,
  origin: Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : null,
  hostUri: Constants.expoConfig?.hostUri ?? null,
  dev: __DEV__,
});

/** True when this build has no server address (a release built without EXPO_PUBLIC_API_URL). */
export const API_UNCONFIGURED = resolved == null;
if (API_UNCONFIGURED) console.error('[spa] EXPO_PUBLIC_API_URL is not set for this release build');

/** '' when unconfigured: the client then answers every call with a `config` failure. */
export const API_BASE = resolved ?? '';
export const LIVE_URL = resolved ? toWsUrl(resolved, '/v1/live') : '';

export function mediaUrl(url: string): string {
  return absolutize(API_BASE, url);
}
