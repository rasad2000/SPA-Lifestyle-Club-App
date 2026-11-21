/**
 * Channel tabs: plain text tabs with a gold underline that slides to the selected
 * channel. Rendered as the feed's STICKY header — it pins to the top while the
 * list scrolls, and once content runs under it (`stuck`) it gains a porcelain backing
 * and a hairline so it reads as a bar.
 */
import type { ChannelSummary } from '@spa/contract';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent, type ScrollViewInstance } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Text } from '@/ui/Text';
import { colors, spacing } from '@/ui/theme';

type Box = { x: number; width: number };

export function ChannelSwitcher({
  channels,
  selected,
  onSelect,
  stuck = false,
}: {
  channels: ChannelSummary[];
  selected: string | null;
  onSelect: (id: string) => void;
  stuck?: boolean;
}) {
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const backing = useSharedValue(0);
  const scroller = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    const box = selected ? boxes[selected] : undefined;
    if (!box) return;
    const first = w.value === 0;
    x.value = first ? box.x : withTiming(box.x, { duration: 220 });
    w.value = first ? box.width : withTiming(box.width, { duration: 220 });
    scroller.current?.scrollTo({ x: Math.max(0, box.x - spacing.xl), animated: true });
  }, [selected, boxes, x, w]);

  useEffect(() => {
    backing.value = withTiming(stuck ? 1 : 0, { duration: 180 });
  }, [stuck, backing]);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: w.value }));
  const backingStyle = useAnimatedStyle(() => ({ opacity: backing.value }));

  const onTabLayout = (id: string) => (e: LayoutChangeEvent) => {
    const { x: bx, width } = e.nativeEvent.layout;
    setBoxes((prev) => (prev[id]?.x === bx && prev[id]?.width === width ? prev : { ...prev, [id]: { x: bx, width } }));
  };

  return (
    <View style={styles.bar}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backing, backingStyle]} />
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        accessibilityRole="tablist">
        <View style={styles.row}>
          {channels.map((ch) => {
            const active = ch.id === selected;
            return (
              <Pressable
                key={ch.id}
                onLayout={onTabLayout(ch.id)}
                onPress={() => onSelect(ch.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                aria-selected={active}
                hitSlop={{ top: 8, bottom: 8 }}
                style={styles.tab}>
                <Text variant="headline" color={active ? colors.text : colors.textTertiary} style={styles.label}>
                  {ch.title}
                </Text>
              </Pressable>
            );
          })}
          <Animated.View pointerEvents="none" style={[styles.indicator, indicator]} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  backing: { backgroundColor: colors.glassStrong },
  scroll: { paddingHorizontal: 0 },
  row: { flexDirection: 'row', gap: spacing.xl },
  tab: { paddingTop: spacing.md, paddingBottom: spacing.md + 2 },
  label: { fontSize: 15 },
  indicator: { position: 'absolute', left: 0, bottom: -StyleSheet.hairlineWidth, height: 2, backgroundColor: colors.accent },
});
