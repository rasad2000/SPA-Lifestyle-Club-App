/**
 * Cross-platform icon: SF Symbols on iOS, Material Symbols on Android + web
 * (expo-symbols renders both; a bare string would render on iOS only).
 */
import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { colors } from './theme';

type SymbolName = ComponentProps<typeof SymbolView>['name'];
type CrossName = Exclude<SymbolName, string>;

/** Icon registry: one semantic name → per-platform glyphs. */
export const ICONS = {
  reply: { ios: 'arrowshape.turn.up.left.fill', android: 'reply', web: 'reply' },
  thread: { ios: 'bubble.left.and.bubble.right', android: 'forum', web: 'forum' },
  photo: { ios: 'photo', android: 'image', web: 'image' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  arrowUp: { ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  chevronDown: { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' },
  chevronUp: { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' },
  clock: { ios: 'clock', android: 'schedule', web: 'schedule' },
  book: { ios: 'book.closed', android: 'menu_book', web: 'menu_book' },
  play: { ios: 'play.rectangle', android: 'smart_display', web: 'smart_display' },
  warning: { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' },
  info: { ios: 'info.circle.fill', android: 'info', web: 'info' },
  success: { ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' },
  offline: { ios: 'wifi.slash', android: 'wifi_off', web: 'wifi_off' },
  retry: { ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' },
  person: { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' },
  pencil: { ios: 'pencil', android: 'edit', web: 'edit' },
  inbox: { ios: 'tray', android: 'inbox', web: 'inbox' },
  server: { ios: 'server.rack', android: 'dns', web: 'dns' },
  shield: { ios: 'exclamationmark.shield', android: 'shield', web: 'shield' },
  sparkles: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  document: { ios: 'doc.text', android: 'description', web: 'description' },
  link: { ios: 'link', android: 'link', web: 'link' },
  external: { ios: 'arrow.up.right.square', android: 'open_in_new', web: 'open_in_new' },
  unknown: { ios: 'questionmark.square.dashed', android: 'help_center', web: 'help_center' },
  signals: { ios: 'waveform.path.ecg', android: 'monitoring', web: 'monitoring' },
  lock: { ios: 'lock.fill', android: 'lock', web: 'lock' },
  check: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  send: { ios: 'paperplane.fill', android: 'send', web: 'send' },
  target: { ios: 'scope', android: 'track_changes', web: 'track_changes' },
  shieldCheck: { ios: 'checkmark.shield', android: 'verified_user', web: 'verified_user' },
  arrowUpRight: { ios: 'arrow.up.right', android: 'north_east', web: 'north_east' },
  play2: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' },
  stopSign: { ios: 'xmark.octagon', android: 'block', web: 'block' },
  member: { ios: 'person.text.rectangle', android: 'badge', web: 'badge' },
  stop: { ios: 'stop.fill', android: 'stop', web: 'stop' },
  home: { ios: 'house', android: 'home', web: 'home' },
  leaf: { ios: 'leaf', android: 'spa', web: 'spa' },
  calendar: { ios: 'calendar', android: 'event', web: 'event' },
  quote: { ios: 'quote.opening', android: 'format_quote', web: 'format_quote' },
  tools: { ios: 'wrench.and.screwdriver', android: 'build', web: 'build' },
  copytrade: { ios: 'square.on.square', android: 'content_copy', web: 'content_copy' },
  live: { ios: 'dot.radiowaves.left.and.right', android: 'sensors', web: 'sensors' },
  community: { ios: 'person.3', android: 'groups', web: 'groups' },
  academy: { ios: 'graduationcap', android: 'school', web: 'school' },
  message: { ios: 'bubble.left.and.text.bubble.right', android: 'chat', web: 'chat' },
  video: { ios: 'play.rectangle.fill', android: 'smart_display', web: 'smart_display' },
} as const satisfies Record<string, CrossName>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 18,
  color = colors.textSecondary,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
}) {
  return <SymbolView name={ICONS[name] as CrossName} size={size} tintColor={color} />;
}
