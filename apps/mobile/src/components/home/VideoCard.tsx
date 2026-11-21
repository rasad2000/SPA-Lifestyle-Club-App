/**
 * A video tile: a quiet dark-glass card (no photo poster: the hall behind it is the
 * only imagery), a bronze play ring, Didone title. `VideoTile` is the look alone (also the
 * Expander's cover when the tile opens into its article); `VideoCard` makes it pressable:
 * with `onPress` it opens whatever the caller shows (Home: the article), otherwise a `url`
 * opens the video in the in-app browser and no url is an inert "Bald" placeholder.
 */
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { HomeVideo } from '@/content/home';
import { de } from '@/i18n/de';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, gradient, radii, spacing } from '@/ui/theme';

const SHEEN = gradient(
  'linear-gradient(155deg, rgba(201,162,74,0.12) 0%, rgba(201,162,74,0.03) 38%, rgba(255,253,248,0) 60%)',
);

export function VideoTile({ video, style }: { video: HomeVideo; style?: StyleProp<ViewStyle> }) {
  const ready = Boolean(video.url);
  return (
    <View style={[styles.card, style]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, SHEEN]} />
      <View style={styles.top}>
        <View style={[styles.play, ready && styles.playReady]}>
          <Icon name="play2" size={14} color={ready ? colors.onAccent : colors.accentSoft} />
        </View>
        {ready ? null : (
          <Text variant="label" color={colors.accent} style={styles.soon}>
            {de.home.soon}
          </Text>
        )}
      </View>
      <View style={styles.caption}>
        <Text variant="title" numberOfLines={2} style={styles.title}>
          {video.title}
        </Text>
        <Text variant="footnote" tone="tertiary">
          {video.subtitle}
        </Text>
      </View>
    </View>
  );
}

export function VideoCard({
  video,
  onPress,
  style,
}: {
  video: HomeVideo;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const ready = Boolean(video.url);
  const press =
    onPress ?? (ready ? () => video.url && WebBrowser.openBrowserAsync(video.url).catch(() => {}) : undefined);
  return (
    <Pressable
      disabled={!press}
      onPress={press}
      accessibilityRole={press ? 'button' : 'text'}
      accessibilityLabel={`${video.title}, ${video.subtitle}${ready ? '' : `, ${de.home.soon}`}`}
      style={({ pressed }) => [style, pressed && styles.pressed]}>
      <VideoTile video={video} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: 16 / 10,
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.glassCard,
  },
  pressed: { opacity: 0.85 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  play: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  playReady: { backgroundColor: colors.accent },
  soon: { fontSize: 9, letterSpacing: 1.6 },
  caption: { gap: 2 },
  title: { fontSize: 19, lineHeight: 24 },
});
