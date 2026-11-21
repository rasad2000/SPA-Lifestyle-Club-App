/**
 * Minimal fetch-with-cache hook (no react-query in this app): seeds from the
 * offline cache synchronously, fetches on mount / key change, refetches on live
 * resync, and keeps showing cached data (flagged `stale`) when a fetch fails.
 *
 * Only the LATEST fetch may settle: a new run aborts the previous one, so a slow,
 * superseded response can't land last and roll the data (and the offline cache)
 * back. With `reduceLive`, live events patch the data in place, and events that
 * arrive while a fetch is in flight are replayed onto its result — the response
 * may have been read before them, and dropping them would undo a fresh edit.
 */
import type { LiveEvent } from '@spa/contract';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ApiFailure, Result } from '@/api/client';

import { useLiveEvents } from './use-live';

export type ResourceState<T> = {
  data: T | null;
  error: ApiFailure | null;
  /** First load with nothing to show yet. */
  loading: boolean;
  /** User-initiated refresh in flight (pull-to-refresh). */
  refreshing: boolean;
  /** Showing cached data because the latest fetch failed. */
  stale: boolean;
  refresh: () => void;
};

export function useResource<T>(opts: {
  /** Changes re-run the fetch (e.g. a slug). null = idle. */
  key: string | null;
  load: (signal: AbortSignal) => Promise<Result<T>>;
  readCache?: () => T | null;
  writeCache?: (value: T) => void;
  refetchOnResync?: boolean;
  /** Pure live patch; return the SAME object when the event doesn't apply. */
  reduceLive?: (data: T, event: LiveEvent) => T;
}): ResourceState<T> {
  const { key, refetchOnResync = true } = opts;
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const [state, setState] = useState<{
    key: string | null;
    data: T | null;
    error: ApiFailure | null;
    loading: boolean;
    refreshing: boolean;
    stale: boolean;
  }>(() => ({
    key,
    data: key ? (opts.readCache?.() ?? null) : null,
    error: null,
    loading: true,
    refreshing: false,
    stale: false,
  }));

  // Key changed: reseed from that key's cache during render (React's
  // "adjust state when a prop changes" pattern — no flash of the old key's data).
  if (state.key !== key) {
    setState({
      key,
      data: key ? (opts.readCache?.() ?? null) : null,
      error: null,
      loading: true,
      refreshing: false,
      stale: false,
    });
  }

  const ctrlRef = useRef<AbortController | null>(null);
  /** Live events seen while the current fetch is in flight (null = none in flight). */
  const pendingRef = useRef<LiveEvent[] | null>(null);

  // Fetch + settle. Never sets state synchronously (only in the async callback),
  // so it is safe to call from an effect; `refresh` flags `refreshing` itself.
  const run = useCallback(() => {
    if (!key) return () => {};
    ctrlRef.current?.abort(); // superseded: only the latest fetch may settle
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    pendingRef.current = [];
    optsRef.current.load(ctrl.signal).then((res) => {
      if (ctrl.signal.aborted) return;
      const pending = pendingRef.current ?? [];
      pendingRef.current = null;
      if (res.ok) {
        optsRef.current.writeCache?.(res.data);
        const reduce = optsRef.current.reduceLive;
        const data = reduce ? pending.reduce(reduce, res.data) : res.data;
        setState({ key, data, error: null, loading: false, refreshing: false, stale: false });
      } else {
        setState((s) => ({
          ...s,
          error: res,
          loading: false,
          refreshing: false,
          stale: s.data != null,
        }));
      }
    });
    return () => ctrl.abort();
  }, [key]);

  useEffect(() => run(), [run]);

  useLiveEvents({
    onEvent: (e) => {
      const reduce = optsRef.current.reduceLive;
      if (!reduce) return;
      pendingRef.current?.push(e);
      setState((s) => {
        if (s.data == null) return s;
        const data = reduce(s.data, e);
        return data === s.data ? s : { ...s, data };
      });
    },
    onResync: () => {
      if (refetchOnResync) run();
    },
  });

  const refresh = useCallback(() => {
    if (!key) return;
    setState((s) => ({ ...s, refreshing: true }));
    run();
  }, [key, run]);

  return {
    data: state.data,
    error: state.error,
    loading: state.loading && state.data == null,
    refreshing: state.refreshing,
    stale: state.stale,
    refresh,
  };
}
