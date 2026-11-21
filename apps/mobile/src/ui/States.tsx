/** Loading / error / empty / stale states, all German, all non-crashing. */
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { ApiFailure } from '@/api/client';
import { de } from '@/i18n/de';

import { Glass } from './Glass';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { colors, radii, spacing } from './theme';

export function errorMessage(error: ApiFailure): string {
  switch (error.kind) {
    case 'network':
      return de.errors.network;
    case 'http':
      return de.errors.http(error.status ?? 0);
    case 'schema':
      return de.errors.schema;
    case 'notFound':
      return de.errors.notFound;
    case 'config':
      return de.errors.config;
  }
}

export function LoadingState({ label = de.common.loading }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accentSoft} />
      <Text variant="footnote" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

export function MessageState({
  icon,
  title,
  message,
  onRetry,
  action,
}: {
  icon: IconName;
  title?: string;
  message: string;
  onRetry?: () => void;
  /** A way out other than retrying (e.g. "Zum Feed" for a deleted post). */
  action?: { label: string; icon?: IconName; onPress: () => void };
}) {
  return (
    <View style={styles.center}>
      <Glass style={styles.card}>
        <Icon name={icon} size={28} color={colors.accentSoft} />
        {title ? (
          <Text variant="headline" style={styles.textCenter}>
            {title}
          </Text>
        ) : null}
        <Text variant="callout" tone="secondary" style={styles.textCenter}>
          {message}
        </Text>
        {onRetry ? <RetryButton onPress={onRetry} /> : null}
        {action ? <ActionButton label={action.label} icon={action.icon ?? 'chevronRight'} onPress={action.onPress} /> : null}
      </Glass>
    </View>
  );
}

/** Only a transport/server failure can succeed on retry; a 404 or a contract mismatch won't. */
export const isRetryable = (error: ApiFailure) => error.kind === 'network' || error.kind === 'http';

export function ErrorState({ error, onRetry }: { error: ApiFailure; onRetry?: () => void }) {
  return (
    <MessageState
      icon={error.kind === 'network' ? 'offline' : 'warning'}
      title={de.errors.title}
      message={errorMessage(error)}
      onRetry={isRetryable(error) ? onRetry : undefined}
    />
  );
}

export function EmptyState({ message }: { message: string }) {
  return <MessageState icon="inbox" message={message} />;
}

export function RetryButton({ onPress }: { onPress: () => void }) {
  return <ActionButton label={de.common.retry} icon="retry" onPress={onPress} />;
}

export function ActionButton({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8}>
      {({ pressed }) => (
        <Glass
          interactive
          tint={colors.accent}
          tintStrength="strong"
          radius={radii.pill}
          style={[styles.retry, pressed && styles.pressed]}>
          <Icon name={icon} size={14} color={colors.text} />
          <Text variant="subhead">{label}</Text>
        </Glass>
      )}
    </Pressable>
  );
}

/** Thin banner shown above content that came from the offline cache. */
export function StaleBanner({ onRetry }: { onRetry?: () => void }) {
  return (
    <Pressable onPress={onRetry} accessibilityRole="button">
      <Glass radius={radii.md} tint={colors.warning} style={styles.banner}>
        <Icon name="offline" size={14} color={colors.warning} />
        <Text variant="footnote" tone="secondary" style={styles.flex}>
          {de.common.offlineCached}
        </Text>
        {onRetry ? <Icon name="retry" size={14} color={colors.textSecondary} /> : null}
      </Glass>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
    minHeight: 260,
  },
  card: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
    maxWidth: 420,
    width: '100%',
  },
  textCenter: { textAlign: 'center' },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  pressed: { transform: [{ scale: 0.97 }] },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  flex: { flex: 1 },
});
