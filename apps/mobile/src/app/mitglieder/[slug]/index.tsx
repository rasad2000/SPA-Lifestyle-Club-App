/** Course detail: intro (level, serif title, progress) + CTA + numbered lesson list. */
import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { seenCount, useSeenLessons } from '@/api/progress';
import { canOpenLesson, useViewer } from '@/api/viewer';
import { CourseMeta, AccessChips, ProgressBar } from '@/components/courses/CourseCard';
import { useCourse } from '@/hooks/data';
import { de } from '@/i18n/de';
import { formatMinutes } from '@/lib/format';
import { Button } from '@/ui/Button';
import { Glass } from '@/ui/Glass';
import { useFrame } from '@/ui/frame';
import { Icon } from '@/ui/Icon';
import { LockBadge } from '@/ui/Locked';
import { ErrorState, LoadingState, StaleBanner } from '@/ui/States';
import { Text } from '@/ui/Text';
import { colors, contentBottomPad, radii, spacing } from '@/ui/theme';

export default function CourseScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { course, loading, error, refresh, refreshing, stale } = useCourse(
    typeof slug === 'string' ? slug : undefined,
  );
  const seenMap = useSeenLessons();
  const totalMin = course?.lessons.reduce((sum, l) => sum + (l.durationMin ?? 0), 0) ?? 0;
  const seenList = course ? (seenMap[course.slug] ?? []) : [];
  const lessonSlugs = course?.lessons.map((l) => l.slug) ?? [];
  const seen = seenCount(seenList, lessonSlugs);
  // Members-only lessons stay listed but locked for a viewer without access (previews open).
  const who = useViewer();
  const frame = useFrame();
  const openable = (l: { preview?: boolean }) => (course ? canOpenLesson(who, course.area, course.access, l.preview) : false);
  // CTA: first OPENABLE lesson not yet opened; all opened → start over.
  const nextIndex = course ? course.lessons.findIndex((l) => openable(l) && !seenList.includes(l.slug)) : -1;
  const ctaIndex = nextIndex >= 0 ? nextIndex : 0;
  const ctaLabel = seen === 0 ? de.courses.start : nextIndex >= 0 ? de.courses.resume(nextIndex + 1) : de.courses.again;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, { paddingHorizontal: frame.pad }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accentSoft} colors={[colors.accent]} />
      }>
      <Stack.Screen options={{ title: course?.title ?? '' }} />
      {!course ? (
        loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={refresh} />
        ) : null
      ) : (
        <View style={styles.stack}>
          {stale ? <StaleBanner onRetry={refresh} /> : null}
          <Glass layer="content" radius={radii.lg} style={styles.intro}>
            <AccessChips course={course} />
            <Text variant="display">{course.title}</Text>
            {course.subtitle ? (
              <Text variant="callout" tone="secondary">
                {course.subtitle}
              </Text>
            ) : null}
            <CourseMeta course={{ ...course, lessonCount: course.lessons.length, totalMin }} />
            {course.lessons.length > 0 ? (
              <>
                <ProgressBar seen={seen} total={course.lessons.length} />
                <Button
                  label={ctaLabel}
                  icon="play2"
                  style={styles.cta}
                  onPress={() =>
                    router.push({
                      pathname: '/mitglieder/[slug]/[lesson]',
                      params: { slug: course.slug, lesson: course.lessons[ctaIndex].slug },
                    })
                  }
                />
              </>
            ) : null}
          </Glass>

          <Text variant="label" tone="tertiary" style={styles.listLabel}>
            {de.courses.modules}
            {`  ·  ${course.lessons.length}`}
          </Text>
          <View style={styles.list}>
            {course.lessons.map((lesson, i) => {
              const done = seenList.includes(lesson.slug);
              if (!openable(lesson)) {
                return (
                  <Glass key={lesson.slug} layer="content" radius={radii.md} style={[styles.row, styles.locked]}>
                    <View style={styles.num}>
                      <Icon name="lock" size={12} color={colors.textTertiary} />
                    </View>
                    <View style={styles.rowBody}>
                      <Text variant="headline" numberOfLines={2} tone="secondary">
                        {lesson.title}
                      </Text>
                      {/* Tags sit under the title: beside it they squeeze it in the framed column. */}
                      <View style={styles.meta}>
                        {lesson.durationMin ? (
                          <Text variant="mono" tone="tertiary">
                            {formatMinutes(lesson.durationMin)}
                          </Text>
                        ) : null}
                        <LockBadge />
                      </View>
                    </View>
                  </Glass>
                );
              }
              const isPreview = lesson.preview && course.access === 'member' && !openable({});
              return (
                <Link
                  key={lesson.slug}
                  href={{ pathname: '/mitglieder/[slug]/[lesson]', params: { slug: course.slug, lesson: lesson.slug } }}
                  asChild>
                  <Pressable accessibilityRole="link" accessibilityHint={done ? de.courses.seen : undefined}>
                    {({ pressed }) => (
                      <Glass layer="content" radius={radii.md} style={[styles.row, pressed && styles.pressed]}>
                        <View style={[styles.num, done && styles.numDone]}>
                          <Text variant="mono" color={done ? colors.onAccent : colors.accentSoft}>
                            {String(i + 1).padStart(2, '0')}
                          </Text>
                        </View>
                        <View style={styles.rowBody}>
                          <Text variant="headline" numberOfLines={2}>
                            {lesson.title}
                          </Text>
                          <View style={styles.meta}>
                            {lesson.durationMin ? (
                              <Text variant="mono" tone="tertiary">
                                {formatMinutes(lesson.durationMin)}
                                {done ? `  ·  ${de.courses.seen}` : ''}
                              </Text>
                            ) : null}
                            {isPreview ? (
                              <Text variant="label" color={colors.accentSoft} style={styles.previewTag}>
                                {de.members.preview}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        <Icon name="chevronRight" size={13} color={colors.accentDeep} />
                      </Glass>
                    )}
                  </Pressable>
                </Link>
              );
            })}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: spacing.lg,
    paddingBottom: contentBottomPad,
    flexGrow: 1,
  },
  stack: { gap: spacing.lg },
  intro: { padding: spacing.lg, gap: spacing.md },
  cta: { marginTop: spacing.xs },
  listLabel: { paddingHorizontal: spacing.xs, marginBottom: -spacing.sm },
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  pressed: { transform: [{ scale: 0.985 }] },
  num: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  rowBody: { flex: 1, gap: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  locked: { opacity: 0.55 },
  previewTag: { fontSize: 9, letterSpacing: 1.2 },
});
