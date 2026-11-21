/**
 * A members-only item the current viewer can't open: still VISIBLE (so prospects see
 * what membership holds), dimmed, not interactive, with a "Gesperrt" lock badge.
 * ("sichtlich gesperrt … minimal transparent zeigen, was drin ist".)
 */
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { de } from '@/i18n/de';

import { Icon } from './Icon';
import { Text } from './Text';
import { colors, radii, spacing } from './theme';

export function Locked({ locked, children, style }: { locked: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  if (!locked) return <View style={style}>{children}</View>;
  return (
    <View style={style} accessibilityState={{ disabled: true }} accessibilityHint={de.members.locked}>
      <View pointerEvents="none" style={styles.dim}>
        {children}
      </View>
      <View pointerEvents="none" style={styles.badge}>
        <Icon name="lock" size={11} color={colors.accentSoft} />
        <Text variant="label" color={colors.accentSoft} style={styles.badgeText}>
          {de.members.locked}
        </Text>
      </View>
    </View>
  );
}

export function LockBadge() {
  return (
    <View style={[styles.badge, styles.inline]}>
      <Icon name="lock" size={11} color={colors.accentSoft} />
      <Text variant="label" color={colors.accentSoft} style={styles.badgeText}>
        {de.members.locked}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { opacity: 0.38 },
  badge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.glassStrong,
  },
  inline: { position: 'relative', top: 0, right: 0, alignSelf: 'flex-start' },
  badgeText: { fontSize: 9, letterSpacing: 1.2 },
});
