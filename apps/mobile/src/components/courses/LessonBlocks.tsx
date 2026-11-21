/**
 * Renders every LessonBlock type 1:1 to a native component (the contract uses
 * structured blocks instead of Markdown precisely so no render library is
 * needed). Server-relative image/video/file URLs get the API base prefixed.
 *
 * Blocks arrive parsed LENIENTLY (contract LenientLessonBlock): a type this
 * build doesn't know renders as a neutral "not displayable" card (with an
 * "Öffnen" link when it has a URL) instead of failing the whole course.
 * Embeds play in the provider's own player; files and links open in the
 * system browser / document viewer (expo-web-browser).
 */
import { embedPlayerUrl, type EmbedProvider, type LenientLessonBlock } from '@spa/contract';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { mediaUrl } from '@/api/config';
import { de } from '@/i18n/de';
import { formatBytes, noBreakUnits } from '@/lib/format';
import { Glass } from '@/ui/Glass';
import { Icon, type IconName } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

import { EmbedPlayer } from './EmbedPlayer';

const CALLOUT: Record<'info' | 'warning' | 'success', { color: string; icon: IconName }> = {
  info: { color: colors.accent, icon: 'info' },
  warning: { color: colors.warning, icon: 'warning' },
  success: { color: colors.success, icon: 'success' },
};

export function LessonBlocks({ blocks }: { blocks: LenientLessonBlock[] }) {
  return (
    <View style={styles.blocks}>
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </View>
  );
}

function Block({ block }: { block: LenientLessonBlock }) {
  switch (block.type) {
    case 'heading':
      return (
        <Text variant="title" accessibilityRole="header" style={styles.heading}>
          {block.text}
        </Text>
      );
    case 'paragraph':
      return (
        <Text variant="body" selectable style={styles.paragraph}>
          {noBreakUnits(block.text)}
        </Text>
      );
    case 'bullets':
      return (
        <View style={styles.bullets}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text variant="body" selectable style={styles.flex}>
                {noBreakUnits(item)}
              </Text>
            </View>
          ))}
        </View>
      );
    case 'callout': {
      const tone = CALLOUT[block.tone];
      return (
        <Glass layer="content" tint={tone.color} tintStrength="strong" radius={radii.md} style={styles.callout}>
          <Icon name={tone.icon} size={18} color={tone.color} />
          <View style={styles.flex}>
            {block.title ? <Text variant="headline">{block.title}</Text> : null}
            <Text variant="callout" selectable>
              {noBreakUnits(block.text)}
            </Text>
          </View>
        </Glass>
      );
    }
    case 'image':
      return <ImageBlock url={block.url} caption={block.caption} />;
    case 'video':
      return <VideoBlock url={block.url} caption={block.caption} />;
    case 'embed':
      return <EmbedBlock provider={block.provider} url={block.url} caption={block.caption} />;
    case 'file': {
      const meta = [block.mime === 'application/pdf' ? 'PDF' : null, block.sizeBytes != null ? formatBytes(block.sizeBytes) : null]
        .filter(Boolean)
        .join(' · ');
      return (
        <OpenRow
          icon="document"
          title={block.name}
          meta={meta || de.courses.block.document}
          url={mediaUrl(block.url)}
          a11y={de.courses.block.openFile}
        />
      );
    }
    case 'link':
      return <OpenRow icon="link" title={block.label} meta={hostOf(block.url)} url={block.url} a11y={block.label} />;
    case 'unsupported':
      return <UnsupportedBlock url={block.url} />;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return de.courses.block.link;
  }
}

/** Opens in the in-app browser sheet (SFSafariViewController / Custom Tabs / a new tab on web). */
function open(url: string) {
  WebBrowser.openBrowserAsync(url).catch(() => {});
}

