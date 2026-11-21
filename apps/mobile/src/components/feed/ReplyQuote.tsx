/** One-line reference to the parent post ("↳ High risk Sell gold now …"), from the inline replyPreview. */
import type { Post } from '@spa/contract';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { de } from '@/i18n/de';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, spacing } from '@/ui/theme';

export function ReplyQuote({
  preview,
}: {
  preview: NonNullable<Post['replyPreview']>;
  /** Kept for call-site compatibility. */
  accent?: string;
}) {
  const summary =
    preview.text.replace(/\s+/g, ' ').trim() ||
    (preview.pair ? preview.pair : preview.hasMedia ? `[${de.feed.media}]` : '…');
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/signale/post/[id]', params: { id: preview.id } })}
      accessibilityRole="link"
      accessibilityLabel={`${de.feed.replyTo}: ${summary}`}
      hitSlop={4}
      style={styles.quote}>
      <Icon name="reply" size={11} color={colors.accentDeep} />
      {preview.pair ? (
        <Text variant="caption" color={colors.accentSoft}>
          {preview.pair}
        </Text>
      ) : null}
      <Text variant="footnote" tone="tertiary" numberOfLines={1} style={styles.text}>
        {summary}
      </Text>
      {preview.hasMedia ? <Icon name="photo" size={11} color={colors.textTertiary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  quote: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  text: { flex: 1 },
});
