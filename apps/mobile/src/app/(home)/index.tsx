/**
 * Home (slide 1): the newsletter every visitor sees, guests included.
 * Hero → News (club posts, newest first) → the host's videos →
 * next live webinar → this week's sessions → next events → CTA → risk notice.
 *
 * The glasshouse hall is the app-wide background and a PICTURE FRAME: content stays inside
 * its pillars (`useFrame().pad`); carousels can be swiped into the pillars, where their
 * cards fade out (Carousel + EdgeFade). A news post or a video tile opens into a
 * full-screen page that grows out of the card and closes with a swipe down (Expander).
 * Content: src/content/home.ts.
 */
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Carousel } from '@/components/Carousel';
import { ExpandSource, Expander, type Rect } from '@/components/Expander';
import { RiskNote } from '@/components/feed/RiskNote';
import { ArticlePage } from '@/components/home/ArticlePage';
import { NewsPage } from '@/components/home/NewsPage';
import { VideoTile } from '@/components/home/VideoCard';
import { home, type HomeEvent, type HomeVideo, type NewsPost, type Session } from '@/content/home';
import { de } from '@/i18n/de';
import { Button } from '@/ui/Button';
import { useFrame } from '@/ui/frame';
import { Icon } from '@/ui/Icon';
import { SectionTitle } from '@/ui/SectionTitle';
import { TabEnter } from '@/ui/TabEnter';
import { Text } from '@/ui/Text';
import { MARK } from '@/ui/textures';
import { colors, contentBottomPad, gradient, radii, spacing } from '@/ui/theme';

const SHEEN = gradient(
  'linear-gradient(150deg, rgba(201,162,74,0.14) 0%, rgba(201,162,74,0.03) 40%, rgba(255,253,248,0) 65%)',
);

const dayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const monthFmt = new Intl.DateTimeFormat('de-DE', { month: 'short' });
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** Re-renders every 30 s so the countdown stays current. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

type Opened =
  | { kind: 'news'; id: string; post: NewsPost; rect: Rect }
  | { kind: 'video'; id: string; video: HomeVideo; rect: Rect };

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const frame = useFrame();
  const inner = frame.width - 2 * frame.pad;
  const [opened, setOpened] = useState<Opened | null>(null);

  return (
    <TabEnter tab="home">
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + (Platform.OS === 'web' ? spacing.xl : spacing.xxl) },
        ]}>
        <View style={[styles.hero, { paddingHorizontal: frame.pad }]}>
          <Image source={MARK} style={styles.mark} contentFit="contain" accessibilityLabel={de.home.brand} />
          <Text variant="hero" color={colors.text} style={styles.center}>
            {de.home.brand}
          </Text>
          <View style={styles.heroRule} />
          <Text variant="label" color={colors.accent} style={styles.tagline}>
            {de.home.tagline}
          </Text>
        </View>

        <Section title={de.home.news} pad={frame.pad}>
          <Carousel
            items={home.news}
            itemWidth={Math.round(inner * 0.62)}
            keyOf={(p) => p.id}
            render={(p) => (
              <ExpandSource
                hidden={opened?.id === p.id}
                accessibilityLabel={p.title}
                onOpen={(rect) => setOpened({ kind: 'news', id: p.id, post: p, rect })}>
                <NewsCard post={p} />
              </ExpandSource>
            )}
          />
        </Section>

        <Section title={de.home.videos} pad={frame.pad}>
          {/* 12 %+ smaller than the first pass, so the next card peeks from inside the frame. */}
          <Carousel
            items={home.videos}
            itemWidth={Math.round(inner * 0.72)}
            keyOf={(v) => v.id}
            render={(v) => (
              <ExpandSource
                hidden={opened?.id === v.id}
                accessibilityLabel={`${v.title}, ${v.subtitle}`}
                onOpen={(rect) => setOpened({ kind: 'video', id: v.id, video: v, rect })}>
                <VideoTile video={v} />
              </ExpandSource>
            )}
          />
        </Section>

        <View style={{ paddingHorizontal: frame.pad }}>
          <WebinarCard />
        </View>

        <Section title={de.home.sessions} pad={frame.pad}>
          <Carousel
            items={home.sessions}
            itemWidth={138}
            keyOf={(s) => String(s.weekday)}
            render={(s) => <SessionCard session={s} />}
          />
        </Section>

        <Section title={de.home.events} pad={frame.pad}>
          <View style={[styles.events, { marginHorizontal: frame.pad }]}>
            {home.events.map((e, i) => (
              <EventRow key={e.title} event={e} last={i === home.events.length - 1} />
            ))}
          </View>
        </Section>

        <View style={[styles.cta, { paddingHorizontal: frame.pad }]}>
          <Button label={de.home.start} trailingIcon="chevronRight" onPress={() => router.navigate('/mitglieder')} />
          <Button
            variant="secondary"
            icon="message"
            label={de.home.whatsapp}
            onPress={() => home.whatsappUrl && Linking.openURL(home.whatsappUrl).catch(() => {})}
            accessibilityHint={de.home.moreInfo}
          />
        </View>

        <View style={{ paddingHorizontal: frame.pad }}>
          <RiskNote />
        </View>
      </ScrollView>
      <Expander
        origin={opened?.rect ?? null}
        radius={radii.lg}
        onClosed={() => setOpened(null)}
        cover={opened?.kind === 'video' ? <VideoTile video={opened.video} style={styles.cover} /> : undefined}>
        {(stage) =>
          opened?.kind === 'news' ? (
            <NewsPage post={opened.post} stage={stage} />
          ) : opened?.kind === 'video' ? (
            <ArticlePage video={opened.video} stage={stage} />
          ) : null
        }
      </Expander>
    </TabEnter>
  );
}

