import { Stack } from 'expo-router';

import { de } from '@/i18n/de';
import { stackScreenOptions } from '@/ui/stack-options';

/** Home is full-bleed: the hero runs under the status bar, so no navigation header. */
export default function HomeLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: de.home.title, headerShown: false }} />
    </Stack>
  );
}
