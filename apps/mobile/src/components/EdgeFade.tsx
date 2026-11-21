/**
 * Fades content out where it enters the hall's pillars: a horizontal alpha mask that is
 * opaque inside the frame and transparent from the pillars' inner edge outward. A
 * per-PIXEL fade, so a card resting inside the frame stays crisp while the next one
 * visibly peeks in and dissolves into the pillar (a per-card opacity hid the peek).
 * The pillars carry white lens flares, so this must be real transparency, not an overlay.
 *
 * Native: @react-native-masked-view. Web: EdgeFade.web.tsx (CSS mask-image).
 */
import MaskedViewComponent from '@react-native-masked-view/masked-view';
import type { ComponentType, ReactElement, ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { edgeMask, useFrame } from '@/ui/frame';
import { gradient } from '@/ui/theme';

// masked-view 0.3.2 still references React Native's removed NativeMethods type.
const MaskedView = MaskedViewComponent as unknown as ComponentType<
  ViewProps & { maskElement: ReactElement; androidRenderingMode?: 'software' | 'hardware' }
>;

export function EdgeFade({ children }: { children: ReactNode }) {
  const { width, inner, pad } = useFrame();
  return (
    <MaskedView maskElement={<View style={[StyleSheet.absoluteFill, gradient(edgeMask(width, inner, pad))]} />}>
      {children}
    </MaskedView>
  );
}
