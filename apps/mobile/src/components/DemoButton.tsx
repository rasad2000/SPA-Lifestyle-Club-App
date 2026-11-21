/**
 * Presenter control in the Signale header: "▶ Demo" clears the feed and has the server
 * replay a live signal sequence; "■ Beenden" ends it and restores the feed. Rendered
 * only when the server reports `demoControls` (DEMO_CONTROLS=1), so a production
 * build talking to a production server never shows it.
 */
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { demo, useDemo } from '@/api/demo';
import { useHealth } from '@/hooks/data';
import { de } from '@/i18n/de';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, spacing } from '@/ui/theme';

export function DemoButton() {
  const { health } = useHealth();
  const state = useDemo();
  if (!health?.demoControls) return null;

  const running = state.phase === 'running';
  const starting = state.phase === 'starting';
  return (
    <Pressable
      onPress={() => (running ? demo.stop() : demo.start())}
      disabled={starting}
      accessibilityRole="button"
      accessibilityLabel={running ? de.demo.stop : de.demo.start}
      accessibilityHint={running ? de.demo.stopHint : de.demo.startHint}
      hitSlop={8}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
      <View style={styles.row}>
        {starting ? (
          <ActivityIndicator size="small" color={colors.accentSoft} />
        ) : (
          <Icon name={running ? 'stop' : 'play2'} size={12} color={colors.accentSoft} />
        )}
        <Text variant="caption" color={colors.accentSoft}>
          {running ? de.demo.stop : de.demo.start}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { paddingVertical: 5, paddingHorizontal: spacing.sm + 2 },
  pressed: { opacity: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
});
