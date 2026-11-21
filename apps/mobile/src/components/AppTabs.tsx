/**
 * Native system tab bar (iOS: UITabBarController — Liquid Glass on iOS 26;
 * Android: Material bottom navigation). Each tab hosts its own Stack, so detail
 * screens push inside the tab. Web uses AppTabs.web.tsx.
 *
 * SDK 58+ uses the stable `expo-router/native-tabs` import path.
 */
import { NativeTabs } from 'expo-router/native-tabs';
import { Platform } from 'react-native';

import { de } from '@/i18n/de';
import { colors, fonts } from '@/ui/theme';

export default function AppTabs() {
  return (
    <NativeTabs
      // iOS 26: the bar shrinks while reading the feed and returns on scroll-up.
      minimizeBehavior="onScrollDown"
      tintColor={colors.accent}
      // Same colour for both states → both icons render as templates (iOS requires
      // default/selected to share one rendering mode).
      iconColor={{ default: colors.textSecondary, selected: colors.accent }}
      labelStyle={{
        default: { color: colors.textSecondary, fontFamily: fonts.sansSemiBold },
        selected: { color: colors.accent, fontFamily: fonts.sansSemiBold },
      }}
      // iOS ≤ 18 only (iOS 26 ignores bar background props — it's glass). On Android this
      // colour paints the WHOLE tabs container, not just the bar, and hid the hall, so it
      // stays transparent there and the root layout draws the bar's floor (TabBarFloor).
      backgroundColor={Platform.OS === 'android' ? 'transparent' : colors.background}
      indicatorColor={colors.accentGlow}
      rippleColor={colors.accentGlow}
      // FlatList can't report its scroll edge to the bar on iOS ≤ 18 → keep it opaque.
      disableTransparentOnScrollEdge>
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Label>{de.tabs.home}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="mitglieder">
        <NativeTabs.Trigger.Label>{de.tabs.members}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'leaf', selected: 'leaf.fill' }} md="spa" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="signale">
        <NativeTabs.Trigger.Label>{de.tabs.feed}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'waveform.path.ecg', selected: 'waveform.path.ecg' }} md="monitoring" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
