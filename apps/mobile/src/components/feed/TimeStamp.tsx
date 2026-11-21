/**
 * Relative German time ("vor 5 Min."); long-press (or tap) toggles the absolute
 * Berlin time. Re-renders once a minute so "gerade eben" doesn't go stale.
 */
import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';

import { absoluteDateTime, relativeTime } from '@/lib/format';
import { Text } from '@/ui/Text';

function useMinuteTick(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function TimeStamp({ iso, absolute = false }: { iso: string; absolute?: boolean }) {
  const now = useMinuteTick();
  const [showAbsolute, setShowAbsolute] = useState(absolute);
  const label = showAbsolute ? absoluteDateTime(iso) : relativeTime(iso, now);
  return (
    <Pressable
      onPress={() => setShowAbsolute((v) => !v)}
      onLongPress={() => setShowAbsolute((v) => !v)}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={absoluteDateTime(iso)}>
      <Text variant="mono" tone="tertiary">
        {label}
      </Text>
    </Pressable>
  );
}
