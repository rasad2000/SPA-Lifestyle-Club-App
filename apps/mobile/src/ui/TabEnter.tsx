/**
 * Tab-switch transition for a tab's ROOT screen: its content rises in and fades up
 * when the tab becomes active (native tabs otherwise cut over instantly). It plays
 * only on a tab CHANGE: popping back from a thread/lesson inside the same tab
 * doesn't replay it. Honours the system "reduce motion" setting.
 *
 * Wraps the screen's content in one Animated.View whose FIRST child must stay the
 * screen's scroll view (or a view whose first child is): react-native-screens finds
 * the content scroll view by walking first children only, for iOS large-title
 * collapse, scroll-edge glass and tap-tab-to-top.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/** The tab root shown last; a focus on the same tab (back navigation) doesn't animate. */
let lastTab: string | null = null;

const DURATION = 420;
const RISE = 18;

export function TabEnter({ tab, children }: { tab: string; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  // Start hidden when this tab will animate in (no one-frame flash of the final state).
  const [initial] = useState(() => (lastTab === tab ? 1 : 0));
  const progress = useSharedValue(initial);

  useFocusEffect(
    useCallback(() => {
      const changed = lastTab !== tab;
      lastTab = tab;
      // Never leave a screen invisible: same tab or reduced motion → just show it.
      if (!changed || reduceMotion) {
        progress.set(1);
        return;
      }
      // .set() rather than `.value =`: the React Compiler forbids mutating hook values.
      progress.set(0);
      progress.set(withTiming(1, { duration: DURATION, easing: Easing.out(Easing.cubic) }));
    }, [tab, reduceMotion, progress]),
  );

  const style = useAnimatedStyle(() => {
    const p = progress.get();
    return { opacity: p, transform: [{ translateY: (1 - p) * RISE }, { scale: 0.985 + 0.015 * p }] };
  });

  return (
    <Animated.View collapsable={false} style={[styles.fill, style]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
