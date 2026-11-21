/**
 * Web twin of EdgeFade.tsx: the same mask as CSS `mask-image` (masked-view's web build
 * renders only the mask element). Set on the DOM node because react-native-web doesn't
 * forward mask styles.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { View, type ViewInstance } from 'react-native';

import { edgeMask, useFrame } from '@/ui/frame';

export function EdgeFade({ children }: { children: ReactNode }) {
  const { width, inner, pad } = useFrame();
  const ref = useRef<ViewInstance>(null);
  const mask = edgeMask(width, inner, pad);
  useEffect(() => {
    const el = ref.current as unknown as HTMLElement | null;
    if (!el) return;
    el.style.setProperty('mask-image', mask);
    el.style.setProperty('-webkit-mask-image', mask);
  }, [mask]);
  return <View ref={ref}>{children}</View>;
}
