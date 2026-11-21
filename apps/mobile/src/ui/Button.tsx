/**
 * Buttons from the design spec: "primary" = solid champagne gold with dark ink;
 * "secondary" = onyx with a brass hairline and gold text. Both are plain views
 * (not glass): a solid CTA must read the same on every platform.
 */
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { colors, radii, spacing } from './theme';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  trailingIcon,
  accessibilityHint,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  icon?: IconName;
  trailingIcon?: IconName;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const primary = variant === 'primary';
  const ink = primary ? colors.onAccent : colors.accentSoft;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        pressed && (primary ? styles.primaryPressed : styles.secondaryPressed),
        style,
      ]}>
      <View style={styles.row}>
        {icon ? <Icon name={icon} size={15} color={ink} /> : null}
        <Text variant="headline" color={ink} style={styles.label}>
          {label}
        </Text>
        {trailingIcon ? <Icon name={trailingIcon} size={13} color={ink} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.accent,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.35)',
  },
  primaryPressed: { backgroundColor: colors.accentSoft, transform: [{ scale: 0.99 }] },
  secondary: {
    backgroundColor: colors.glassSoft,
    borderWidth: 1,
    borderColor: colors.brass,
  },
  secondaryPressed: { borderColor: colors.accentDeep },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { flexShrink: 1, textAlign: 'center' },
});
