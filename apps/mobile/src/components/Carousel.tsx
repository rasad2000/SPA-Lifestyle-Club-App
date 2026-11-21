/**
 * Horizontal carousel inside the hall's picture frame. Cards rest inside the pillars and
 * can be swiped INTO them, where EdgeFade dissolves them. The next card always peeks in
 * from the right, and page dots under the row say there is more: the two cues that the
 * row scrolls sideways.
 *
 * Driven by Reanimated's useAnimatedScrollHandler on an Animated.ScrollView (the
 * native-safe API; never call an Animated.event yourself, see CLAUDE.md).
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { useFrame } from '@/ui/frame';
import { colors, spacing } from '@/ui/theme';

import { EdgeFade } from './EdgeFade';

export function Carousel<T>({
  items,
  itemWidth,
  gap = 6,
  keyOf,
  render,
}: {
  items: readonly T[];
  itemWidth: number;
  gap?: number;
  keyOf: (item: T) => string;
  render: (item: T, index: number) => ReactNode;
}) {
  const frame = useFrame();
  const scrollX = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });
  const step = itemWidth + gap;
  // The last card rarely gets a full step of scroll; dots track the real range instead.
  const range = Math.max(1, frame.pad * 2 + items.length * itemWidth + (items.length - 1) * gap - frame.width);
  const pages = items.length - 1;

  return (
    <View style={styles.wrap}>
      <EdgeFade>
        <Animated.ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          snapToInterval={step}
          snapToAlignment="start"
          decelerationRate="fast"
          contentContainerStyle={[styles.row, { paddingHorizontal: frame.pad, gap }]}>
          {items.map((item, i) => (
            <View key={keyOf(item)} style={{ width: itemWidth }}>
              {render(item, i)}
            </View>
          ))}
        </Animated.ScrollView>
      </EdgeFade>
      {items.length > 1 ? (
        <View
          style={[styles.dots, { paddingHorizontal: frame.pad }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          {items.map((item, i) => (
            <Dot key={keyOf(item)} index={i} range={range} pages={pages} scrollX={scrollX} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Dot({
  index,
  range,
  pages,
  scrollX,
}: {
  index: number;
  range: number;
  pages: number;
  scrollX: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const at = (Math.min(scrollX.value, range) / range) * pages;
    const near = interpolate(Math.abs(at - index), [0, 1], [1, 0], Extrapolation.CLAMP);
    return { width: 5 + 11 * near, opacity: 0.35 + 0.65 * near };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  row: { alignItems: 'stretch' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { height: 5, borderRadius: 3, backgroundColor: colors.accent },
});
