/**
 * Web build: react-native-webview has no web implementation, and a browser can
 * host the provider's player directly — a plain <iframe> (same ToS rule: the
 * provider's own player, never an extracted stream).
 */
import { StyleSheet, View } from 'react-native';

import { colors, radii } from '@/ui/theme';

export function EmbedPlayer({ playerUrl, title }: { playerUrl: string; title: string }) {
  return (
    <View style={styles.frame}>
      <iframe
        src={playerUrl}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ border: 0, width: '100%', height: '100%' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSolid,
  },
});
