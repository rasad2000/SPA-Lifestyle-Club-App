/**
 * Feed row. A signal is a TRADE CARD: the levels widget plus a footer carrying the
 * trade's latest update ("TP2 HIT +80 pips · vor 2 Min. · 4 Updates"), so the
 * "Trades" view reads like a cockpit, not a message board. A finished trade (all
 * TPs / stopped / closed) is greyed out. Anything else is a plain message card.
 *
 * Tapping opens the trade's TIMELINE: a reply opens its root signal focused on that
 * reply (the thread screen walks up nested replies via the server's `rootId`).
 * A row inserted live (`fresh`) slides in and glows gold once; rows mounting because
 * of scrolling or paging never animate.
 */
import type { Post } from '@spa/contract';
import { router } from 'expo-router';
import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { de } from '@/i18n/de';
import { extraSignalText } from '@/lib/signal-text';
import { isDead, isMilestone } from '@/lib/trade';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { Enter } from '@/ui/Enter';
import { colors, radii, rimStyle, spacing } from '@/ui/theme';

import { MediaGrid } from './MediaGrid';
import { ReplyQuote } from './ReplyQuote';
import { SignalBody } from './SignalCard';
import { TimeStamp } from './TimeStamp';

type Props = {
  post: Post;
  /** Kept for call-site compatibility; rows use the theme gold. */
  accent?: string;
  /** Show the one-line parent reference (off where the parent is already on screen). */
  showQuote?: boolean;
  /** Row opens the trade timeline (+ shows the update footer). */
  showThreadLink?: boolean;
  /** Absolute time by default (detail view). */
  absoluteTime?: boolean;
  /** The post's channel is a demo snapshot (signal status shown as "at capture"). */
  demo?: boolean;
  /** Inserted by a live event just now: animate in. */
  fresh?: boolean;
};

/** Where tapping a post goes: its trade's timeline, focused on this post when it is an update. */
export function openTrade(post: Pick<Post, 'id' | 'replyTo'>) {
  router.push({ pathname: '/signale/post/[id]', params: post.replyTo ? { id: post.replyTo, focus: post.id } : { id: post.id } });
}

function PostCardImpl({
  post,
  showQuote = true,
  showThreadLink = true,
  absoluteTime = false,
  demo = false,
  fresh = false,
}: Props) {
  // Under a signal card, show only what the producer's text adds beyond the levels.
  const signalText =
    post.signal && post.text && post.text !== post.signal.notes ? extraSignalText(post.text, post.signal) : '';
  const isSignal = post.signal != null;
  const dead = post.signal ? isDead(post.signal) : false;

  const body = (
    <>
      {showQuote && post.replyPreview ? <ReplyQuote preview={post.replyPreview} /> : null}

      <View style={styles.meta}>
        <TimeStamp iso={post.createdAt} absolute={absoluteTime} />
        {post.editedAt ? <Icon name="pencil" size={10} color={colors.textTertiary} /> : null}
        {showThreadLink && !isSignal && post.replyCount > 0 ? (
          <View style={styles.replies}>
            <Icon name="thread" size={12} color={colors.accentSoft} />
            <Text variant="mono" tone="accent">
              {post.replyCount}
            </Text>
          </View>
        ) : null}
      </View>

      {post.signal ? (
        <SignalBody signal={post.signal} demo={demo} />
      ) : post.text ? (
        <Text variant="body" selectable={!showThreadLink}>
          {post.text}
        </Text>
      ) : null}

      {signalText ? (
        <Text variant="callout" tone="secondary" selectable={!showThreadLink}>
          {signalText}
        </Text>
      ) : null}

      <MediaGrid media={post.media} />

      {isSignal && showThreadLink && post.thread ? <TradeFooter thread={post.thread} /> : null}
    </>
  );

  const cardStyle = [isSignal ? styles.signalCard : styles.standardCard, dead && styles.dead];
  const rim = isSignal && !dead ? <View pointerEvents="none" style={[styles.rim, rimStyle]} /> : null;

  const card = !showThreadLink ? (
    <View style={cardStyle}>
      {rim}
      {body}
    </View>
  ) : (
    <Pressable
      onPress={() => openTrade(post)}
      accessibilityRole="link"
      accessibilityHint={de.trade.timeline}
      style={({ pressed }) => [...cardStyle, pressed && styles.pressed]}>
      {rim}
      {body}
    </Pressable>
  );

  if (!fresh) return card;
  return (
    <Enter>
      {card}
      <FreshGlow radius={isSignal ? radii.lg : radii.md} />
    </Enter>
  );
}

/** The trade's latest update, on the card itself. */
function TradeFooter({ thread }: { thread: NonNullable<Post['thread']> }) {
  const line = thread.last.text.split('\n').find((l) => l.trim()) ?? (thread.last.hasMedia ? `[${de.feed.media}]` : '…');
  const milestone = isMilestone(thread.last.text);
  return (
    <View style={styles.footer}>
      <View style={[styles.footerDot, milestone && styles.footerDotMilestone]} />
      <Text variant="subhead" numberOfLines={1} style={styles.footerText} color={milestone ? colors.accentSoft : colors.textSecondary}>
        {line.trim()}
      </Text>
      <TimeStamp iso={thread.last.createdAt} />
      <Text variant="mono" tone="tertiary">
        {`· ${de.trade.updates(thread.updates)}`}
      </Text>
      <Icon name="chevronRight" size={11} color={colors.accentDeep} />
    </View>
  );
}

/** One gold ring that fades out after a live insert. */
function FreshGlow({ radius }: { radius: number }) {
  const glow = useSharedValue(1);
  useEffect(() => {
    glow.set(withDelay(700, withTiming(0, { duration: 1800 })));
  }, [glow]);
  const style = useAnimatedStyle(() => ({ opacity: glow.get() }));
  return <Animated.View pointerEvents="none" style={[styles.glow, { borderRadius: radius }, style]} />;
}

export const PostCard = memo(PostCardImpl);

const styles = StyleSheet.create({
  // Horizontal inset comes from the screen (the hall's frame), not the card.
  signalCard: {
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg + 2,
    gap: spacing.md,
    backgroundColor: colors.surfaceSolid,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(176, 138, 53, 0.28)',
    // No overflow clip: on iOS a clipping view draws no shadow.
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 4,
  },
  standardCard: {
    marginVertical: 4,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    gap: spacing.md,
    backgroundColor: colors.glassFill,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(176, 138, 53, 0.14)',
  },
  // A finished trade stays readable (its result matters) but steps back.
  dead: { opacity: 0.5, borderColor: colors.hairline, shadowOpacity: 0 },
  rim: { position: 'absolute', top: 0, left: radii.lg, right: radii.lg, height: 1 },
  pressed: { opacity: 0.8, backgroundColor: colors.surfaceRaised },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  replies: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    backgroundColor: 'rgba(176, 138, 53, 0.08)',
    paddingHorizontal: spacing.xs + 3,
    paddingVertical: 2,
    borderRadius: radii.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(176, 138, 53, 0.2)',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  footerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textTertiary },
  footerDotMilestone: { backgroundColor: colors.accent },
  footerText: { flex: 1 },
  glow: {
    position: 'absolute',
    top: spacing.sm - 4,
    bottom: spacing.sm - 4,
    left: spacing.md - 4,
    right: spacing.md - 4,
    borderWidth: 2,
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.7,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
});
