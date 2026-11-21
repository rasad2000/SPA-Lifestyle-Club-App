/**
 * A tab root's title, drawn INSIDE the hall's frame (native large titles sit on the
 * left pillar). Engraved Didone caps over a short bronze rule, with an optional
 * right-hand slot (e.g. Demo + Live on Signale).
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { colors, spacing } from './theme';

export function ScreenTitle({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={styles.wrap} accessibilityRole="header">
      <View style={styles.row}>
        <Text variant="hero" color={colors.text} style={styles.title} numberOfLines={1}>
          {children}
        </Text>
        {right}
      </View>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, fontSize: 22, lineHeight: 28, letterSpacing: 4 },
  rule: { width: 32, height: 1, backgroundColor: colors.accent },
});
