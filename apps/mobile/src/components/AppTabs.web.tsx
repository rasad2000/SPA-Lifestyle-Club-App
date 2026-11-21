/**
 * Web tab layout. There's no system tab bar on web (NativeTabs' web fallback is
 * a plain iPad-style strip), so this renders expo-router's headless tabs with a
 * floating frosted pill at the bottom — the same Liquid-Glass-ish silhouette as
 * iOS 26, via CSS backdrop-filter (expo-blur's web implementation).
 */
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef } from 'react';
import { Pressable, StyleSheet, type ViewInstance } from 'react-native';

import { de } from '@/i18n/de';
import { Glass } from '@/ui/Glass';
import { Icon, type IconName } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

export default function AppTabs() {
  return (
    <Tabs style={styles.root}>
      <TabSlot style={styles.slot} />
      {/* The TabTriggers must be the DIRECT children of TabList's asChild element:
          expo-router parses the tree statically to build the navigator's screens,
          and looks only one level below an asChild TabList (an extra wrapper View
          here = "Couldn't find any screens for the navigator", a blank page). */}
      <TabList asChild>
        <Glass radius={radii.pill} style={styles.bar}>
          <TabTrigger name="(home)" href="/" asChild>
            <TabButton icon="home" label={de.tabs.home} />
          </TabTrigger>
          <TabTrigger name="mitglieder" href="/mitglieder" asChild>
            <TabButton icon="leaf" label={de.tabs.members} />
          </TabTrigger>
          <TabTrigger name="signale" href="/signale" asChild>
            <TabButton icon="signals" label={de.tabs.feed} />
          </TabTrigger>
        </Glass>
      </TabList>
    </Tabs>
  );
}

type TabButtonProps = TabTriggerSlotProps & { icon: IconName; label: string };

const TabButton = forwardRef<ViewInstance, TabButtonProps>(function TabButton(
  { icon, label, isFocused, ...props },
  ref,
) {
  const tint = isFocused ? colors.accent : colors.textSecondary;
  return (
    <Pressable
      ref={ref}
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      style={[styles.tab, isFocused && styles.tabActive]}>
      <Icon name={icon} size={20} color={tint} />
      <Text variant="label" color={tint} style={styles.tabLabel}>
        {label}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  slot: { flex: 1 },
  bar: {
    // Absolutely positioned with no left/right: the static position honours
    // alignSelf, which centres the pill horizontally.
    position: 'absolute',
    bottom: spacing.lg,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs + 2,
    borderWidth: 1,
    borderColor: 'rgba(176, 138, 53, 0.28)',
    shadowColor: colors.shadow,
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  tab: {
    minWidth: 92,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
  },
  tabActive: { backgroundColor: colors.accentGlow },
  tabLabel: { fontSize: 10, letterSpacing: 1.2 },
});
