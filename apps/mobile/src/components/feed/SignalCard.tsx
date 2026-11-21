/**
 * Structured signal body: the pair with a bold, solid direction badge ("▼ SELL NOW",
 * "▲ BUY LIMIT" — trading terms stay English, as the community uses them), an
 * Entry box beside a Stop Loss box, Take Profit tiles (reached ones lit gold), and
 * the trade's latest milestone (`signal.progress`, e.g. "TP3 HIT").
 *
 * Every price is a COPY target: one tap puts the exact producer string on the
 * clipboard (haptic tick + "Kopiert" in the label). Prices are deliberately NOT
 * text-selectable — a long-press selection would fight the tap and could grab half a
 * number. Prices are rendered verbatim (contract: strings, never re-formatted); pips
 * are the desk's stated figure and labelled as such.
 *
 * Large accessibility text: above STACK_FONT_SCALE the entry/stop boxes stack and
 * TP tiles go two-up, and prices wrap instead of auto-shrinking.
 */
import type { SignalLevels, SignalProgress } from '@spa/contract';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import {
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { de } from '@/i18n/de';
import { formatTimeframe, isHighRisk, orderTypeOf } from '@/lib/format';
import { tradeState } from '@/lib/trade';
import { Icon, type IconName } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, fonts, radii, spacing, withAlpha } from '@/ui/theme';

const STATUS_COLOR: Record<NonNullable<SignalLevels['status']>, string> = {
  active: colors.buy,
  inactive: colors.textTertiary,
  invalid: colors.warning,
  closed: colors.info,
};

export function directionStyle(direction: SignalLevels['direction']) {
  if (direction === 'buy') return { label: de.signal.buy, color: colors.buy, bg: colors.buySoft, arrow: '▲' };
  if (direction === 'sell') return { label: de.signal.sell, color: colors.sell, bg: colors.sellSoft, arrow: '▼' };
  return { label: de.signal.neutral, color: colors.chrome, bg: colors.goldWash, arrow: '' };
}

const STACK_FONT_SCALE = 1.35;
/** Tiny uppercase labels; past this they'd outgrow even the stacked layout. */
const LABEL_MAX_SCALE = 1.6;
const COPIED_MS = 1200;
/** Values are copy targets, never text selections (web needs the explicit CSS). */
const noSelect: TextStyle = { userSelect: 'none' };

/** One "copied" slot per card: the last tapped value's key flashes "Kopiert". */
function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);
  const copy = useCallback((key: string, value: string) => {
    Clipboard.setStringAsync(value).catch(() => {});
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    setCopied(key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), COPIED_MS);
  }, []);
  return { copied, copy };
}

