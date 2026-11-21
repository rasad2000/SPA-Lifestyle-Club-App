import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import {
  BodoniModa_400Regular,
  BodoniModa_400Regular_Italic,
  BodoniModa_500Medium,
} from '@expo-google-fonts/bodoni-moda';
import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import { ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { live } from '@/api/live';
import AppTabs from '@/components/AppTabs';
import { BACKGROUND } from '@/ui/textures';
import { BACKGROUND_SCRIM, colors, gradient, navigationTheme } from '@/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // Bundled with the app (no network). A load error is not fatal: RN falls back to the
  // system font, so the UI still renders — just without the editorial type.
  const [fontsLoaded, fontError] = useFonts({
    BodoniModa_400Regular,
    BodoniModa_400Regular_Italic,
    BodoniModa_500Medium,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });
  const ready = fontsLoaded || fontError != null;

  useEffect(() => {
    // One shared live socket for the app's lifetime; it handles background/foreground itself.
    live.start();
    return () => live.stop();
  }, []);

  useEffect(() => {
    // Content comes from the offline cache synchronously (or shows a loading state), so
    // fonts are the only thing worth holding the splash for.
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    // The full-screen background sits BEHIND the whole navigator (outside every screen,
    // see theme.ts backdropStyle); every navigation layer above it is transparent.
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="dark" />
      <View style={styles.root}>
        <Image
          source={BACKGROUND}
          contentFit="cover"
          contentPosition="bottom"
          style={StyleSheet.absoluteFill}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, SCRIM]} />
        {Platform.OS === 'android' ? <TabBarFloor /> : null}
        <AppTabs />
      </View>
    </ThemeProvider>
  );
}

const SCRIM = gradient(BACKGROUND_SCRIM);

/** Material bottom navigation height (M3, dp). */
const ANDROID_TAB_BAR = 80;
const FLOOR_FADE = 28;

/**
 * Android: the dark floor under the (transparent) native tab bar, fading up into the
 * hall, so the bar reads on the marble without the tabs container hiding it.
 */
function TabBarFloor() {
  const { bottom } = useSafeAreaInsets();
  const height = ANDROID_TAB_BAR + bottom + FLOOR_FADE;
  const fade = (FLOOR_FADE / height) * 100;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.floor,
        { height },
        gradient(
          `linear-gradient(180deg, rgba(247,242,232,0) 0%, ${colors.background} ${fade}%, ${colors.background} 100%)`,
        ),
      ]}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  floor: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
