/**
 * Trade timeline: the signal card on top, then EVERY update that followed it (any
 * reply depth, oldest first) on a vertical rail — milestones (TP/SL hit, risk free,
 * close) as gold nodes, with the time since entry. Updates arriving live slide in.
 *
 * Opened on an update (a reply, possibly nested) it re-opens the trade's ROOT
 * (`thread.rootId`) and scrolls to + highlights that update (`?focus=`), so tapping
 * "TP3 HIT" shows TP1 and TP2 before it.
 */
import type { Post } from '@spa/contract';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { MediaGrid } from '@/components/feed/MediaGrid';
import { PostCard } from '@/components/feed/PostCard';
import { RiskNote } from '@/components/feed/RiskNote';
import { useChannels, usePostThread } from '@/hooks/data';
import { de } from '@/i18n/de';
import { absoluteDateTime, formatMinutes } from '@/lib/format';
import { isMilestone } from '@/lib/trade';
import { Enter } from '@/ui/Enter';
import { ErrorState, LoadingState, MessageState, StaleBanner } from '@/ui/States';
import { Text } from '@/ui/Text';
import { useFrame } from '@/ui/frame';
import { colors, contentBottomPad, radii, spacing, withAlpha } from '@/ui/theme';

/** Leave this much room above a focused update when scrolling to it. */
const FOCUS_MARGIN = 140;

export default function ThreadScreen() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const postId = typeof id === 'string' ? id : undefined;
  const focusId = typeof focus === 'string' ? focus : undefined;
  const { thread, loading, error, refresh, refreshing, stale, deleted } = usePostThread(postId);
  const { channels } = useChannels();
  const channel = channels.find((c) => c.id === thread?.post.channel);
  const demo = channel?.demo ?? false;

  // Opened on an update: show its whole trade instead, focused on that update.
  const rootId = thread?.rootId;
  const openedOn = thread?.post.id;
  useEffect(() => {
    if (rootId && openedOn && rootId !== openedOn) {
      router.replace({ pathname: '/signale/post/[id]', params: { id: rootId, focus: focusId ?? openedOn } });
    }
  }, [rootId, openedOn, focusId]);

  // Scroll the focused update into view once both offsets are known. Layout events
  // arrive child-first, so the entry's offset usually lands before the timeline's.
  const scroller = useRef<ScrollViewInstance>(null);
  const frame = useFrame();
  const timelineTop = useRef<number | null>(null);
  const focusY = useRef<number | null>(null);
  const scrolled = useRef(false);
  const tryScroll = () => {
    if (scrolled.current || timelineTop.current == null || focusY.current == null) return;
    scrolled.current = true;
    scroller.current?.scrollTo({ y: Math.max(0, timelineTop.current + focusY.current - FOCUS_MARGIN), animated: true });
  };
  const onFocusLayout = (y: number) => {
    focusY.current = y;
    tryScroll();
  };

  // Entries that already existed when the screen opened render still; only ones
  // posted after that (arriving live) animate in.
  const [openedAt] = useState(() => Date.now());
  const timeline = thread ? (thread.timeline ?? thread.replies) : [];

  let body: ReactNode;
  // Deleted while open (the relay's source-delete cascade) or a deep link to an
  // already-deleted post (404): say so and offer a way out — a retry can't help.
  if (deleted || (!thread && error?.kind === 'notFound')) {
    body = (
      <MessageState
        icon="info"
        message={de.thread.deleted}
        action={{ label: de.thread.toFeed, onPress: () => router.navigate('/signale') }}
      />
    );
  } else if (!thread) {
    body = loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={refresh} /> : null;
  } else {
    body = (
      <View>
        {stale ? (
          <View style={styles.pad}>
            <StaleBanner onRetry={refresh} />
          </View>
        ) : null}

        <PostCard post={thread.post} demo={demo} showQuote={false} showThreadLink={false} absoluteTime />

        <Text variant="footnote" tone="tertiary" style={styles.label}>
          {de.trade.timeline}
          {timeline.length > 0 ? ` · ${de.trade.updates(timeline.length)}` : ''}
        </Text>
        <View
          style={styles.timeline}
          onLayout={(e) => {
            timelineTop.current = e.nativeEvent.layout.y;
            tryScroll();
          }}>
          {timeline.length === 0 ? (
            <Text variant="callout" tone="tertiary" style={styles.none}>
              {de.trade.noUpdates}
            </Text>
          ) : (
            timeline.map((p, i) => (
              <TimelineEntry
                key={p.id}
                post={p}
                root={thread.post}
                first={i === 0}
                last={i === timeline.length - 1}
                focused={p.id === focusId}
                fresh={Date.parse(p.createdAt) > openedAt}
                onFocusLayout={onFocusLayout}
              />
            ))
          )}
        </View>

        <View style={styles.pad}>
          <RiskNote />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scroller}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, { paddingHorizontal: frame.pad }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accentSoft} colors={[colors.accent]} />
      }>
      {body}
    </ScrollView>
  );
}

