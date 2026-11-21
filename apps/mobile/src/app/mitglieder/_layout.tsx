import { Stack } from 'expo-router';

import { de } from '@/i18n/de';
import { detailScreenOptions, stackScreenOptions } from '@/ui/stack-options';

// A deep link straight to a detail screen (web URL, notification) still gets the
// list underneath it, so "back" works instead of stranding the reader.
export const unstable_settings = { anchor: 'index' };

export default function MitgliederLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      {/* The title lives inside the hall's frame (ScreenTitle), not on the left pillar. */}
      <Stack.Screen name="index" options={{ title: de.members.title, headerShown: false }} />
      {/* Titles are set by the screens once the course has loaded. */}
      <Stack.Screen name="[slug]/index" options={{ title: '' }} />
      <Stack.Screen name="[slug]/[lesson]" options={{ ...detailScreenOptions, title: '' }} />
    </Stack>
  );
}
