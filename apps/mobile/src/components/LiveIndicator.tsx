/** Small glass capsule: coloured dot + "Live" / "Verbinde …" / "Offline". Tap = reconnect now. */
import { Pressable, StyleSheet, View } from 'react-native';

import { live, type LiveState } from '@/api/live';
import { useLiveState } from '@/hooks/use-live';
import { de } from '@/i18n/de';
import { Glass } from '@/ui/Glass';
import { hasLiquidGlass } from '@/ui/glass-mode';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

const DOT: Record<LiveState, string> = {
  live: colors.live,
  connecting: colors.connecting,
  offline: colors.offline,
};

export function liveLabel(state: LiveState): string {
  return de.live[state];
}

export function LiveIndicator({ bare = false }: { bare?: boolean }) {
  const state = useLiveState();
  const content = (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: DOT[state] }, state === 'live' && styles.glow]} />
      <Text variant="caption" tone="secondary">
        {liveLabel(state)}
      </Text>
    </View>
  );
  return (
    <Pressable
      onPress={() => live.retryNow()}
      accessibilityRole="button"
      accessibilityLabel={`${de.live.state}: ${liveLabel(state)}`}
      hitSlop={8}>
      {/* In an iOS 26 header the system already wraps bar items in glass — don't double it. */}
      {bare || hasLiquidGlass ? (
        <View style={styles.pad}>{content}</View>
      ) : (
        <Glass radius={radii.pill} style={styles.pad}>
          {content}
        </Glass>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  pad: { paddingVertical: 5, paddingHorizontal: spacing.sm + 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  glow: {
    shadowColor: colors.live,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
});
