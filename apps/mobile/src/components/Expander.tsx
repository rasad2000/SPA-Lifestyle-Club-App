/**
 * Opens a card into a full-screen page the way iOS opens an app: the page grows out of the
 * card's own rectangle (rounded corners easing to square), and swiping DOWN shrinks it
 * back, following the finger like closing an app, until it lands in the card again.
 *
 * The page is laid out once at full-screen size and SCALED (uniform "cover" fit) into a
 * clip window that animates from the card's rect to the screen, so its content never
 * reflows mid-flight. `cover` (optional) is the card's own look, cross-faded away at the
 * start, for pages that don't look like their card (an article vs. its tile).
 *
 * Gestures: a downward Pan (react-native-gesture-handler) on the page. Pages with their
 * own scroll view wrap it in <GestureDetector gesture={stage.scroll}> and feed
 * `stage.scrollY`, so the pan only closes when the page is scrolled to the top.
 * Respects "reduce motion" (a plain fade).
 */
import { useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, type ViewInstance } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { de } from '@/i18n/de';
import { Icon } from '@/ui/Icon';
import { spacing } from '@/ui/theme';

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * A pressable card that reports its window rect on press (where the page grows from).
 * `hidden` blanks the card while its page is open, like an app icon while the app is open.
 */
export function ExpandSource({
  onOpen,
  hidden = false,
  accessibilityLabel,
  children,
}: {
  onOpen: (rect: Rect) => void;
  hidden?: boolean;
  accessibilityLabel: string;
  children: ReactNode;
}) {
  const ref = useRef<ViewInstance>(null);
  const open = () => ref.current?.measureInWindow((x, y, width, height) => onOpen({ x, y, width, height }));
  return (
    <Pressable
      ref={ref}
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [hidden && styles.hidden, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

export type Stage = {
  /** Wrap the page's own scroll view in a GestureDetector with this. */
  scroll: ReturnType<typeof Gesture.Native>;
  /** The page's vertical scroll offset (set it from its scroll handler). */
  scrollY: SharedValue<number>;
  close: () => void;
};

const OPEN = { duration: 520, dampingRatio: 0.86 };
const SHUT = { duration: 420, dampingRatio: 1 };
/** Drag distance / fling speed that commits a close. */
const CLOSE_DRAG = 110;
const CLOSE_VELOCITY = 900;

export function Expander({
  origin,
  radius,
  onClosed,
  cover,
  children,
}: {
  /** The tapped card's rect in window coordinates; null = closed. */
  origin: Rect | null;
  radius: number;
  onClosed: () => void;
  cover?: ReactNode;
  children: (stage: Stage) => ReactNode;
}) {
  // Android back closes with the same animation as the X.
  const closeRef = useRef<(() => void) | null>(null);
  return (
    <Modal
      visible={origin != null}
      transparent
      animationType="none"
      statusBarTranslucent
      supportedOrientations={['portrait']}
      onRequestClose={() => closeRef.current?.()}>
      {origin ? (
        <StageView origin={origin} radius={radius} onClosed={onClosed} cover={cover} closeRef={closeRef}>
          {children}
        </StageView>
      ) : null}
    </Modal>
  );
}

function StageView({
  origin,
  radius,
  onClosed,
  cover,
  closeRef,
  children,
}: {
  origin: Rect;
  radius: number;
  onClosed: () => void;
  cover?: ReactNode;
  closeRef: RefObject<(() => void) | null>;
  children: (stage: Stage) => ReactNode;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const from = reduce ? { x: 0, y: 0, width: W, height: H } : origin;
  const r0 = reduce ? 0 : radius;

  const p = useSharedValue(0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const armed = useSharedValue(false);

  useEffect(() => {
    p.set(withSpring(1, OPEN));
  }, [p]);

  const close = useCallback(() => {
    'worklet';
    dragX.set(withSpring(0, SHUT));
    dragY.set(withSpring(0, SHUT));
    p.set(
      withSpring(0, SHUT, (finished) => {
        if (finished) scheduleOnRN(onClosed);
      }),
    );
  }, [dragX, dragY, p, onClosed]);
  useEffect(() => {
    closeRef.current = close;
    return () => {
      closeRef.current = null;
    };
  }, [close, closeRef]);

  const scroll = useMemo(() => Gesture.Native(), []);
  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Downward only; a sideways swipe belongs to the page (e.g. the news text).
        .activeOffsetY(14)
        .failOffsetX([-14, 14])
        .simultaneousWithExternalGesture(scroll)
        .onBegin(() => {
          armed.set(scrollY.get() <= 1);
        })
        .onUpdate((e) => {
          if (!armed.get()) return;
          dragX.set(e.translationX);
          dragY.set(Math.max(0, e.translationY));
        })
        .onEnd((e) => {
          if (!armed.get()) return;
          if (dragY.get() > CLOSE_DRAG || e.velocityY > CLOSE_VELOCITY) close();
          else {
            dragX.set(withSpring(0, OPEN));
            dragY.set(withSpring(0, OPEN));
          }
        }),
    [scroll, armed, scrollY, dragX, dragY, close],
  );

  // The clip window: card rect → screen, then shrunk and carried by the drag.
  const clip = useAnimatedStyle(() => {
    const t = p.get();
    const w = from.width + (W - from.width) * t;
    const h = from.height + (H - from.height) * t;
    const d = Math.min(dragY.get() / H, 1);
    return {
      left: from.x * (1 - t),
      top: from.y * (1 - t),
      width: w,
      height: h,
      opacity: reduce ? t : 1,
      borderRadius: r0 * (1 - Math.min(t, 1)) + interpolate(d, [0, 0.12], [0, 34], Extrapolation.CLAMP),
      transform: [{ translateX: dragX.get() * 0.7 }, { translateY: dragY.get() * 0.8 }, { scale: 1 - d * 0.6 }],
    };
  });
  // The full-screen page, uniformly scaled to cover the clip window, centred in it.
  const page = useAnimatedStyle(() => {
    const t = p.get();
    const w = from.width + (W - from.width) * t;
    const h = from.height + (H - from.height) * t;
    const s = Math.max(w / W, h / H);
    return { transform: [{ translateX: (w - W) / 2 }, { translateY: (h - H) / 2 }, { scale: s }] };
  });
  const coverStyle = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0, 0.35], [1, 0], Extrapolation.CLAMP),
  }));
  const backdrop = useAnimatedStyle(() => ({
    opacity: 0.7 * Math.min(p.get(), 1) * (1 - Math.min(dragY.get() / (H * 0.5), 1)),
  }));
  const chrome = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0.6, 1], [0, 1], Extrapolation.CLAMP) * (1 - Math.min(dragY.get() / 40, 1)),
  }));

  const stage: Stage = { scroll, scrollY, close };

  return (
    <GestureHandlerRootView style={styles.root}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]} />
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.clip, clip]}>
          <Animated.View style={[{ width: W, height: H }, page]}>{children(stage)}</Animated.View>
          {cover ? (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, coverStyle]}>
              {cover}
            </Animated.View>
          ) : null}
        </Animated.View>
      </GestureDetector>
      <Animated.View style={[styles.close, { top: insets.top + spacing.md }, chrome]}>
        <Pressable
          onPress={() => close()}
          accessibilityRole="button"
          accessibilityLabel={de.home.close}
          hitSlop={12}
          style={styles.closeBtn}>
          <Icon name="close" size={16} color="#F7F3EC" />
        </Pressable>
      </Animated.View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hidden: { opacity: 0 },
  pressed: { opacity: 0.85 },
  backdrop: { backgroundColor: '#000' },
  clip: { position: 'absolute', overflow: 'hidden', backgroundColor: '#000' },
  close: { position: 'absolute', right: spacing.lg },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
});
