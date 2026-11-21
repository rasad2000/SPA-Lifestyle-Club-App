/**
 * One-line risk notice under every feed and thread. Tapping expands the full text in
 * place: a reader must see a notice next to actionable levels without leaving the screen.
 */
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { de } from '@/i18n/de';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, spacing } from '@/ui/theme';

export function RiskNote() {
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      onPress={() => setOpen((v) => !v)}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityHint={de.feed.riskHint}
      hitSlop={6}
      style={styles.wrap}>
      <Icon name="shield" size={12} color={colors.textTertiary} />
      <Text variant="caption" tone="tertiary" style={styles.text}>
        {open ? de.risk.text : de.feed.risk}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, alignSelf: 'stretch', paddingTop: 2 },
  text: { flexShrink: 1 },
});
