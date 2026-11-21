/**
 * Signale: a sticky channel tab bar + the selected channel's feed, newest first,
 * with infinite scroll, pull-to-refresh, live inserts and a "N neue Beiträge" pill
 * when posts arrive while the reader is scrolled down. No explanatory copy: the
 * risk line closes the feed (and every thread), the rest speaks through the UI.
 */
import type { Post } from '@spa/contract';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cache } from '@/api/cache';
import { useDemo } from '@/api/demo';
import { DemoButton } from '@/components/DemoButton';
import { ChannelSwitcher } from '@/components/feed/ChannelSwitcher';
import { NewPostsPill } from '@/components/feed/NewPostsPill';
import { PostCard } from '@/components/feed/PostCard';
import { ViewToggle, type FeedView } from '@/components/feed/ViewToggle';
import { RiskNote } from '@/components/feed/RiskNote';
import { LiveIndicator } from '@/components/LiveIndicator';
import { useChannels } from '@/hooks/data';
import { useChannelFeed } from '@/hooks/use-channel-feed';
import { de } from '@/i18n/de';
import { useFrame } from '@/ui/frame';
import { ScreenTitle } from '@/ui/ScreenTitle';
import { EmptyState, ErrorState, LoadingState, StaleBanner } from '@/ui/States';
import { TabEnter } from '@/ui/TabEnter';
import { colors, contentBottomPad, spacing } from '@/ui/theme';

/** Within this many px of the top, the reader "sees" new posts (no pill). */
const TOP_SLOP = 80;

