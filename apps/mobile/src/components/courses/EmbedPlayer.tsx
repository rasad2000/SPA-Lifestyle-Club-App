/**
 * Third-party video (YouTube / Vimeo / an https embed) in the PROVIDER'S OWN
 * player, inside a WebView — their ToS forbid extracting streams, and their
 * player handles consent, ads and quality itself.
 *
 * The player is loaded via an <iframe> in a tiny HTML page with an https baseUrl
 * rather than as the WebView's top-level URL: YouTube refuses embeds that arrive
 * without a referrer/origin (player error 153), which a bare top-level load in a
 * native WebView doesn't send.
 */
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { colors, radii } from '@/ui/theme';

/** Origin the embed page claims (only used as the iframe's referrer). */
const EMBED_ORIGIN = 'https://app.spa.invalid';

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function EmbedPlayer({ playerUrl, title }: { playerUrl: string; title: string }) {
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style></head>
<body><iframe src="${escapeAttr(playerUrl)}" title="${escapeAttr(title)}"
allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen
referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>`;
  return (
    <View style={styles.frame}>
      <WebView
        source={{ html, baseUrl: EMBED_ORIGIN }}
        style={styles.web}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction
        // Taps on links inside the player (e.g. "watch on YouTube") stay in the embed
        // page's own navigation; nothing else is loaded.
        originWhitelist={['https://*']}
        javaScriptEnabled
        scrollEnabled={false}
        accessibilityLabel={title}
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
  web: { flex: 1, backgroundColor: '#000' },
});