function CopyTarget({
  value,
  onCopy,
  children,
  style,
}: {
  value: string;
  onCopy: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onCopy}
      accessibilityRole="button"
      accessibilityLabel={value}
      accessibilityHint={de.signal.copyHint}
      hitSlop={4}
      style={({ pressed }) => [style, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

export function SignalBody({
  signal,
  demo = false,
}: {
  signal: SignalLevels;
  /** Kept for call-site compatibility; cards use the theme gold, not channel colours. */
  accent?: string;
  /** Static snapshot channel: the status is frozen at capture → shown neutral + labelled. */
  demo?: boolean;
}) {
  const dir = directionStyle(signal.direction);
  const [notesOpen, setNotesOpen] = useState(false);
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > STACK_FONT_SCALE;
  const { copied, copy } = useCopy();
  const order = orderTypeOf(signal.directionLabel, signal.direction != null);
  const orderKind = order && 'kind' in order ? de.signal.orderType[order.kind] : null;
  const orderRaw = order && 'raw' in order ? order.raw : null;
  const highRisk = isHighRisk(signal.directionLabel);
  const statusColor = signal.status ? (demo ? colors.textSecondary : STATUS_COLOR[signal.status]) : null;
  const reachedTp = signal.progress?.tp ?? 0;
  const state = tradeState(signal);
  const finished = state === 'won' || state === 'stopped' || state === 'closed';
  const stop = signal.stop;

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text variant="pair" style={styles.pair}>
          {signal.pair}
        </Text>
        {/* A finished trade's badge goes grey and states the result instead of the order. */}
        <View style={[styles.badge, { backgroundColor: finished ? colors.surfaceRaised : dir.color }, finished && styles.badgeDone]}>
          <Text style={[styles.badgeText, finished && styles.badgeTextDone]}>
            {dir.arrow ? `${dir.arrow} ` : ''}
            {dir.label}
            {finished ? ` · ${de.trade.state[state]}` : orderKind ? ` ${orderKind}` : ''}
          </Text>
        </View>
      </View>

      {highRisk || orderRaw || signal.timeframe || (signal.status && statusColor) ? (
        <View style={styles.tags}>
          {highRisk ? (
            <View style={[styles.tag, styles.riskTag]}>
              <Icon name="warning" size={10} color={colors.warning} />
              <Text variant="label" color={colors.warning} style={styles.tagText}>
                {de.signal.highRisk}
              </Text>
            </View>
          ) : null}
          {orderRaw ? (
            <View style={styles.tag}>
              <Text variant="label" tone="secondary" style={styles.tagText}>
                {orderRaw}
              </Text>
            </View>
          ) : null}
          {signal.timeframe ? (
            <View style={styles.tf}>
              <Icon name="clock" size={11} color={colors.textTertiary} />
              <Text variant="caption" tone="tertiary">
                {formatTimeframe(signal.timeframe)}
              </Text>
            </View>
          ) : null}
          {signal.status && statusColor ? (
            <View style={styles.status}>
              {demo ? null : <View style={[styles.statusDot, { backgroundColor: statusColor }]} />}
              <Text variant="caption" color={statusColor}>
                {demo ? de.signal.statusAtCapture(de.signal.status[signal.status]) : de.signal.status[signal.status]}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.boxes, stacked && styles.boxesStacked]}>
        <EntryBox signal={signal} stacked={stacked} copied={copied} copy={copy} />
        {stop ? (
          <CopyTarget value={stop} onCopy={() => copy('sl', stop)} style={[styles.box, styles.stopBox]}>
            <BoxLabel text={copied === 'sl' ? de.signal.copied : de.signal.stop} icon="shield" copied={copied === 'sl'} color={colors.sell} />
            <Text variant="priceLarge" color={colors.sell} selectable={false} style={noSelect} numberOfLines={stacked ? undefined : 1}>
              {stop}
            </Text>
          </CopyTarget>
        ) : (
          <View style={[styles.box, styles.stopBox]}>
            <BoxLabel text={de.signal.stop} icon="shield" color={colors.sell} />
            <Text variant="priceLarge" tone="tertiary">
              {de.signal.none}
            </Text>
          </View>
        )}
      </View>

      {signal.targets.length > 0 ? (
        <View style={styles.targets}>
          <Text variant="label" tone="tertiary" maxFontSizeMultiplier={LABEL_MAX_SCALE}>
            {de.signal.targets}
          </Text>
          <View style={styles.tiles}>
            {signal.targets.map((v, i) => {
              const reached = i + 1 <= reachedTp;
              const key = `tp${i}`;
              const isCopied = copied === key;
              return (
                <CopyTarget
                  key={`${i}-${v}`}
                  value={v}
                  onCopy={() => copy(key, v)}
                  style={[styles.tile, stacked && styles.tileStacked, reached && styles.tileReached, isCopied && styles.copiedTile]}>
                  <ReachFlash reached={reached} />
                  <View style={styles.tileHead}>
                    <Text variant="mono" color={isCopied || reached ? colors.accentSoft : colors.textTertiary} style={noSelect}>
                      {isCopied ? de.signal.copied : de.signal.target(i + 1)}
                    </Text>
                    {reached && !isCopied ? <Icon name="check" size={11} color={colors.accentSoft} /> : null}
                  </View>
                  <Text
                    variant="price"
                    color={reached ? colors.accentSoft : colors.text}
                    selectable={false}
                    style={noSelect}
                    numberOfLines={stacked ? undefined : 1}>
                    {v}
                  </Text>
                </CopyTarget>
              );
            })}
          </View>
        </View>
      ) : null}

      {signal.progress ? <ProgressLine progress={signal.progress} /> : null}

      {signal.author ? (
        <View style={styles.author}>
          <Icon name="person" size={13} color={colors.textTertiary} />
          <Text variant="caption" tone="tertiary">
            {de.signal.author(signal.author)}
          </Text>
        </View>
      ) : null}

      {signal.notes ? (
        <View style={styles.notes}>
          <Pressable
            onPress={() => setNotesOpen((v) => !v)}
            style={styles.notesHead}
            accessibilityRole="button"
            accessibilityState={{ expanded: notesOpen }}>
            <Text variant="label" tone="accent">
              {de.signal.notes}
            </Text>
            <Icon name={notesOpen ? 'chevronUp' : 'chevronDown'} size={12} color={colors.accentSoft} />
          </Pressable>
          <Text variant="callout" tone="secondary" numberOfLines={notesOpen ? undefined : 2}>
            {signal.notes}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** A tile that becomes reached while on screen (a live TP hit) flashes gold once. */
function ReachFlash({ reached }: { reached: boolean }) {
  const was = useRef(reached);
  const flash = useSharedValue(0);
  useEffect(() => {
    if (reached && !was.current) {
      flash.set(withSequence(withTiming(1, { duration: 160 }), withTiming(0, { duration: 1400 })));
    }
    was.current = reached;
  }, [reached, flash]);
  const style = useAnimatedStyle(() => ({ opacity: flash.get() }));
  return <Animated.View pointerEvents="none" style={[styles.flash, style]} />;
}

function BoxLabel({
  text,
  icon,
  color = colors.textTertiary,
  copied = false,
}: {
  text: string;
  icon?: IconName;
  color?: string;
  copied?: boolean;
}) {
  return (
    <View style={styles.boxLabelRow}>
      {icon ? <Icon name={icon} size={11} color={copied ? colors.accentSoft : color} /> : null}
      <Text variant="label" color={copied ? colors.accentSoft : color} maxFontSizeMultiplier={LABEL_MAX_SCALE} style={noSelect}>
        {text}
      </Text>
    </View>
  );
}

/** Entry: a single price (whole box copies it), a zone (low + "bis high", each its own copy target), or Market. */
function EntryBox({
  signal,
  stacked,
  copied,
  copy,
}: {
  signal: SignalLevels;
  stacked: boolean;
  copied: string | null;
  copy: (key: string, value: string) => void;
}) {
  const entries = signal.entries;
  const zones = entries.map((e) => /^\s*([\d.,]+)\s*[-–]\s*([\d.,]+)\s*$/.exec(e));
  const anyZone = zones.some(Boolean);
  const anyCopied = copied?.startsWith('entry') ?? false;
  const title = anyCopied ? de.signal.copied : anyZone ? de.signal.entryZone : de.signal.entry;

  if (entries.length === 1 && !zones[0]) {
    return (
      <CopyTarget value={entries[0]} onCopy={() => copy('entry0', entries[0])} style={[styles.box, styles.entryBox]}>
        <BoxLabel text={title} icon="target" copied={anyCopied} />
        <Text variant="priceLarge" selectable={false} style={noSelect} numberOfLines={stacked ? undefined : 1}>
          {entries[0]}
        </Text>
      </CopyTarget>
    );
  }
  return (
    <View style={[styles.box, styles.entryBox]}>
      <BoxLabel text={title} icon="target" copied={anyCopied} />
      {entries.length === 0 ? (
        <Text variant="priceLarge" tone="secondary">
          {de.signal.entryMarket}
        </Text>
      ) : (
        entries.map((v, i) => {
          const zone = zones[i];
          if (!zone) {
            return (
              <CopyTarget key={`${i}-${v}`} value={v} onCopy={() => copy(`entry${i}`, v)}>
                <Text variant="priceLarge" selectable={false} style={noSelect} numberOfLines={stacked ? undefined : 1}>
                  {v}
                </Text>
              </CopyTarget>
            );
          }
          // A zone can't fit one large line in half a card → low end large, "bis <high>" below.
          return (
            <View key={`${i}-${v}`}>
              <CopyTarget value={zone[1]} onCopy={() => copy(`entry${i}lo`, zone[1])}>
                <Text variant="priceLarge" selectable={false} style={noSelect} numberOfLines={stacked ? undefined : 1}>
                  {zone[1]}
                </Text>
              </CopyTarget>
              <CopyTarget value={zone[2]} onCopy={() => copy(`entry${i}hi`, zone[2])}>
                <Text variant="mono" tone="tertiary" selectable={false} style={noSelect}>
                  {de.signal.zoneTo(zone[2])}
                </Text>
              </CopyTarget>
            </View>
          );
        })
      )}
    </View>
  );
}

const PROGRESS_LOOK: Record<SignalProgress['kind'], { icon: IconName; color: string }> = {
  tp: { icon: 'check', color: colors.accentSoft },
  breakeven: { icon: 'shieldCheck', color: colors.accentSoft },
  sl: { icon: 'stopSign', color: colors.sell },
  closed: { icon: 'check', color: colors.chrome },
};

export function progressTitle(p: SignalProgress): string {
  if (p.kind === 'tp' && p.tp) return de.signal.progress.tp(p.tp);
  if (p.kind === 'closed' && p.tp) return de.signal.progress.closedAfterTp(p.tp);
  if (p.kind === 'tp') return de.signal.progress.closed;
  return de.signal.progress[p.kind];
}

function ProgressLine({ progress }: { progress: SignalProgress }) {
  const look = PROGRESS_LOOK[progress.kind];
  return (
    <View style={styles.progressRibbon}>
      <View style={styles.progressHead}>
        <Icon name={look.icon} size={15} color={look.color} />
        <Text style={[styles.progressTitle, { color: look.color }]}>{progressTitle(progress)}</Text>
      </View>
      {progress.pips ? (
        <View style={styles.pipsBadge}>
          <Text
            variant="mono"
            style={[styles.pipsValue, { color: look.color }]}
            accessibilityLabel={`${de.signal.progress.pips(progress.pips)}, ${de.signal.progress.pipsSource}`}>
            {de.signal.progress.pips(progress.pips)}
          </Text>
          <Text variant="mono" tone="tertiary" style={styles.pipsSource}>
            {de.signal.progress.pipsSource}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' },
  pair: { flexShrink: 1 },
  badge: {
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  badgeText: { fontFamily: fonts.sansBold, fontSize: 17, lineHeight: 20, letterSpacing: 0.8, color: colors.onAccent },
  badgeDone: { borderColor: colors.hairlineStrong, shadowOpacity: 0, elevation: 0 },
  badgeTextDone: { color: colors.textSecondary, fontSize: 14 },
  flash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radii.sm, backgroundColor: 'rgba(201, 162, 74, 0.35)' },
  tags: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: -spacing.xs },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
    borderRadius: radii.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  riskTag: { borderColor: withAlpha(colors.warning, 0.5), backgroundColor: withAlpha(colors.warning, 0.08) },
  tagText: { fontSize: 10 },
  tf: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  boxes: { flexDirection: 'row', gap: spacing.sm },
  boxesStacked: { flexDirection: 'column' },
  box: {
    flex: 1,
    gap: spacing.xs + 2,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  boxLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  entryBox: {
    backgroundColor: colors.surfaceRaised,
    borderColor: 'rgba(176, 138, 53, 0.22)',
  },
  stopBox: {
    backgroundColor: colors.sellSoft,
    borderColor: colors.lossStroke,
  },
  pressed: { opacity: 0.6 },
  targets: { gap: spacing.sm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // Fixed widths (no grow): a 4th/5th TP wraps to a tile of the same size, not a full-width bar.
  tile: {
    flexBasis: '31%',
    flexGrow: 0,
    gap: 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(176, 138, 53, 0.16)',
    backgroundColor: colors.surfaceRaised,
  },
  tileStacked: { flexBasis: '47%' },
  tileReached: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(176, 138, 53, 0.12)',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  copiedTile: { borderColor: colors.accentSoft },
  tileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  progressRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(176, 138, 53, 0.22)',
    backgroundColor: colors.surfaceRaised,
    position: 'relative',
    overflow: 'hidden',
  },
  progressHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  progressTitle: { fontFamily: fonts.sansBold, fontSize: 15, letterSpacing: 0.6 },
  pipsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.goldWash,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(176, 138, 53, 0.2)',
  },
  pipsValue: { fontSize: 13, fontFamily: fonts.monoMedium },
  pipsSource: { fontSize: 10 },
  author: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  notes: { gap: spacing.xs },
  notesHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start' },
});
