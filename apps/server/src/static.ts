/**
 * Path-traversal-safe static file responses (media, course assets, web build).
 *
 * Defense in depth, because every static route ends in a filesystem read:
 *  1. the RAW (still percent-encoded) request path is split on "/" first, so an
 *     encoded "%2f" can never smuggle a separator past the split;
 *  2. every decoded segment must match a conservative charset and may not be
 *     "." / ".." / hidden;
 *  3. the joined path is resolved and must still lie inside the root.
 * Byte ranges are supported: iOS AVPlayer refuses to play an mp4 from a server
 * that ignores `Range` (lesson videos).
 */
import { createReadStream, statSync, type Stats } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';

const SEGMENT_RE = /^[A-Za-z0-9_@+~][A-Za-z0-9._@+~ -]*$/;

export const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
};

export const IMMUTABLE = 'public, max-age=31536000, immutable';
export const REVALIDATE = 'no-cache';

/** Split + decode + validate path segments; null if any segment is unsafe. */
export function safeSegments(rawRelPath: string): string[] | null {
  const parts = rawRelPath.split('/').filter((p) => p !== '');
  const out: string[] = [];
  for (const p of parts) {
    let seg: string;
    try {
      seg = decodeURIComponent(p);
    } catch {
      return null;
    }
    if (!SEGMENT_RE.test(seg)) return null; // rejects "..", ".", ".hidden", "/", "\\", NUL
    out.push(seg);
  }
  return out;
}

/** Absolute path of `segments` under `root`, or null if it would escape it. */
export function resolveInside(root: string, segments: readonly string[]): string | null {
  const base = resolve(root);
  const full = resolve(base, ...segments);
  return full === base || full.startsWith(base + sep) ? full : null;
}

export function statFile(path: string): Stats | null {
  try {
    const s = statSync(path);
    return s.isFile() ? s : null;
  } catch {
    return null;
  }
}

/**
 * Build a file Response (HEAD-aware, Range-aware, ETag/304 for revalidated files).
 * `cacheControl` decides the caching story; content-addressed files pass IMMUTABLE.
 */
export function fileResponse(
  req: Request,
  path: string,
  stat: Stats,
  cacheControl: string,
  extraHeaders: Record<string, string> = {},
): Response {
  const type = CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers = new Headers({
    'content-type': type,
    'cache-control': cacheControl,
    'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff',
    'last-modified': stat.mtime.toUTCString(),
    etag,
    ...extraHeaders,
  });

  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });

  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  const range = req.headers.get('range');
  if (range && stat.size > 0) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m && (m[1] || m[2])) {
      if (m[1]) {
        start = Number(m[1]);
        end = m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
      } else {
        start = Math.max(0, stat.size - Number(m[2])); // suffix range: last N bytes
      }
      if (start > end || start >= stat.size) {
        headers.set('content-range', `bytes */${stat.size}`);
        return new Response(null, { status: 416, headers });
      }
      status = 206;
      headers.set('content-range', `bytes ${start}-${end}/${stat.size}`);
    }
    // A malformed or multi-range header is ignored → full 200 body (RFC 9110 allows that).
  }
  headers.set('content-length', String(stat.size === 0 ? 0 : end - start + 1));

  if (req.method === 'HEAD' || stat.size === 0) return new Response(null, { status, headers });
  const body = Readable.toWeb(createReadStream(path, { start, end })) as unknown as ReadableStream;
  return new Response(body, { status, headers });
}
