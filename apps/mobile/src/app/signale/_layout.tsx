import { Stack } from 'expo-router';

import { de } from '@/i18n/de';
import { detailScreenOptions, stackScreenOptions } from '@/ui/stack-options';

// A deep link straight to a detail screen (web URL, notification) still gets the
// list underneath it, so "back" works instead of stranding the reader.
export const unstable_settings = { anchor: 'index' };

export default function SignaleLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      {/* The title lives inside the hall's frame (ScreenTitle), not on the left pillar. */}
      <Stack.Screen name="index" options={{ title: de.feed.title, headerShown: false }} />
      <Stack.Screen name="post/[id]" options={{ ...detailScreenOptions, title: de.thread.title }} />
    </Stack>
  );
}
