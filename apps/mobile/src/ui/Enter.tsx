/**
 * Entrance for a row that just arrived live: slides down a little and fades in.
 * Deliberately a plain animated style, not a Reanimated layout animation
 * (`entering`): on react-native-web those leave the list's layout stale, so
 * content after the new row (the list footer) overlapped it.
 */
import { useEffect, type ReactNode } from 'react';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

const RISE = 20;

export function Enter({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    progress.set(withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, [progress]);
  const style = useAnimatedStyle(() => {
    const p = progress.get();
    return { opacity: p, transform: [{ translateY: (p - 1) * RISE }] };
  });
  return <Animated.View style={style}>{children}</Animated.View>;
}
