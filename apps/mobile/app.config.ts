import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * App config (replaces the template's app.json so ids/URLs can come from the
 * environment — EAS build profiles, a local .env, or the shell).
 *
 * SPA_IOS_BUNDLE_ID / SPA_ANDROID_PACKAGE: the default "club.spa.garden" is a
 * PLACEHOLDER. Pick the real reverse-DNS id before the first TestFlight upload —
 * an App Store Connect record is bound to its bundle id forever.
 *
 * EXPO_PUBLIC_API_URL: the feed server (e.g. https://api.<domain>). Unset in
 * development, the app derives the dev machine's host (see src/api/base-url.ts);
 * a RELEASE build without it shows a configuration error instead of silently
 * talking to 127.0.0.1 (which on a phone is the phone itself).
 *
 * SPA_ALLOW_CLEARTEXT=1: lets a build talk plain http/ws (the POC server has no
 * TLS). Android release builds block cleartext and iOS ATS blocks it everywhere,
 * so without this a preview build pointed at http://<host>:8790 fails every
 * request. POC/preview only — production must serve HTTPS/WSS and leave it off.
 */
const IOS_BUNDLE_ID = process.env.SPA_IOS_BUNDLE_ID ?? 'club.spa.garden';
const ANDROID_PACKAGE = process.env.SPA_ANDROID_PACKAGE ?? 'club.spa.garden';
const EAS_PROJECT_ID = process.env.SPA_EAS_PROJECT_ID;
const ALLOW_CLEARTEXT = process.env.SPA_ALLOW_CLEARTEXT === '1';

// Ivory: the same value as theme.colors.background, so
// splash → first frame has no flash.
const BACKGROUND = '#F7F2E8';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SPA',
  slug: 'spa-garden-club',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'spa',
  // Light-only brand (SPA day palette: ivory marble, crimson, gold); no dark theme.
  userInterfaceStyle: 'light',
  backgroundColor: BACKGROUND,
  ios: {
    bundleIdentifier: IOS_BUNDLE_ID,
    // Plain PNG, not an Icon Composer (.icon) bundle: the template's expo.icon
    // would otherwise take precedence over the generated SPA icon.
    icon: './assets/images/icon.png',
    supportsTablet: true,
    infoPlist: {
      // The app only uses standard HTTPS/WSS — exempt from export compliance,
      // so TestFlight uploads don't stop at the encryption questionnaire.
      ITSAppUsesNonExemptEncryption: false,
      // ATS has no per-IP exception (the POC host is a tailnet IP), hence the broad flag.
      ...(ALLOW_CLEARTEXT ? { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true } } : {}),
    },
  },
  android: {
    package: ANDROID_PACKAGE,
    adaptiveIcon: {
      backgroundColor: BACKGROUND,
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    // The feed server serves the export as an SPA (index.html fallback), so a
    // single-page build is the right shape — no static per-route HTML needed.
    output: 'single',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: BACKGROUND,
        image: './assets/images/splash-icon.png',
        imageWidth: 220,
      },
    ],
    'expo-sqlite',
    'expo-video',
    'expo-font',
    'expo-image',
    'expo-status-bar',
    'expo-web-browser',
    ...(ALLOW_CLEARTEXT
      ? ([['expo-build-properties', { android: { usesCleartextTraffic: true } }]] as [string, object][])
      : ['expo-build-properties']),
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? null,
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
});
