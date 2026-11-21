/**
 * Section heading in the corporate design's engraved style: Didone caps with wide
 * tracking over a short bronze rule (as on the "Farbpalette" sheet).
 */
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './Text';
import { colors, spacing } from './theme';

export function SectionTitle({ children, right, style }: { children: string; right?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.wrap, style]} accessibilityRole="header">
      <View style={styles.row}>
        <Text variant="section" color={colors.text} style={styles.title}>
          {children}
        </Text>
        {right}
      </View>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { flex: 1 },
  rule: { width: 28, height: 1, backgroundColor: colors.accent },
});
