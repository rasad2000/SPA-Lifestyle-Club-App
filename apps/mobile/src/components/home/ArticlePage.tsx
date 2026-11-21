/**
 * A Home video as an Expander page: an article with the video inside it. The video frame
 * sits on top (16:9; with a `url` its play button opens the video in the in-app browser,
 * without one it is the "Bald" placeholder), then the title and the article text.
 * The frame's poster is the video's palette material (`video.texture`), dimmed so the play
 * ring reads. Swiping DOWN at the top closes it (the Expander's gesture, armed by `stage.scrollY`).
 */
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedScrollHandler } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Stage } from '@/components/Expander';
import type { HomeVideo } from '@/content/home';
import { de } from '@/i18n/de';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, fonts, gradient, radii, spacing } from '@/ui/theme';

const SHEEN = gradient(
  'linear-gradient(160deg, rgba(201,162,74,0.16) 0%, rgba(201,162,74,0.04) 45%, rgba(255,253,248,0) 70%)',
);

export function ArticlePage({ video, stage }: { video: HomeVideo; stage: Stage }) {
  const insets = useSafeAreaInsets();
  const { scrollY } = stage;
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  const ready = Boolean(video.url);

  return (
    <View style={styles.root}>
      <GestureDetector gesture={stage.scroll}>
        <Animated.ScrollView
          bounces={false}
          overScrollMode="never"
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + spacing.xxxl + spacing.lg, paddingBottom: insets.bottom + spacing.xxxl },
          ]}>
          <Pressable
            disabled={!ready}
            onPress={() => video.url && WebBrowser.openBrowserAsync(video.url).catch(() => {})}
            accessibilityRole={ready ? 'button' : 'image'}
            accessibilityLabel={ready ? video.title : `${video.title}, ${de.home.soon}`}
            style={styles.video}>
            {video.texture ? (
              <>
                <Image source={video.texture} contentFit="cover" style={StyleSheet.absoluteFill} />
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim]} />
              </>
            ) : null}
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, SHEEN]} />
            <View style={[styles.play, ready && styles.playReady]}>
              <Icon name="play2" size={22} color={ready ? colors.onAccent : colors.accentSoft} />
            </View>
            {ready ? null : (
              <Text variant="label" color={colors.accent} style={styles.soon}>
                {de.home.soon}
              </Text>
            )}
          </Pressable>

          <View style={styles.head}>
            <Text variant="label" color={colors.accent}>
              {video.subtitle}
            </Text>
            <Text style={styles.title}>{video.title}</Text>
            <View style={styles.rule} />
          </View>
          {video.article ? <Text style={styles.body}>{video.article}</Text> : null}
        </Animated.ScrollView>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, gap: spacing.xl },
  video: {
    aspectRatio: 16 / 9,
    borderRadius: radii.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSolid,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
  },
  play: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.glassSoft,
  },
  dim: { backgroundColor: 'rgba(43, 26, 23, 0.08)' },
  playReady: { backgroundColor: colors.accent },
  soon: { fontSize: 9, letterSpacing: 1.6 },
  head: { gap: spacing.sm },
  title: { fontFamily: fonts.serifMedium, fontSize: 28, lineHeight: 34, color: colors.text },
  rule: { width: 40, height: 1, backgroundColor: colors.accent, marginTop: spacing.xs },
  body: { fontFamily: fonts.sans, fontSize: 17, lineHeight: 27, color: colors.textSecondary },
});
