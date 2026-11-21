/**
 * The glasshouse hall background is a PICTURE FRAME: its two rose-covered pillars bound the content.
 * This computes where the pillars' inner edges land on THIS screen, from how the root
 * background is fitted (`contentFit="cover"`, `contentPosition="bottom"`, image 1080×2340,
 * pillar inner edges measured at 13.5 % from each side of the artwork).
 *
 *   inner     the x of the left pillar's inner edge (the right one mirrors it)
 *   pad       content padding: inside the frame, with a small breathing offset
 *
 * Horizontal carousels span the full width so cards can be swiped INTO the pillars,
 * where they fade out (components/Carousel.tsx + EdgeFade.tsx).
 */
import { useWindowDimensions } from 'react-native';

import { maxContentWidth, spacing } from './theme';

const IMAGE_W = 1080;
const IMAGE_H = 2340;
const PILLAR_INNER = 0.135;

export type Frame = { width: number; inner: number; pad: number };

export function frameFor(width: number, height: number): Frame {
  const scale = Math.max(width / IMAGE_W, height / IMAGE_H);
  const imageW = IMAGE_W * scale;
  const offsetX = (width - imageW) / 2;
  const inner = Math.max(0, offsetX + PILLAR_INNER * imageW);
  // Wide screens (web/tablet): never let the column grow past the readable width.
  const pad = Math.max(inner + spacing.sm, (width - maxContentWidth) / 2);
  return { width, inner, pad };
}

export function useFrame(): Frame {
  const { width, height } = useWindowDimensions();
  return frameFor(width, height);
}

/**
 * The pillar mask (components/EdgeFade): opaque inside the frame, transparent from just
 * outside the pillars' inner edge, so content entering a pillar is fully gone.
 */
export function edgeMask(width: number, inner: number, pad: number): string {
  const a = (Math.max(0, inner - 4) / width) * 100;
  const b = (pad / width) * 100;
  return `linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0) ${a}%, #000 ${b}%, #000 ${100 - b}%, rgba(0,0,0,0) ${100 - a}%, rgba(0,0,0,0) 100%)`;
}
