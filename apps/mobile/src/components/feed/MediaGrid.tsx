/**
 * Post images. A single image keeps its true aspect ratio (from the contract's
 * width/height, clamped so a tall screenshot can't eat the whole feed);
 * several images tile in a 2-column grid. Tap → fullscreen viewer.
 */
import type { Media } from '@spa/contract';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { mediaUrl } from '@/api/config';
import { de } from '@/i18n/de';
import { colors, radii, spacing } from '@/ui/theme';

import { ImageViewer } from './ImageViewer';

const MIN_RATIO = 0.75; // tallest allowed (w/h) in the feed
const MAX_RATIO = 2.2;
const DEFAULT_RATIO = 4 / 3;

export function aspectOf(m: Pick<Media, 'width' | 'height'>): number {
  if (!m.width || !m.height) return DEFAULT_RATIO;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, m.width / m.height));
}

export function MediaGrid({ media }: { media: Media[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (media.length === 0) return null;

  const single = media.length === 1;
  return (
    <>
      <View style={[styles.grid, !single && styles.multi]}>
        {media.map((m) => {
          const uri = mediaUrl(m.url);
          return (
            <Pressable
              key={m.id}
              onPress={() => setOpen(uri)}
              accessibilityRole="imagebutton"
              accessibilityLabel={de.feed.media}
              style={single ? styles.full : styles.half}>
              <Image
                source={{ uri }}
                recyclingKey={m.id}
                style={[styles.image, { aspectRatio: single ? aspectOf(m) : 1 }]}
                contentFit="cover"
                transition={180}
              />
            </Pressable>
          );
        })}
      </View>
      <ImageViewer uri={open} onClose={() => setOpen(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.xs },
  multi: { flexDirection: 'row', flexWrap: 'wrap' },
  full: { width: '100%' },
  half: { width: '49%', flexGrow: 1 },
  image: {
    width: '100%',
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSolid,
  },
});
