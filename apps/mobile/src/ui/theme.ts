/**
 * SPA design tokens: "SPA · Society · Prosperity · Abundance", a private garden club.
 * Day palette: ivory marble, deep crimson, gold, in a white glasshouse (brand-src/ outside
 * the repo holds the generated artwork and prompts). Light-only. Roles:
 *   Ivory #F7F2E8 (ground) · Porcelain #FFFDF8 (cards) · Ink #2B1A17 (text)
 *   Crimson #8E1B2C (main accent: headlines, lines, primary actions)
 *   Gold #C9A24A (ornament: rules, rims, hairlines, NEVER small text: 2.2:1 on ivory)
 *   Deep gold #76591A (small accent text/icons) · metal gradient gold (logo + effects only).
 *
 * Contrast (WCAG, on ivory / on porcelain cards): ink 14.9 / 16.4; textSecondary 8.2 / 9.0;
 * textTertiary 6.5 / 7.1; crimson 8.0 / 8.8; deep gold 5.9 / 6.4; buy 4.7 / 5.2;
 * sell 5.0 / 5.5; white on crimson 9.0.
 */
import { DefaultTheme, type Theme } from 'expo-router';
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const palette = {
  ivory: '#F7F2E8',
  porcelain: '#FFFDF8',
  ink: '#2B1A17',
  crimson: '#8E1B2C',
  wine: '#5E0F1C',
  gold: '#C9A24A',
  deepGold: '#76591A',
} as const;

export const colors = {
  /** Ivory: the ground (also the splash + app-config backgroundColor). */
  background: palette.ivory,
  /** Porcelain: cards and secondary surfaces. */
  surfaceSolid: palette.porcelain,
  /** One step down from a card: inner boxes (level grid, tiles). */
  surfaceRaised: '#F4EEE3',
  /** Recess below a card (inputs, a box inside a raised box). */
  surfaceSunken: '#ECE4D6',
  /** Translucent fill laid over blur so glass reads as a pane, not a hole. */
  glassFill: 'rgba(255, 253, 248, 0.74)',
  glassFillAndroid: 'rgba(255, 252, 246, 0.94)',
  /** Card glass laid directly on the hall (Home/Mitglieder cards, segmented control). */
  glassCard: 'rgba(255, 253, 248, 0.84)',
  /** Near-opaque backing (sticky headers, locked overlays). */
  glassStrong: 'rgba(255, 253, 248, 0.97)',
  /** Light veil (secondary buttons, the play ring over an image). */
  glassSoft: 'rgba(255, 253, 248, 0.62)',
  /** Gold hairlines. */
  hairline: 'rgba(176, 138, 53, 0.22)',
  hairlineStrong: 'rgba(176, 138, 53, 0.42)',
  /** Gold: frames, rules and dividers (ornament, never text). */
  brass: palette.gold,
  /** A faint gold wash for inner boxes/chips. */
  goldWash: 'rgba(201, 162, 74, 0.1)',
  /** Soft warm shadow colour (light theme: never pure black). */
  shadow: '#3A2418',

  text: palette.ink,
  textSecondary: '#57443E',
  /** Warm grey for labels/timestamps. */
  textTertiary: '#66534B',
  chrome: '#4A3B36',

  /** Crimson: the main accent (lines, headlines, primary actions). */
  accent: palette.crimson,
  /** Deep gold: small accent text/icons. */
  accentSoft: palette.deepGold,
  /** Gold: secondary lines, inactive strokes. */
  accentDeep: palette.gold,
  accentGlow: 'rgba(142, 27, 44, 0.12)',
  /** Text on a solid accent fill. */
  onAccent: '#FFFFFF',

  buy: '#2F7A4C',
  buySoft: 'rgba(47, 122, 76, 0.1)',
  sell: '#C2312A',
  sellSoft: 'rgba(194, 49, 42, 0.1)',
  /** Muted carmine: borders/strokes of loss elements only. */
  lossStroke: '#B65A52',
  warning: '#9A5B0E',
  info: '#3F5C78',
  success: '#2F7A4C',

  live: '#1F9D55',
  connecting: '#9A5B0E',
  offline: '#8C7D74',
} as const;

/** The logo/effects metal gradient (never a surface fill). */
export const METAL_GRADIENT = `linear-gradient(135deg, #E9D18E 0%, ${palette.gold} 55%, ${palette.deepGold} 100%)`;

/** The soft light on a card's upper-left corner (Home, Mitglieder, video cards). */
export const CARD_SHEEN = 'linear-gradient(150deg, rgba(201,162,74,0.12) 0%, rgba(201,162,74,0.03) 40%, rgba(255,253,248,0) 65%)';

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
/** Tight, "CNC-milled" geometry for content; pills stay for native-style controls. */
export const radii = { xs: 2, sm: 6, md: 8, lg: 12, xl: 16, pill: 999 } as const;

/** Max readable column on tablets / desktop web. */
export const maxContentWidth = 680;

/**
 * Font families. Each Google-font weight is its own family on native, so styles
 * set the family (never `fontWeight`) — a fontWeight on a custom family makes iOS
 * hunt for a bold variant and fall back to the system font. Loaded in the root
 * layout; until (or if never) loaded, RN falls back to the system font.
 */
