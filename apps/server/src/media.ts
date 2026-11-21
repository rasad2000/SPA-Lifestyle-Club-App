/**
 * Media ingest: raw image bytes in, a deduplicated Media record out.
 *
 * The TYPE comes from magic bytes, never from the declared Content-Type — a
 * producer bug (or a hostile upload) must not get an HTML/SVG file served from
 * our origin. Only raster jpeg/png/webp are accepted; dimensions are read from
 * the header bytes (no image library) so clients can reserve the aspect-ratio
 * box before the image loads (no feed jump).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Media } from '@spa/contract';
import type { Db } from './db.ts';

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

export type ImageType = { ext: 'jpg' | 'png' | 'webp'; mime: 'image/jpeg' | 'image/png' | 'image/webp' };
export type Dimensions = { width: number; height: number };

export class MediaError extends Error {
  constructor(
    public readonly status: 400 | 413 | 415,
    message: string,
  ) {
    super(message);
  }
}

/** Identify jpeg / png / webp by signature; anything else → null. */
export function sniffImage(b: Uint8Array): ImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length >= 8 && png.every((v, i) => b[i] === v)) return { ext: 'png', mime: 'image/png' };
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));
const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + ((b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!);

/** Width/height from the header; undefined when the header is truncated/odd (dims are optional on the wire). */
export function imageDimensions(b: Uint8Array, type: ImageType): Dimensions | undefined {
  const ok = (d: Dimensions) => (d.width > 0 && d.height > 0 ? d : undefined);
  try {
    if (type.ext === 'png') {
      // 8-byte signature, then the IHDR chunk: len(4) "IHDR"(4) width(4) height(4).
      if (b.length < 24 || ascii(b, 12, 4) !== 'IHDR') return undefined;
      return ok({ width: u32be(b, 16), height: u32be(b, 20) });
    }
    if (type.ext === 'jpg') return jpegDimensions(b);
    // WebP: RIFF(4) size(4) WEBP(4) then the first chunk fourcc at 12.
    const chunk = ascii(b, 12, 4);
    if (chunk === 'VP8 ' && b.length >= 30) {
      // Lossy: frame tag (3) + start code 9d 01 2a, then 14-bit width/height.
      if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return undefined;
      return ok({ width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff });
    }
    if (chunk === 'VP8L' && b.length >= 25) {
      // Lossless: signature 0x2f, then 14-bit (width-1), 14-bit (height-1), packed LE.
      if (b[20] !== 0x2f) return undefined;
      const bits = (b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)) >>> 0;
      return ok({ width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 });
    }
    if (chunk === 'VP8X' && b.length >= 30) {
      // Extended: 24-bit (canvas width-1) at 24, (canvas height-1) at 27.
      return ok({ width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 });
    }
  } catch {
    /* fall through: dims are best-effort */
  }
  return undefined;
}

/**
 * Walk JPEG segments to the first SOFn frame header. Skips fill bytes and
 * standalone markers; DHT (C4), JPG (C8) and DAC (CC) share the C0–CF range
 * but are NOT frame headers.
 */
function jpegDimensions(b: Uint8Array): Dimensions | undefined {
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return undefined;
    let marker = b[i + 1]!;
    while (marker === 0xff && i + 2 < b.length) marker = b[++i + 1]!; // fill bytes
    i += 2;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // no length
    if (marker === 0xd9 || marker === 0xda) return undefined; // EOI / SOS before any SOF
    if (i + 1 >= b.length) return undefined;
    const len = u16be(b, i);
    if (len < 2) return undefined;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 6 >= b.length) return undefined;
      const height = u16be(b, i + 3);
      const width = u16be(b, i + 5);
      return width > 0 && height > 0 ? { width, height } : undefined;
    }
    i += len;
  }
  return undefined;
}

export interface MediaRow {
  id: string;
  file: string;
  kind: 'image';
  width: number | null;
  height: number | null;
}

export const toMedia = (r: MediaRow): Media => ({
  id: r.id,
  url: `/media/${r.file}`,
  kind: r.kind,
  ...(r.width ? { width: r.width } : {}),
  ...(r.height ? { height: r.height } : {}),
});

/** Files are named <first 32 hex of sha256>.<ext> — content-addressed, hence immutable-cacheable. */
export const MEDIA_FILE_RE = /^[a-f0-9]{32}\.(?:jpg|png|webp)$/;

export const mediaDir = (dataDir: string) => join(dataDir, 'media');

export function ingestMedia(db: Db, dataDir: string, bytes: Uint8Array, now = new Date()): { media: Media; isNew: boolean } {
  if (bytes.length === 0) throw new MediaError(400, 'empty body');
  if (bytes.length > MAX_MEDIA_BYTES) throw new MediaError(413, `media exceeds ${MAX_MEDIA_BYTES} bytes`);
  const type = sniffImage(bytes);
  if (!type) throw new MediaError(415, 'unsupported media type (jpeg, png, webp only)');

  const sha = createHash('sha256').update(bytes).digest('hex');
  const id = sha.slice(0, 32);
  const file = `${id}.${type.ext}`;
  const dir = mediaDir(dataDir);
  const path = join(dir, file);

  const existing = db.prepare(`SELECT id, file, kind, width, height FROM media WHERE sha256 = ?`).get(sha) as
    | MediaRow
    | undefined;
  // Re-write a missing file even for a known hash (data dir restored without media/).
  if (!existsSync(path)) {
    mkdirSync(dir, { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, bytes);
    renameSync(tmp, path); // atomic: a reader never sees a half-written image
  }
  if (existing) return { media: toMedia(existing), isNew: false };

  const dims = imageDimensions(bytes, type);
  const row: MediaRow = { id, file, kind: 'image', width: dims?.width ?? null, height: dims?.height ?? null };
  db.prepare(
    `INSERT INTO media (id, file, kind, width, height, sha256, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.file, row.kind, row.width, row.height, sha, bytes.length, now.toISOString());
  return { media: toMedia(row), isNew: true };
}
