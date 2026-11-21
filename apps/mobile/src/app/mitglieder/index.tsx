/**
 * Mitglieder (slide 2): the members area, split into SPA Garden Club and the Orangerie
 * Everything stays VISIBLE: what the viewer can't open
 * is greyed and marked "Gesperrt" (the teaser that sells membership); courses keep
 * their preview lessons open to everyone.
 *
 * No login/IB check yet: the viewer is a demo state (api/viewer.ts). On a server with
 * `demoControls` the presenter "Ansicht" switch previews Gast / Club / Orangerie.
 * Layout content: src/content/members.ts; courses: server (`course.area`).
 */
import type { CourseSummary } from '@spa/contract';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { canAccess, useViewer, viewer, type Area, type Viewer } from '@/api/viewer';
import { CourseCard } from '@/components/courses/CourseCard';
import { VideoCard } from '@/components/home/VideoCard';
import { members, type MemberLink, type MemberTool } from '@/content/members';
import { useCourses, useHealth } from '@/hooks/data';
import { de } from '@/i18n/de';
import { useFrame } from '@/ui/frame';
import { Icon } from '@/ui/Icon';
import { Locked, LockBadge } from '@/ui/Locked';
import { ScreenTitle } from '@/ui/ScreenTitle';
import { SectionTitle } from '@/ui/SectionTitle';
import { Segmented } from '@/ui/Segmented';
import { ErrorState, LoadingState, StaleBanner } from '@/ui/States';
import { TabEnter } from '@/ui/TabEnter';
import { Text } from '@/ui/Text';
import { colors, contentBottomPad, gradient, radii, spacing } from '@/ui/theme';

const AREAS = [
  { value: 'club', label: de.members.areas.club },
  { value: 'orangerie', label: de.members.areas.orangerie },
] as const;
const VIEWERS = [
  { value: 'prospect', label: de.members.viewer.prospect },
  { value: 'club', label: de.members.viewer.club },
  { value: 'orangerie', label: de.members.viewer.orangerie },
] as const;
const SHEEN = gradient('linear-gradient(150deg, rgba(201,162,74,0.14) 0%, rgba(201,162,74,0.03) 40%, rgba(255,253,248,0) 65%)');

export default function MembersScreen() {
  const { courses, loading, error, refresh, refreshing, stale } = useCourses();
  const { health } = useHealth();
  const who = useViewer();
  const [area, setArea] = useState<Area>('club');
  const open = canAccess(who, area);
  const areaCourses = courses.filter((c) => (c.area ?? 'club') === area);
  const insets = useSafeAreaInsets();
  const frame = useFrame();
  // The sticky header only gets a backing once content runs under it.
  const [stuck, setStuck] = useState(false);

  return (
    <TabEnter tab="mitglieder">
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.content, { paddingHorizontal: frame.pad }]}
        stickyHeaderIndices={[0]}
        onScroll={(e) => {
          const isStuck = e.nativeEvent.contentOffset.y > 2;
          setStuck((prev) => (prev === isStuck ? prev : isStuck));
        }}
        scrollEventThrottle={64}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accentSoft} colors={[colors.accent]} />
        }>
        <View style={[styles.sticky, { paddingTop: insets.top }, stuck && styles.stickyStuck]}>
          <ScreenTitle>{de.members.title}</ScreenTitle>
          <Segmented options={AREAS} value={area} onChange={setArea} label={de.members.areasLabel} />
          {health?.demoControls ? (
            <View style={styles.viewerRow}>
              <Text variant="label" tone="tertiary">
                {de.members.viewAs}
              </Text>
              <Segmented
                size="small"
                options={VIEWERS}
                value={who}
                onChange={(v: Viewer) => viewer.set(v)}
                label={de.members.viewAs}
              />
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          {stale ? <StaleBanner onRetry={refresh} /> : null}
          <AreaBanner area={area} open={open} />

          <Section title={de.members.courses}>
            {areaCourses.length === 0 ? (
              loading ? (
                <LoadingState />
              ) : error ? (
                <ErrorState error={error} onRetry={refresh} />
              ) : null
            ) : (
              areaCourses.map((c: CourseSummary) => <CourseCard key={c.slug} course={c} open={open} />)
            )}
          </Section>

          {area === 'club' ? (
            <>
              <Section title={de.members.tools}>
                <View style={styles.list}>
                  {members.club.tools.map((t, i) => (
                    <ToolRow key={t.title} tool={t} locked={!open} last={i === members.club.tools.length - 1} />
                  ))}
                </View>
              </Section>
              {who !== 'orangerie' ? <VideoCard video={members.club.noOrangerie} /> : null}
            </>
          ) : (
            <>
              <Locked locked={!open}>
                <VideoCard video={members.orangerie.firstSteps} />
              </Locked>
              <Section title={de.members.links}>
                <View style={styles.list}>
                  {members.orangerie.links.map((l, i) => (
                    <LinkRow key={l.title} link={l} locked={!open} last={i === members.orangerie.links.length - 1} />
                  ))}
                </View>
              </Section>
            </>
          )}
        </View>
      </ScrollView>
    </TabEnter>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </View>
  );
}