export const fonts = {
  // Bodoni Moda: the brand's high-contrast Didone display face (the SPA monogram's cut).
  serif: 'BodoniModa_400Regular',
  serifMedium: 'BodoniModa_500Medium',
  serifItalic: 'BodoniModa_400Regular_Italic',
  sans: 'Manrope_400Regular',
  sansMedium: 'Manrope_500Medium',
  sansSemiBold: 'Manrope_600SemiBold',
  sansBold: 'Manrope_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;

/**
 * Type scale: Bodoni Moda for display/headings and the pair, Manrope for UI,
 * JetBrains Mono for every price/figure (columns of levels line up).
 */
export const type = {
  largeTitle: { fontFamily: fonts.serifMedium, fontSize: 34, lineHeight: 40 },
  display: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 36, letterSpacing: -0.3 },
  title: { fontFamily: fonts.serifMedium, fontSize: 22, lineHeight: 28 },
  headline: { fontFamily: fonts.sansSemiBold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 24 },
  callout: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 21 },
  subhead: { fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 19 },
  footnote: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 16 },
  /** Small field label: uppercase, modest tracking (the spec's 0.18em read as gimmicky). */
  label: { fontFamily: fonts.sansSemiBold, fontSize: 11, lineHeight: 14, letterSpacing: 1, textTransform: 'uppercase' },
  /** Prices: monospace so columns of levels line up. */
  price: { fontFamily: fonts.mono, fontSize: 17, lineHeight: 22 },
  priceLarge: { fontFamily: fonts.mono, fontSize: 26, lineHeight: 32, letterSpacing: -0.3 },
  mono: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16 },
  pair: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 40, letterSpacing: -0.3 },
  /** Section heading in the corporate design's engraved style: Didone caps, wide tracking. */
  section: { fontFamily: fonts.serifMedium, fontSize: 15, lineHeight: 20, letterSpacing: 3, textTransform: 'uppercase' },
  /** Hero wordmark ("SPA GARDEN CLUB"). */
  hero: { fontFamily: fonts.serifMedium, fontSize: 30, lineHeight: 36, letterSpacing: 5, textTransform: 'uppercase' },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

/**
 * The app's background is ONE full-screen image (the glasshouse hall, `ui/textures.ts`
 * BACKGROUND) drawn by the root layout BEHIND the tab navigator, so every screen,
 * header and tab sits on it. Every navigation layer above it is therefore transparent
 * (`navigationTheme`, stack `contentStyle` = `backdropStyle`, the tab screens via the
 * theme). It lives OUTSIDE every screen on purpose: react-native-screens finds a screen's
 * scroll view by walking FIRST children only (RNSScreen.mm), so a background view inside
 * a screen, before its list, would break iOS large-title collapse, scroll-edge glass and
 * tap-tab-to-top.
 */
export const backdropStyle: ViewStyle = { backgroundColor: 'transparent' };

/** Softens the background image a little so dark text on it keeps its contrast. */
/**
 * (Stronger toward the bottom, where the artwork's roses spill in under reading text.) With it,
 * over the hall's text column (390x844): ink ≥ 4.5:1 everywhere; textSecondary and
 * textTertiary ≥ 4.5:1 on 97 % / 94 % of it, the rest being rose petals.
 */
export const BACKGROUND_SCRIM = 'linear-gradient(180deg, rgba(247,242,232,0.45) 0%, rgba(247,242,232,0.25) 30%, rgba(247,242,232,0.45) 62%, rgba(247,242,232,0.68) 100%)';

/** The thin gold rim across the top edge of a card. */
export const RIM_GRADIENT = 'linear-gradient(90deg, rgba(201,162,74,0) 0%, rgba(201,162,74,0.75) 50%, rgba(201,162,74,0) 100%)';

export const rimStyle: ViewStyle = Platform.select<ViewStyle>({
  web: { backgroundImage: RIM_GRADIENT } as ViewStyle,
  default: { experimental_backgroundImage: RIM_GRADIENT },
});

/** Navigation theme: light, crimson primary, TRANSPARENT background/card so the root background shows. */
export const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.accent,
    background: 'transparent',
    card: 'transparent',
    text: colors.text,
    border: colors.hairline,
    notification: colors.accent,
  },
  fonts: {
    regular: { fontFamily: fonts.sans, fontWeight: 'normal' },
    medium: { fontFamily: fonts.sansMedium, fontWeight: 'normal' },
    bold: { fontFamily: fonts.sansSemiBold, fontWeight: 'normal' },
    heavy: { fontFamily: fonts.sansBold, fontWeight: 'normal' },
  },
};

/** "#RRGGBB" + alpha → "rgba(...)". Falls back to the brand accent on bad input. */
export function withAlpha(hex: string | undefined, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '');
  if (!m) return withAlpha(colors.accent, alpha);
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Bottom padding for scroll content. Native tab bars inset content themselves;
 * the web tab bar is a floating pill (AppTabs.web.tsx) that content must clear.
 */
export const contentBottomPad = Platform.OS === 'web' ? 112 : spacing.xxl;

/** A CSS gradient as a view background (RN `experimental_backgroundImage`; plain CSS on web). */
export function gradient(css: string): ViewStyle {
  return Platform.select<ViewStyle>({
    web: { backgroundImage: css } as ViewStyle,
    default: { experimental_backgroundImage: css },
  });
}