function TimelineEntry({
  post,
  root,
  first,
  last,
  focused,
  fresh,
  onFocusLayout,
}: {
  post: Post;
  root: Post;
  first: boolean;
  last: boolean;
  focused: boolean;
  fresh: boolean;
  onFocusLayout: (y: number) => void;
}) {
  const milestone = isMilestone(post.text);
  const [rootDate] = absoluteDateTime(root.createdAt).split(', ');
  const [date, time] = absoluteDateTime(post.createdAt).split(', ');
  const minutes = Math.round((Date.parse(post.createdAt) - Date.parse(root.createdAt)) / 60_000);
  // Answers another update (not the signal itself): say which, in one muted line.
  const nested = post.replyTo && post.replyTo !== root.id && post.replyPreview ? post.replyPreview.text : null;

  const content = (
    <View
      style={[styles.entry, focused && styles.entryFocused]}
      onLayout={focused ? (e) => onFocusLayout(e.nativeEvent.layout.y) : undefined}>
      <View style={styles.rail}>
        <View style={[styles.line, first && styles.lineHidden]} />
        <View style={[styles.node, milestone && styles.nodeMilestone, focused && styles.nodeFocused]} />
        <View style={[styles.line, styles.lineGrow, last && styles.lineHidden]} />
      </View>
      <View style={styles.entryBody}>
        <View style={styles.entryMeta}>
          <Text variant="mono" color={milestone ? colors.accentSoft : colors.textSecondary}>
            {date === rootDate ? time : `${date}, ${time}`}
          </Text>
          {minutes > 0 ? (
            <Text variant="mono" tone="tertiary">
              {`+${formatMinutes(minutes)}`}
            </Text>
          ) : null}
        </View>
        {nested ? (
          <Text variant="footnote" tone="tertiary" numberOfLines={1}>
            {`↳ ${nested.replace(/\s+/g, ' ')}`}
          </Text>
        ) : null}
        {post.text ? (
          <Text variant={milestone ? 'headline' : 'callout'} color={milestone ? colors.text : colors.textSecondary} selectable>
            {post.text}
          </Text>
        ) : null}
        <MediaGrid media={post.media} />
      </View>
    </View>
  );

  return fresh ? <Enter>{content}</Enter> : content;
}

const NODE = 10;

const styles = StyleSheet.create({
  content: {
    paddingBottom: contentBottomPad,
    flexGrow: 1,
  },
  pad: { paddingVertical: spacing.lg },
  label: { paddingHorizontal: spacing.xs, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  timeline: {},
  none: { paddingVertical: spacing.md },
  entry: { flexDirection: 'row', gap: spacing.md, paddingRight: spacing.md, borderRadius: radii.md },
  entryFocused: { backgroundColor: withAlpha(colors.accent, 0.08) },
  rail: { width: 22, alignItems: 'center' },
  line: { width: 1, height: spacing.md + 4, backgroundColor: colors.brass },
  lineGrow: { flex: 1, height: undefined },
  lineHidden: { backgroundColor: 'transparent' },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    borderWidth: 1,
    borderColor: colors.accentDeep,
    backgroundColor: colors.background,
  },
  nodeMilestone: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.7,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  nodeFocused: { transform: [{ scale: 1.35 }], borderColor: colors.accentSoft },
  entryBody: { flex: 1, gap: spacing.xs, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  entryMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