function Section({ title, pad, children }: { title: string; pad: number; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionTitle style={{ paddingHorizontal: pad }}>{title}</SectionTitle>
      {children}
    </View>
  );
}

function NewsCard({ post }: { post: NewsPost }) {
  return (
    <View style={styles.news}>
      <Image source={post.image} contentFit="cover" style={styles.newsImage} />
    </View>
  );
}

function WebinarCard() {
  const now = useNow();
  const { startsAt, title, host } = home.webinar;
  const mins = Math.max(0, Math.round((startsAt.getTime() - now.getTime()) / 60_000));
  const live = mins === 0;
  const countdown = live
    ? de.home.webinarLive
    : de.home.webinarIn(Math.floor(mins / 1440), Math.floor((mins % 1440) / 60), mins % 60);
  return (
    <View style={styles.webinar}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, SHEEN]} />
      <View style={styles.webinarHead}>
        <View style={styles.liveDot} />
        <Text variant="label" color={colors.accentSoft}>
          {de.home.webinar}
        </Text>
      </View>
      <Text variant="title" style={styles.webinarTitle}>
        {title}
      </Text>
      <Text variant="footnote" tone="secondary">
        {`${dayFmt.format(startsAt)} · ${timeFmt.format(startsAt)} Uhr`}
      </Text>
      <Text variant="footnote" tone="tertiary">
        {host}
      </Text>
      <View style={styles.countdown}>
        <Icon name="clock" size={12} color={colors.accentSoft} />
        <Text variant="mono" color={colors.accentSoft}>
          {countdown}
        </Text>
      </View>
    </View>
  );
}

function SessionCard({ session }: { session: Session }) {
  const today = (new Date().getDay() || 7) === session.weekday;
  return (
    <View style={[styles.session, today && styles.sessionToday]}>
      <Text variant="label" color={today ? colors.accentSoft : colors.accent}>
        {WEEKDAYS[session.weekday % 7]}
      </Text>
      <Text variant="price" color={colors.text}>
        {session.time}
      </Text>
      <Text variant="subhead" numberOfLines={2}>
        {session.title}
      </Text>
      <Text variant="caption" tone="tertiary" numberOfLines={1}>
        {session.host}
      </Text>
    </View>
  );
}

function EventRow({ event, last }: { event: HomeEvent; last: boolean }) {
  return (
    <View style={[styles.event, !last && styles.eventDivider]}>
      <View style={styles.eventDate}>
        <Text variant="title" color={colors.accentSoft}>
          {event.date.getDate()}
        </Text>
        <Text variant="label" tone="tertiary">
          {monthFmt.format(event.date).replace('.', '')}
        </Text>
      </View>
      <View style={styles.eventBody}>
        <Text variant="headline">{event.title}</Text>
        <Text variant="footnote" tone="tertiary">
          {`${event.place} · ${timeFmt.format(event.date)} Uhr`}
        </Text>
      </View>
    </View>
  );
}

const GLASS = colors.glassCard;

const styles = StyleSheet.create({
  content: { paddingBottom: contentBottomPad, gap: spacing.xxxl },
  hero: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl, paddingBottom: spacing.lg },
  mark: { width: 150, height: 150 },
  center: { textAlign: 'center' },
  heroRule: { width: 40, height: 1, backgroundColor: colors.accent },
  tagline: { letterSpacing: 2, textAlign: 'center' },
  section: { gap: spacing.lg },
  news: {
    aspectRatio: 9 / 16,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
    backgroundColor: GLASS,
  },
  newsImage: { width: '100%', height: '100%' },
  cover: { flex: 1, aspectRatio: undefined },
  webinar: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    padding: spacing.xl,
    gap: spacing.xs + 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
    backgroundColor: GLASS,
  },
  webinarHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accentSoft },
  webinarTitle: { fontSize: 22, lineHeight: 28 },
  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
  },
  session: {
    gap: spacing.xs + 2,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: GLASS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    minHeight: 140,
  },
  sessionToday: { borderColor: colors.accent, borderWidth: 1 },
  events: {
    borderRadius: radii.lg,
    backgroundColor: GLASS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  event: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.lg },
  eventDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  eventDate: { width: 40, alignItems: 'center' },
  eventBody: { flex: 1, gap: 2 },
  cta: { gap: spacing.md },
});
