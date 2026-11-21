import { Text as RNText, type TextProps } from 'react-native';

import { colors, type as typeScale, type TypeVariant } from './theme';

type Tone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'chrome';

const TONE: Record<Tone, string> = {
  primary: colors.text,
  secondary: colors.textSecondary,
  tertiary: colors.textTertiary,
  accent: colors.accentSoft,
  chrome: colors.chrome,
};

export type AppTextProps = TextProps & {
  variant?: TypeVariant;
  tone?: Tone;
  color?: string;
};

/** Every string in the app goes through this, so the type scale stays one system. */
export function Text({ variant = 'body', tone = 'primary', color, style, ...rest }: AppTextProps) {
  return <RNText {...rest} style={[typeScale[variant], { color: color ?? TONE[tone] }, style]} />;
}
