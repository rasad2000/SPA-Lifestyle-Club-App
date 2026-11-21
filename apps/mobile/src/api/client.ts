/**
 * Typed read-API helpers. Every response is validated against @spa/contract with
 * safeParse and returned as a Result — a malformed or unreachable server becomes
 * a German error state in the UI, never a crash.
 */
import {
  ChannelsResponse,
  CoursesResponse,
  DemoResetResponse,
  DemoRunResponse,
  HealthResponse,
  LenientCourseResponse,
  PostThread,
  PostsPage,
} from '@spa/contract';

import { API_BASE, API_UNCONFIGURED } from './config';

/** `config`: this build has no server address — a build problem, not the user's network. */
export type ApiErrorKind = 'network' | 'http' | 'schema' | 'notFound' | 'config';
export type ApiFailure = { ok: false; kind: ApiErrorKind; status?: number; message: string };
export type Result<T> = { ok: true; data: T } | ApiFailure;

const TIMEOUT_MS = 12_000;

/** Structural slice of a zod schema — keeps zod itself out of the app's direct deps. */
export type Schema<T> = {
  safeParse(
    v: unknown,
  ): { success: true; data: T } | { success: false; error: { message: string; issues: unknown } };
};

export async function getJson<T>(
  path: string,
  schema: Schema<T>,
  signal?: AbortSignal,
  method: 'GET' | 'POST' = 'GET',
): Promise<Result<T>> {
  if (API_UNCONFIGURED) return { ok: false, kind: 'config', message: 'EXPO_PUBLIC_API_URL not set' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(API_BASE + path, {
      method,
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (res.status === 404) return { ok: false, kind: 'notFound', status: 404, message: 'not found' };
    if (!res.ok) return { ok: false, kind: 'http', status: res.status, message: res.statusText };
    let body: unknown;
    try {
      body = await res.json();
    } catch (e) {
      return { ok: false, kind: 'schema', message: `invalid JSON: ${String(e)}` };
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      if (__DEV__) console.warn(`[api] ${path} failed contract validation`, parsed.error.issues);
      return { ok: false, kind: 'schema', message: parsed.error.message };
    }
    return { ok: true, data: parsed.data };
  } catch (e) {
    return { ok: false, kind: 'network', message: String(e) };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export const api = {
  health: (signal?: AbortSignal) => getJson('/v1/health', HealthResponse, signal),
  channels: (signal?: AbortSignal) => getJson('/v1/channels', ChannelsResponse, signal),
  posts: (
    channel: string,
    opts: { before?: string | null; limit?: number; signalsOnly?: boolean } = {},
    signal?: AbortSignal,
  ) => {
    const q = new URLSearchParams();
    if (opts.signalsOnly) q.set('only', 'signals');
    if (opts.before) q.set('before', opts.before);
    if (opts.limit) q.set('limit', String(opts.limit));
    const qs = q.toString();
    return getJson(
      `/v1/channels/${encodeURIComponent(channel)}/posts${qs ? `?${qs}` : ''}`,
      PostsPage,
      signal,
    );
  },
  /** Post ids are "channel:sourceId" — the colon must be URL-encoded. */
  thread: (postId: string, signal?: AbortSignal) =>
    getJson(`/v1/posts/${encodeURIComponent(postId)}`, PostThread, signal),
  courses: (signal?: AbortSignal) => getJson('/v1/courses', CoursesResponse, signal),
  /**
   * Lenient on purpose (contract: forward compatibility): a block type this build
   * doesn't know degrades to an "unsupported" card instead of failing the course.
   */
  course: (slug: string, signal?: AbortSignal) =>
    getJson(`/v1/courses/${encodeURIComponent(slug)}`, LenientCourseResponse, signal),
  /** Presenter demo (only when the server's health reports `demoControls`). */
  demoRun: () => getJson('/v1/demo/run', DemoRunResponse, undefined, 'POST'),
  demoReset: () => getJson('/v1/demo/reset', DemoResetResponse, undefined, 'POST'),
};
