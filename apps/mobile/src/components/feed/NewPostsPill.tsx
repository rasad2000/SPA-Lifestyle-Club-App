/** Floating glass pill "N neue Beiträge" — shown when live posts arrive while scrolled down. */
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import { de } from '@/i18n/de';
import { Glass } from '@/ui/Glass';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

export function NewPostsPill({
  count,
  top,
  onPress,
}: {
  count: number;
  top: number;
  /** Kept for call-site compatibility; the pill uses the theme gold. */
  accent?: string;
  onPress: () => void;
}) {
  if (count <= 0) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top }]}>
      <Animated.View entering={FadeInUp.springify()} exiting={FadeOutUp}>
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={de.feed.newPosts(count)}>
          <Glass interactive tint={colors.accent} tintStrength="strong" radius={radii.pill} style={styles.pill}>
            <Icon name="arrowUp" size={13} color={colors.accentSoft} />
            <Text variant="subhead" color={colors.accentSoft}>
              {de.feed.newPosts(count)}
            </Text>
          </Glass>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    shadowColor: colors.shadow,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
});
