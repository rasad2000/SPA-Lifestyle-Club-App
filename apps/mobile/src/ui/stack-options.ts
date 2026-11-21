/**
 * Shared native-stack options for every tab's Stack.
 *
 * iOS: transparent header + large title. On iOS 26 the system draws the bar in
 * Liquid Glass with a scroll-edge effect over our backdrop; on iOS < 26 a
 * transparent bar needs an explicit blur material (and on 26 we must NOT add
 * one — headerBlurEffect + scrollEdgeEffects overlap). Scroll views opt in with
 * contentInsetAdjustmentBehavior="automatic" so content starts below the bar.
 * Android/web: opaque black header (no large titles there).
 */
import type { Stack } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform } from 'react-native';

import { hasLiquidGlass } from './glass-mode';
import { backdropStyle, colors, fonts } from './theme';

type ScreenOptions = NonNullable<ComponentProps<typeof Stack>['screenOptions']>;

const isIOS = Platform.OS === 'ios';

export const stackScreenOptions = {
  headerTransparent: isIOS,
  headerLargeTitleEnabled: isIOS,
  headerLargeTitleShadowVisible: false,
  headerShadowVisible: false,
  ...(isIOS && !hasLiquidGlass ? { headerBlurEffect: 'systemChromeMaterialLight' as const } : {}),
  headerLargeStyle: { backgroundColor: 'transparent' },
  // Android/web: an opaque bar would cover the full-screen background → transparent too.
  headerStyle: isIOS ? undefined : { backgroundColor: 'transparent' },
  headerTintColor: colors.accentSoft,
  // Didone display titles (corporate design v2.0: Bodoni Moda for headings).
  headerTitleStyle: { color: colors.text, fontFamily: fonts.serifMedium, fontSize: 19 },
  headerLargeTitleStyle: { color: colors.text, fontFamily: fonts.serifMedium },
  headerBackButtonDisplayMode: 'minimal',
  contentStyle: backdropStyle,
} satisfies ScreenOptions;

/** Detail screens: compact title (a long post/lesson title doesn't fit a large one). */
export const detailScreenOptions = { headerLargeTitleEnabled: false } satisfies ScreenOptions;

/** True when content scrolls under the header (iOS) — overlays must offset by its height. */
export const headerOverlapsContent = isIOS;