function OpenRow({
  icon,
  title,
  meta,
  url,
  a11y,
}: {
  icon: IconName;
  title: string;
  meta: string;
  url: string;
  a11y: string;
}) {
  return (
    <Pressable onPress={() => open(url)} accessibilityRole="link" accessibilityLabel={a11y}>
      {({ pressed }) => (
        <Glass layer="content" interactive radius={radii.md} style={[styles.row, pressed && styles.pressed]}>
          <Icon name={icon} size={20} color={colors.accentSoft} />
          <View style={styles.flex}>
            <Text variant="headline" numberOfLines={2}>
              {title}
            </Text>
            <Text variant="caption" tone="tertiary" numberOfLines={1}>
              {meta}
            </Text>
          </View>
          <Icon name="external" size={14} color={colors.textSecondary} />
        </Glass>
      )}
    </Pressable>
  );
}

function EmbedBlock({ provider, url, caption }: { provider: EmbedProvider; url: string; caption?: string }) {
  const playerUrl = embedPlayerUrl({ provider, url });
  return (
    <View style={styles.media}>
      {playerUrl ? <EmbedPlayer playerUrl={playerUrl} title={caption ?? de.courses.block.video} /> : null}
      <Caption text={caption} />
      {/* Always a way out: some players refuse to embed (owner setting, region, consent). */}
      <Pressable onPress={() => open(url)} accessibilityRole="link" hitSlop={6} style={styles.inlineLink}>
        <Icon name="external" size={12} color={colors.accentSoft} />
        <Text variant="footnote" tone="accent">
          {de.courses.block.openVideo}
        </Text>
      </Pressable>
    </View>
  );
}

function UnsupportedBlock({ url }: { url?: string }) {
  // Only open what is safely openable: an absolute http(s) URL or a server-relative path.
  const target = url && (/^https?:\/\//i.test(url) || url.startsWith('/')) ? mediaUrl(url) : null;
  return (
    <Glass layer="content" radius={radii.md} style={styles.unsupported}>
      <Icon name="unknown" size={18} color={colors.textSecondary} />
      <View style={styles.flex}>
        <Text variant="callout">{de.courses.block.unsupported}</Text>
        <Text variant="caption" tone="tertiary">
          {de.courses.block.unsupportedHint}
        </Text>
        {target ? (
          <Pressable onPress={() => open(target)} accessibilityRole="link" hitSlop={6} style={styles.inlineLink}>
            <Icon name="external" size={12} color={colors.accentSoft} />
            <Text variant="footnote" tone="accent">
              {de.courses.block.open}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Glass>
  );
}

function Caption({ text }: { text?: string }) {
  return text ? (
    <Text variant="footnote" tone="tertiary" style={styles.caption}>
      {text}
    </Text>
  ) : null;
}

function ImageBlock({ url, caption }: { url: string; caption?: string }) {
  // Blocks carry no dimensions, so learn the aspect ratio from the loaded image.
  const [ratio, setRatio] = useState(16 / 9);
  return (
    <View style={styles.media}>
      <Image
        source={{ uri: mediaUrl(url) }}
        style={[styles.image, { aspectRatio: ratio }]}
        contentFit="contain"
        transition={200}
        onLoad={(e) => {
          const { width, height } = e.source;
          if (width > 0 && height > 0) setRatio(width / height);
        }}
        accessibilityLabel={caption}
      />
      <Caption text={caption} />
    </View>
  );
}

function VideoBlock({ url, caption }: { url: string; caption?: string }) {
  const player = useVideoPlayer(mediaUrl(url), (p) => {
    p.loop = false;
  });
  return (
    <View style={styles.media}>
      <VideoView
        player={player}
        style={styles.video}
        nativeControls
        contentFit="contain"
        allowsPictureInPicture
      />
      <Caption text={caption} />
    </View>
  );
}

const styles = StyleSheet.create({
  blocks: { gap: spacing.lg },
  heading: { marginTop: spacing.sm },
  paragraph: { color: colors.text },
  bullets: { gap: spacing.sm },
  bulletRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accentSoft,
    marginTop: 9,
  },
  flex: { flex: 1, gap: spacing.xs },
  callout: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  media: { gap: spacing.xs },
  image: { width: '100%', borderRadius: radii.md, backgroundColor: colors.surfaceSolid },
  video: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  caption: { paddingHorizontal: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  pressed: { opacity: 0.85 },
  inlineLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', paddingHorizontal: spacing.xs },
  unsupported: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, alignItems: 'flex-start' },
});
