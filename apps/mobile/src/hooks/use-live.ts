import type { LiveEvent } from '@spa/contract';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import { live, type LiveState } from '@/api/live';

/** Connection state of the shared live socket ('live' | 'connecting' | 'offline'). */
export function useLiveState(): LiveState {
  return useSyncExternalStore(live.subscribeState, live.getState, live.getState);
}

/**
 * Subscribe to live events and resyncs. Handlers are read through a ref so the
 * subscription is made once per mount, not on every render.
 */
export function useLiveEvents(handlers: {
  onEvent?: (event: LiveEvent) => void;
  onResync?: () => void;
}): void {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });
  useEffect(() => {
    const offEvent = live.onEvent((e) => ref.current.onEvent?.(e));
    const offResync = live.onResync(() => ref.current.onResync?.());
    return () => {
      offEvent();
      offResync();
    };
  }, []);
}
