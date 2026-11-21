/**
 * A newsletter post as an Expander page: the poster fills the screen; if the
 * post has text, faded white arrows pulse at the right edge, prompting a swipe. Swiping
 * slides the text in while the image darkens behind it. Text and arrows are white/ivory
 * over a dark scrim, which reads on any poster (the poster viewer stays on black, like
 * a photo viewer). Swiping DOWN closes (the Expander's gesture).
 *
 * Reanimated's useAnimatedScrollHandler on an Animated.ScrollView (native-safe; never call an
 * Animated.event yourself). Honours "reduce motion" (no pulsing).
 */
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Stage } from '@/components/Expander';
import type { NewsPost } from '@/content/home';
import { de } from '@/i18n/de';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { fonts, spacing } from '@/ui/theme';

const INK = '#F7F3EC';
const INK_SOFT = 'rgba(247, 243, 236, 0.78)';
const ARROW = 'rgba(255, 255, 255, 0.85)';

export function NewsPage({ post, stage }: { post: NewsPost; stage: Stage }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const hasText = Boolean(post.text);

  const scrollX = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      pulse.set(0.6);
      return;
    }
    pulse.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 900 }),
        ),
        -1,
      ),
    );
  }, [pulse, reduceMotion]);

  const dim = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, [0, width], [0, 0.84], Extrapolation.CLAMP),
  }));
  const arrows = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, [0, width * 0.35], [1, 0], Extrapolation.CLAMP) * (0.35 + 0.6 * pulse.get()),
    transform: [{ translateX: 8 * pulse.get() }],
  }));
  const textIn = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, [width * 0.35, width], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <View style={styles.root}>
      <Image source={post.image} contentFit="contain" style={StyleSheet.absoluteFill} accessibilityLabel={post.title} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim, dim]} />

      {hasText ? (
        <GestureDetector gesture={stage.scroll}>
          <Animated.ScrollView
            horizontal
            pagingEnabled
            bounces={false}
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            style={StyleSheet.absoluteFill}>
            <View style={{ width, height }} />
            <Animated.View
              style={[
                {
                  width,
                  minHeight: height,
                  paddingTop: insets.top + spacing.xxxl,
                  paddingBottom: insets.bottom + spacing.xxl,
                },
                styles.textPage,
                textIn,
              ]}>
              <Text style={styles.title}>{post.title}</Text>
              <View style={styles.rule} />
              <Text style={styles.body}>{post.text}</Text>
            </Animated.View>
          </Animated.ScrollView>
        </GestureDetector>
      ) : null}

      {hasText ? (
        <Animated.View pointerEvents="none" style={[styles.arrows, arrows]} accessibilityLabel={de.home.newsMore}>
          <Icon name="chevronRight" size={22} color={ARROW} />
          <View style={styles.arrowTight}>
            <Icon name="chevronRight" size={22} color={ARROW} />
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  dim: { backgroundColor: '#050403' },
  textPage: { paddingHorizontal: spacing.xxl, justifyContent: 'center', gap: spacing.lg },
  title: { fontFamily: fonts.serifMedium, fontSize: 30, lineHeight: 36, letterSpacing: 1, color: INK },
  rule: { width: 40, height: 1, backgroundColor: INK_SOFT },
  body: { fontFamily: fonts.sans, fontSize: 17, lineHeight: 26, color: INK_SOFT },
  arrows: {
    position: 'absolute',
    right: spacing.md,
    top: '50%',
    marginTop: -14,
    flexDirection: 'row',
  },
  arrowTight: { marginLeft: -12, opacity: 0.6 },
});
