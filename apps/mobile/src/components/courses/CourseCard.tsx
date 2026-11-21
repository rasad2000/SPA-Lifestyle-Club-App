/**
 * Course tile: bronze side bar, level chip, Didone title, subtitle, mono meta line and
 * the on-device progress bar. For a viewer without access (`open={false}`) it stays
 * tappable (the preview lessons are open) but says what is locked instead of progress.
 */
import type { CourseSummary } from '@spa/contract';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { seenCount, useSeenLessons } from '@/api/progress';
import { de } from '@/i18n/de';
import { formatMinutes } from '@/lib/format';
import { Glass } from '@/ui/Glass';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

export function CourseMeta({
  course,
}: {
  course: Pick<CourseSummary, 'level' | 'access'> & { lessonCount: number; totalMin: number };
}) {
  return (
    <View style={styles.metaRow}>
      <Text variant="mono" tone="tertiary">
        {de.courses.lessons(course.lessonCount)}
        {course.totalMin > 0 ? `  ·  ${formatMinutes(course.totalMin)}` : ''}
      </Text>
    </View>
  );
}

/** Clearance only (who may open it); the difficulty level is not shown (user, 2026-10-15). */
export function AccessChips({ course }: { course: Pick<CourseSummary, 'access'> }) {
  if (course.access !== 'member') return null;
  return (
    <View style={styles.chips}>
      <Chip label={de.courses.members} />
    </View>
  );
}

export function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text variant="label" color={colors.accentSoft} style={styles.chipText}>
        {label}
      </Text>
    </View>
  );
}

export function ProgressBar({ seen, total }: { seen: number; total: number }) {
  const pct = total > 0 ? Math.min(1, seen / total) : 0;
  return (
    <View style={styles.progress} accessibilityLabel={de.courses.progress(seen, total)}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%` }]} />
      </View>
      <Text variant="mono" tone={seen > 0 ? 'accent' : 'tertiary'}>
        {de.courses.progress(seen, total)}
      </Text>
    </View>
  );
}

/** "1 Vorschau · 3 gesperrt": what a non-member can open, and what membership adds. */
function PreviewLine({ previews, locked }: { previews: number; locked: number }) {
  return (
    <View style={styles.previewLine}>
      {previews > 0 ? (
        <Text variant="mono" color={colors.accentSoft}>
          {de.courses.previews(previews)}
        </Text>
      ) : null}
      <Icon name="lock" size={11} color={colors.textTertiary} />
      <Text variant="mono" tone="tertiary">
        {de.courses.lockedCount(locked)}
      </Text>
    </View>
  );
}

export function CourseCard({ course, open = true }: { course: CourseSummary; open?: boolean }) {
  const seenMap = useSeenLessons();
  const seen = seenCount(
    seenMap[course.slug],
    course.lessons.map((l) => l.slug),
  );
  return (
    <Link href={{ pathname: '/mitglieder/[slug]', params: { slug: course.slug } }} asChild>
      <Pressable accessibilityRole="link">
        {({ pressed }) => (
          <Glass layer="content" radius={radii.lg} style={[styles.card, pressed && styles.pressed]}>
            <View style={styles.spine}>
              <View style={styles.spineDot} />
              <View style={styles.bar} />
              <View style={styles.spineDot} />
            </View>
            <View style={styles.body}>
              <AccessChips course={course} />
              <Text variant="title">{course.title}</Text>
              {course.subtitle ? (
                <Text variant="footnote" tone="secondary" numberOfLines={3}>
                  {course.subtitle}
                </Text>
              ) : null}
              <CourseMeta course={course} />
              {!open ? (
                <PreviewLine
                  previews={course.lessons.filter((l) => l.preview).length}
                  locked={course.lessons.filter((l) => !l.preview).length}
                />
              ) : course.lessonCount > 0 ? (
                <ProgressBar seen={seen} total={course.lessonCount} />
              ) : null}
            </View>
            <Icon name="chevronRight" size={16} color={colors.accentSoft} />
          </Glass>
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surfaceSolid,
    borderColor: 'rgba(176, 138, 53, 0.25)',
  },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.85 },
  spine: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: 6,
    paddingVertical: 2,
  },
  spineDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accentSoft,
  },
  bar: {
    flex: 1,
    width: 2,
    marginVertical: 4,
    borderRadius: 1,
    backgroundColor: colors.accent,
    opacity: 0.8,
  },
  body: { flex: 1, gap: spacing.sm },
  previewLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  chip: {
    borderWidth: 1,
    borderColor: 'rgba(176, 138, 53, 0.35)',
    backgroundColor: colors.accentGlow,
    borderRadius: radii.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  chipText: { fontSize: 10, letterSpacing: 1.2 },
  progress: { gap: spacing.xs + 2, marginTop: 2 },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceSunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(176, 138, 53, 0.2)',
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accentSoft,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 3,
  },
});