export default function FeedScreen() {
  const channelsRes = useChannels();
  const { channels } = channelsRes;
  const [selected, setSelected] = useState<string | null>(() => cache.selectedChannel.get());
  // Presenter demo: show only what the run posts (everything older is hidden, not
  // deleted), on the run's channel, so the sequence lands into an empty feed.
  const presenter = useDemo();
  const demoChannel = presenter.phase === 'running' ? presenter.channel : null;
  const channel = channels.find((c) => c.id === (demoChannel ?? selected)) ?? channels[0] ?? null;
  const channelId = channel?.id ?? null;
  const accent = channel?.accent ?? colors.accent;
  const demo = channel?.demo ?? false;

  // "Trades" (default): signal cards that track their own updates; "Alle": every post.
  const [view, setView] = useState<FeedView>(() => cache.feedView.get());
  const changeView = useCallback((v: FeedView) => {
    setView(v);
    cache.feedView.set(v);
  }, []);
  const feed = useChannelFeed(channelId, view === 'trades');
  const { markSeen, unseen } = feed;

  const demoSince = presenter.phase === 'running' && presenter.channel === channelId ? Date.parse(presenter.since) : null;
  const posts = useMemo(
    () => (demoSince == null ? feed.posts : feed.posts.filter((p) => Date.parse(p.createdAt) >= demoSince - 1000)),
    [feed.posts, demoSince],
  );

  const insets = useSafeAreaInsets();
  const frame = useFrame();
  const listRef = useRef<FlatList<Post>>(null);
  const [atTop, setAtTop] = useState(true);
  // The tab bar is the list's sticky header; once rows run under it, it gets a backing.
  const [stuck, setStuck] = useState(false);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const nearTop = y < TOP_SLOP;
      setAtTop((prev) => (prev === nearTop ? prev : nearTop));
      const isStuck = y > 2;
      setStuck((prev) => (prev === isStuck ? prev : isStuck));
    },
    [],
  );

  // At the top, new posts are visible as they land — nothing to announce.
  useEffect(() => {
    if (atTop && unseen > 0) markSeen();
  }, [atTop, unseen, markSeen]);

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    markSeen();
  }, [markSeen]);

  useEffect(() => {
    if (demoChannel) listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [demoChannel]);

  const selectChannel = useCallback((id: string) => {
    setSelected(id);
    cache.selectedChannel.set(id);
  }, []);

  const fresh = feed.fresh;
  const renderItem = useCallback(
    ({ item }: { item: Post }) => <PostCard post={item} demo={demo} fresh={fresh.includes(item.id)} />,
    [demo, fresh],
  );

  const header = (
    <View style={[styles.sticky, { paddingTop: insets.top }, stuck && styles.stickyStuck]}>
      <ScreenTitle>{de.feed.title}</ScreenTitle>
      {/* One channel needs no switcher. */}
      {channels.length > 1 ? (
        <ChannelSwitcher channels={channels} selected={channelId} onSelect={selectChannel} stuck={stuck} />
      ) : null}
      <View style={styles.toggleRow}>
        <ViewToggle value={view} onChange={changeView} />
        {/* Beside the toggle, not the title: "Beenden" + Live would squeeze the title. */}
        <View style={styles.status}>
          <DemoButton />
          <LiveIndicator />
        </View>
      </View>
      {feed.stale || (channelsRes.stale && !feed.error) ? (
        <View style={styles.banner}>
          <StaleBanner onRetry={feed.refresh} />
        </View>
      ) : null}
    </View>
  );

  let empty: ReactElement;
  if (!channelId) {
    empty = channelsRes.loading ? (
      <LoadingState />
    ) : channelsRes.error ? (
      <ErrorState error={channelsRes.error} onRetry={channelsRes.refresh} />
    ) : (
      <EmptyState message={de.feed.noChannels} />
    );
  } else if (feed.loading) {
    empty = <LoadingState />;
  } else if (feed.error) {
    empty = <ErrorState error={feed.error} onRetry={feed.refresh} />;
  } else if (demoSince != null) {
    empty = <LoadingState label={de.demo.waiting} />;
  } else {
    empty = <EmptyState message={de.feed.empty} />;
  }

  const footer = feed.loadingMore ? (
    <ActivityIndicator style={styles.footer} color={colors.accentSoft} />
  ) : posts.length > 0 ? (
    <View style={styles.end}>
      <RiskNote />
    </View>
  ) : null;

  return (
    // collapsable={false}: the FlatList must stay the first native descendant so the
    // iOS large title collapses with it; the pill overlays as a sibling.
    <TabEnter tab="signale">
      <View style={styles.flex} collapsable={false}>
        <FlatList
          ref={listRef}
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[styles.content, { paddingHorizontal: frame.pad }]}
          ListHeaderComponent={header}
          stickyHeaderIndices={[0]}
          ListEmptyComponent={empty}
          ListFooterComponent={footer ?? undefined}
          // During the demo the hidden history must not page in behind the scenes.
          onEndReached={demoSince == null ? feed.loadMore : undefined}
          onEndReachedThreshold={0.6}
          onScroll={onScroll}
          scrollEventThrottle={64}
          // Keep the reader's place when live posts insert above them; at the top
          // the new post should simply appear.
          maintainVisibleContentPosition={atTop ? undefined : { minIndexForVisible: 0 }}
          refreshControl={
            <RefreshControl
              refreshing={feed.refreshing}
              onRefresh={() => {
                feed.refresh();
                channelsRes.refresh();
              }}
              tintColor={colors.accentSoft}
              colors={[colors.accent]}
              progressBackgroundColor={colors.surfaceSolid}
            />
          }
          removeClippedSubviews={false}
          initialNumToRender={6}
          windowSize={9}
        />
        <NewPostsPill
          count={atTop ? 0 : unseen}
          top={insets.top + 96}
          accent={accent}
          onPress={scrollToTop}
        />
      </View>
    </TabEnter>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingBottom: contentBottomPad,
    flexGrow: 1,
  },
  banner: { paddingVertical: spacing.sm },
  // Inside the frame like the cards; once rows run under it, it gets a backing that
  // ends in a soft edge instead of a hard bar line.
  sticky: { gap: spacing.xs },
  stickyStuck: { backgroundColor: colors.glassStrong, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm + 2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footer: { paddingVertical: spacing.xl },
  end: { alignItems: 'center', paddingVertical: spacing.xl },
});
