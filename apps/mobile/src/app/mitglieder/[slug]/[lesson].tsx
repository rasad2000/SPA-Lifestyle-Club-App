/**
 * Lesson: all blocks, then a link to the next lesson — or, on the last one, back
 * to the course overview. Opening a lesson marks it "angesehen" on this device
 * (api/progress.ts); nothing claims the course was "completed" — the reader may
 * have jumped straight to the end.
 */
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { progress } from '@/api/progress';
import { canOpenLesson, useViewer } from '@/api/viewer';
import { LessonBlocks } from '@/components/courses/LessonBlocks';
import { useCourse } from '@/hooks/data';
import { de } from '@/i18n/de';
import { formatMinutes } from '@/lib/format';
import { Glass } from '@/ui/Glass';
import { useFrame } from '@/ui/frame';
import { Icon } from '@/ui/Icon';
import { LockBadge } from '@/ui/Locked';
import { ErrorState, LoadingState, MessageState } from '@/ui/States';
import { headerOverlapsContent } from '@/ui/stack-options';
import { Text } from '@/ui/Text';
import { colors, contentBottomPad, radii, spacing } from '@/ui/theme';

export default function LessonScreen() {
  const params = useLocalSearchParams<{ slug: string; lesson: string }>();
  const slug = typeof params.slug === 'string' ? params.slug : undefined;
  const { course, loading, error, refresh } = useCourse(slug);
  const index = course?.lessons.findIndex((l) => l.slug === params.lesson) ?? -1;
  const lesson = index >= 0 ? course!.lessons[index] : null;
  const next = course && index >= 0 ? (course.lessons[index + 1] ?? null) : null;
  const accent = colors.accent;
  // Members-only lessons are locked for a viewer without access (previews stay open).
  const who = useViewer();
  const frame = useFrame();
  const canOpen = (l: { preview?: boolean } | null) => (course && l ? canOpenLesson(who, course.area, course.access, l.preview) : false);
  const lessonOpen = canOpen(lesson);
  const nextOpen = canOpen(next);
  const courseSlug = course?.slug;
  const lessonSlug = lessonOpen ? lesson?.slug : undefined;

  useEffect(() => {
    if (courseSlug && lessonSlug) progress.markSeen(courseSlug, lessonSlug);
  }, [courseSlug, lessonSlug]);

  // Reading progress: a hairline at the bottom edge that fills as the lesson scrolls.
  // With a transparent header (iOS) the scroll offset starts at -headerHeight.
  const headerHeight = useHeaderHeight();
  const top = headerOverlapsContent ? headerHeight : 0;
  const read = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    const max = e.contentSize.height - e.layoutMeasurement.height + top;
    read.value = max > 1 ? Math.min(1, Math.max(0, (e.contentOffset.y + top) / max)) : 0;
  });
  const readStyle = useAnimatedStyle(() => ({ width: `${read.value * 100}%` }));

  let body;
  if (!course) {
    body = loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={refresh} /> : null;
  } else if (!lesson) {
    body = <MessageState icon="warning" message={de.courses.lessonNotFound} />;
  } else if (!lessonOpen) {
    body = <MessageState icon="lock" title={lesson.title} message={de.courses.lessonLocked} />;
  } else {
    body = (
      <View style={styles.stack}>
        <View style={styles.head}>
          <Text variant="label" color={colors.accentSoft}>
            {`${de.courses.lesson} ${String(index + 1).padStart(2, '0')} / ${String(course.lessons.length).padStart(2, '0')}`}
          </Text>
          <Text variant="largeTitle" style={styles.title}>
            {lesson.title}
          </Text>
          {lesson.durationMin ? (
            <View style={styles.duration}>
              <Icon name="clock" size={12} color={colors.textTertiary} />
              <Text variant="mono" tone="tertiary">
                {formatMinutes(lesson.durationMin)}
              </Text>
            </View>
          ) : null}
        </View>

        <LessonBlocks blocks={lesson.blocks} />

        {next && !nextOpen ? (
          <Glass layer="content" radius={radii.lg} style={[styles.next, styles.nextLocked]}>
            <View style={styles.flex}>
              <Text variant="label" tone="tertiary">
                {de.courses.next}
              </Text>
              <Text variant="headline" tone="secondary">
                {next.title}
              </Text>
            </View>
            <LockBadge />
          </Glass>
        ) : next ? (
          <Link
            href={{ pathname: '/mitglieder/[slug]/[lesson]', params: { slug: course.slug, lesson: next.slug } }}
            asChild>
            <Pressable accessibilityRole="link">
              <Glass interactive tint={accent} tintStrength="strong" radius={radii.lg} style={styles.next}>
                <View style={styles.flex}>
                  <Text variant="label" tone="accent">
                    {de.courses.next}
                  </Text>
                  <Text variant="headline">{next.title}</Text>
                </View>
                <Icon name="chevronRight" size={16} color={colors.accentSoft} />
              </Glass>
            </Pressable>
          </Link>
        ) : (
          <View style={styles.end}>
            <View style={styles.endNote}>
              <Icon name="book" size={16} color={colors.textSecondary} />
              <Text variant="callout" tone="secondary">
                {de.courses.lastLesson}
              </Text>
            </View>
            <Link href={{ pathname: '/mitglieder/[slug]', params: { slug: course.slug } }} asChild>
              <Pressable accessibilityRole="link">
                <Glass interactive tint={accent} radius={radii.lg} style={styles.next}>
                  <Text variant="headline" style={styles.flex}>
                    {de.courses.toOverview}
                  </Text>
                  <Icon name="chevronRight" size={16} color={colors.text} />
                </Glass>
              </Pressable>
            </Link>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen} collapsable={false}>
      <Animated.ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingHorizontal: frame.pad }]}
        onScroll={onScroll}
        scrollEventThrottle={16}>
        <Stack.Screen options={{ title: lesson?.title ?? '' }} />
        {body}
      </Animated.ScrollView>
      {lesson ? (
        <View pointerEvents="none" style={styles.readTrack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Animated.View style={[styles.readFill, readStyle]} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  readTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, backgroundColor: 'rgba(176, 138, 53, 0.12)' },
  readFill: { height: 2, backgroundColor: colors.accent },
  content: {
    paddingVertical: spacing.lg,
    paddingBottom: contentBottomPad,
    flexGrow: 1,
  },
  stack: { gap: spacing.xl },
  head: { gap: spacing.xs },
  title: { marginTop: 2 },
  duration: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  next: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  flex: { flex: 1, gap: 2 },
  nextLocked: { opacity: 0.6 },
  end: { gap: spacing.md },
  endNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'center', paddingTop: spacing.sm },
});
