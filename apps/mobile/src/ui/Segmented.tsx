/**
 * Segmented control with a champagne pill that slides between segments (Trades | Alle,
 * SPA Garden Club | Orangerie, the presenter's Ansicht). `size="small"` for secondary rows.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Text } from './Text';
import { colors, radii, spacing } from './theme';

export type SegmentOption<T extends string> = { value: T; label: string };

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'regular',
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Accessibility label of the whole control. */
  label: string;
  size?: 'regular' | 'small';
}) {
  const [widths, setWidths] = useState<number[]>(() => options.map(() => 0));
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  useEffect(() => {
    if (widths.some((v) => v === 0)) return;
    const left = widths.slice(0, index).reduce((a, b) => a + b, 0);
    const first = w.get() === 0;
    const timing = { duration: 240, easing: Easing.out(Easing.cubic) };
    x.set(first ? left : withTiming(left, timing));
    w.set(first ? widths[index] : withTiming(widths[index], timing));
  }, [index, widths, x, w]);

  const pill = useAnimatedStyle(() => ({ width: w.get(), transform: [{ translateX: x.get() }] }));

  const onLayout = (i: number) => (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    setWidths((prev) => (prev[i] === width ? prev : prev.map((v, k) => (k === i ? width : v))));
  };

  const small = size === 'small';
  return (
    <View style={styles.track} accessibilityRole="tablist" accessibilityLabel={label}>
      <Animated.View pointerEvents="none" style={[styles.pill, pill]} />
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onLayout={onLayout(i)}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            aria-selected={active}
            hitSlop={6}
            style={small ? styles.segmentSmall : styles.segment}>
            <Text variant={small ? 'caption' : 'subhead'} color={active ? colors.onAccent : colors.textSecondary}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    padding: 3,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.glassCard,
  },
  pill: { position: 'absolute', top: 3, bottom: 3, left: 3, borderRadius: radii.pill, backgroundColor: colors.accent },
  segment: { paddingVertical: 6, paddingHorizontal: spacing.lg },
  segmentSmall: { paddingVertical: 4, paddingHorizontal: spacing.md },
});
