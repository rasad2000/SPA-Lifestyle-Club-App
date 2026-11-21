/**
 * The one glass primitive every pane/chip/pill in the app is built from, so
 * the Liquid Glass ↔ blur ↔ translucent fallback decision lives in one place
 * (see glass-mode.ts for which device gets which path).
 */
import { BlurView } from 'expo-blur';
import { GlassContainer, GlassView } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { useGlassMode } from './glass-mode';
import { colors, radii, rimStyle, withAlpha } from './theme';

export type GlassProps = ViewProps & {
  /** Hex accent; applied at low alpha so the glass stays glass. */
  tint?: string;
  /** Stronger tint, for a selected chip. */
  tintStrength?: 'subtle' | 'strong';
  /** Liquid Glass reacts to touch (scale/shimmer). Use for pressables only. */
  interactive?: boolean;
  radius?: number;
  /** 'clear' = more transparent Liquid Glass (over imagery). */
  variant?: 'regular' | 'clear';
  /**
   * 'control' (default): chips, pills, buttons — real Liquid Glass on iOS 26.
   * 'content': cards in long lists. Apple reserves Liquid Glass for the
   * navigation/control layer (and dozens of live glass views in a scrolling
   * list are costly), so content panes are SOLID "vault onyx" cards with a brass
   * hairline and a gold rim on top (design spec, Level 1) on every platform —
   * blur over an OLED-black backdrop shows nothing anyway. The glass controls
   * then float over them.
   */
  layer?: 'control' | 'content';
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

const TINT_ALPHA = { subtle: { liquid: 0.22, overlay: 0.1 }, strong: { liquid: 0.5, overlay: 0.28 } };

export function Glass({
  tint,
  tintStrength = 'subtle',
  interactive = false,
  radius = radii.lg,
  variant = 'regular',
  layer = 'control',
  style,
  children,
  ...rest
}: GlassProps) {
  const detected = useGlassMode();
  const alpha = TINT_ALPHA[tintStrength];

  if (layer === 'content') {
    return (
      <View
        {...rest}
        style={[
          {
            borderRadius: radius,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: tint ? withAlpha(tint, 0.34) : colors.hairlineStrong,
            backgroundColor: colors.surfaceSolid,
            overflow: 'hidden',
          },
          style,
        ]}>
        {tint ? (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(tint, tintStrength === 'strong' ? 0.1 : 0.035) }]}
          />
        ) : null}
        <View pointerEvents="none" style={[styles.rim, rimStyle]} />
        {children}
      </View>
    );
  }

  const mode = detected;

  if (mode === 'liquid') {
    return (
      <GlassView
        {...rest}
        glassEffectStyle={variant}
        colorScheme="light"
        isInteractive={interactive}
        tintColor={tint ? withAlpha(tint, alpha.liquid) : undefined}
        style={[{ borderRadius: radius }, style]}>
        {children}
      </GlassView>
    );
  }

  const overlay = tint ? (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(tint, alpha.overlay) }]}
    />
  ) : null;
  const frame: ViewStyle = {
    borderRadius: radius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tint && tintStrength === 'strong' ? withAlpha(tint, 0.55) : colors.hairlineStrong,
    overflow: 'hidden',
  };

  if (mode === 'blur') {
    return (
      <BlurView
        {...rest}
        tint="systemUltraThinMaterialLight"
        intensity={60}
        style={[frame, { backgroundColor: colors.glassFill }, style]}>
        {overlay}
        {children}
      </BlurView>
    );
  }

  return (
    <View
      {...rest}
      style={[
        frame,
        { backgroundColor: mode === 'solid' ? colors.surfaceSolid : colors.glassFillAndroid },
        style,
      ]}>
      {overlay}
      {children}
    </View>
  );
}

/**
 * Groups glass elements so Liquid Glass can merge/morph neighbours (chips in a
 * row). Elsewhere it's a plain View — the children still render their own glass.
 */
export function GlassGroup({
  spacing = 8,
  style,
  children,
  ...rest
}: ViewProps & { spacing?: number; children?: ReactNode }) {
  const mode = useGlassMode();
  if (mode === 'liquid') {
    return (
      <GlassContainer {...rest} spacing={spacing} style={style}>
        {children}
      </GlassContainer>
    );
  }
  return (
    <View {...rest} style={style}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  rim: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
});