/** Header card of the selected area: its name and whether it is open. Type only, no texture. */
function AreaBanner({ area, open }: { area: Area; open: boolean }) {
  return (
    <View style={styles.banner}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, SHEEN]} />
      <Text variant="hero" style={styles.bannerTitle}>
        {de.members.areas[area]}
      </Text>
      {open ? (
        <View style={styles.openRow}>
          <Icon name="check" size={13} color={colors.accentSoft} />
          <Text variant="caption" color={colors.accentSoft}>
            {de.members.open}
          </Text>
        </View>
      ) : (
        <LockBadge />
      )}
    </View>
  );
}

function ToolRow({ tool, locked, last }: { tool: MemberTool; locked: boolean; last: boolean }) {
  return (
    <Locked locked={locked}>
      <View style={[styles.row, !last && styles.rowDivider]}>
        <View style={styles.rowIcon}>
          <Icon name={tool.icon} size={16} color={colors.accentSoft} />
        </View>
        <View style={styles.rowBody}>
          <Text variant="headline">{tool.title}</Text>
          <Text variant="footnote" tone="tertiary">
            {tool.subtitle}
          </Text>
        </View>
      </View>
    </Locked>
  );
}

function LinkRow({ link, locked, last }: { link: MemberLink; locked: boolean; last: boolean }) {
  const ready = Boolean(link.url) && !locked;
  return (
    <Locked locked={locked}>
      <Pressable
        disabled={!ready}
        onPress={() => link.url && WebBrowser.openBrowserAsync(link.url).catch(() => {})}
        accessibilityRole="link"
        style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.pressed]}>
        <View style={styles.rowIcon}>
          <Icon name={link.icon} size={16} color={colors.accentSoft} />
        </View>
        <View style={styles.rowBody}>
          <Text variant="headline">{link.title}</Text>
          <Text variant="footnote" tone="tertiary">
            {link.subtitle}
          </Text>
        </View>
        <Icon name="external" size={13} color={colors.accentDeep} />
      </Pressable>
    </Locked>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: contentBottomPad },
  // Inside the frame like the content; a backing with a soft edge once content runs under it.
  sticky: { paddingBottom: spacing.sm + 2, gap: spacing.md },
  stickyStuck: { backgroundColor: colors.glassStrong, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  viewerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  body: { paddingTop: spacing.lg, gap: spacing.xxxl },
  section: { gap: spacing.lg },
  banner: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    padding: spacing.xl,
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.glassCard,
  },
  bannerTitle: { fontSize: 22, lineHeight: 28, letterSpacing: 4 },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  list: {
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceSolid,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
  },
  rowBody: { flex: 1, gap: 2 },
  pressed: { backgroundColor: colors.surfaceRaised },
});
