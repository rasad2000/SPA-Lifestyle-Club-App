/**
 * Which glass rendering path this device gets — decided once per process, plus
 * a live "Reduce Transparency" override.
 *
 *  liquid → iOS 26 Liquid Glass (expo-glass-effect GlassView). Requires BOTH
 *           isLiquidGlassAvailable() (compiled with Xcode 26, OS ≥ 26, not opted
 *           out via UIDesignRequiresCompatibility) AND isGlassEffectAPIAvailable()
 *           (some iOS 26 betas lack the runtime API and crash without this check).
 *  blur   → expo-blur BlurView: iOS < 26 (UIVisualEffectView) and web (CSS
 *           backdrop-filter).
 *  tinted → Android: expo-blur only blurs there when the content behind is
 *           wrapped in a BlurTargetView, which doesn't fit native-stack screens;
 *           a dense translucent fill reads better than a fake blur.
 *  solid  → the user enabled Reduce Transparency: honour it with opaque panes.
 */
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export type GlassMode = 'liquid' | 'blur' | 'tinted' | 'solid';

function detectBaseMode(): Exclude<GlassMode, 'solid'> {
  if (Platform.OS === 'ios') {
    try {
      if (isLiquidGlassAvailable() && isGlassEffectAPIAvailable()) return 'liquid';
    } catch {
      // Native module missing (e.g. an old dev client) → fall through to blur.
    }
    return 'blur';
  }
  if (Platform.OS === 'web') return 'blur';
  return 'tinted';
}

const BASE_MODE = detectBaseMode();

export const hasLiquidGlass = BASE_MODE === 'liquid';

// Reduce Transparency as one module-level store: dozens of cards read it, but
// only one AccessibilityInfo listener exists.
let reduceTransparency = false;
const listeners = new Set<() => void>();
let subscribed = false;

function ensureSubscribed(): void {
  if (subscribed || Platform.OS === 'web') return;
  subscribed = true;
  const set = (v: boolean) => {
    if (v === reduceTransparency) return;
    reduceTransparency = v;
    listeners.forEach((fn) => fn());
  };
  AccessibilityInfo.isReduceTransparencyEnabled().then(set, () => {});
  AccessibilityInfo.addEventListener('reduceTransparencyChanged', set);
}

function subscribe(fn: () => void): () => void {
  ensureSubscribed();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const getReduce = () => reduceTransparency;

export function useGlassMode(): GlassMode {
  const reduce = useSyncExternalStore(subscribe, getReduce, getReduce);
  return reduce ? 'solid' : BASE_MODE;
}
