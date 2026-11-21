import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Media } from '@spa/contract';
import { openDb } from '../src/db.ts';
import { imageDimensions, ingestMedia, MAX_MEDIA_BYTES, MediaError, sniffImage } from '../src/media.ts';
import { makeJpeg, makePng, makeWebpVp8, makeWebpVp8l, makeWebpVp8x, tempDir } from './helpers.ts';

let t: ReturnType<typeof tempDir>;
let db: ReturnType<typeof openDb>;
beforeEach(() => {
  t = tempDir();
  db = openDb(t.dir);
});
afterEach(() => {
  db.close();
  t.cleanup();
});

describe('sniffImage', () => {
  it('identifies by magic bytes', () => {
    expect(sniffImage(makePng(1, 1))?.ext).toBe('png');
    expect(sniffImage(makeJpeg(1, 1))?.ext).toBe('jpg');
    expect(sniffImage(makeWebpVp8x(1, 1))?.ext).toBe('webp');
  });

  it('rejects everything else, including lookalikes', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const html = Buffer.from('<!doctype html><script>alert(1)</script>');
    const gif = Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1');
    const riffWav = Buffer.from('RIFF\x00\x00\x00\x00WAVEfmt ', 'latin1');
    for (const b of [svg, html, gif, riffWav, Buffer.from([0xff, 0xd8]), Buffer.alloc(0)]) expect(sniffImage(b)).toBeNull();
  });
});

describe('imageDimensions', () => {
  it('reads PNG IHDR', () => expect(imageDimensions(makePng(37, 21), sniffImage(makePng(1, 1))!)).toEqual({ width: 37, height: 21 }));

  it('reads JPEG SOF0, skipping DHT (0xC4) and fill bytes', () => {
    expect(imageDimensions(makeJpeg(1280, 720), { ext: 'jpg', mime: 'image/jpeg' })).toEqual({ width: 1280, height: 720 });
  });

  it('reads all three WebP variants', () => {
    const webp = { ext: 'webp', mime: 'image/webp' } as const;
    expect(imageDimensions(makeWebpVp8x(3000, 2000), webp)).toEqual({ width: 3000, height: 2000 });
    expect(imageDimensions(makeWebpVp8l(720, 1280), webp)).toEqual({ width: 720, height: 1280 });
    expect(imageDimensions(makeWebpVp8(853, 480), webp)).toEqual({ width: 853, height: 480 });
  });

  it('returns undefined (not a throw) on a truncated header', () => {
    expect(imageDimensions(makeJpeg(10, 10).subarray(0, 12), { ext: 'jpg', mime: 'image/jpeg' })).toBeUndefined();
    expect(imageDimensions(makePng(10, 10).subarray(0, 18), { ext: 'png', mime: 'image/png' })).toBeUndefined();
  });
});

describe('ingestMedia', () => {
  it('stores a PNG content-addressed with dimensions', () => {
    const png = makePng(16, 9);
    const r = ingestMedia(db, t.dir, png);
    expect(r.isNew).toBe(true);
    expect(() => Media.parse(r.media)).not.toThrow();
    expect(r.media).toMatchObject({ kind: 'image', width: 16, height: 9 });
    expect(r.media.url).toMatch(/^\/media\/[a-f0-9]{32}\.png$/);
    const onDisk = join(t.dir, 'media', r.media.url.slice('/media/'.length));
    expect(readFileSync(onDisk).equals(png)).toBe(true);
  });

  it('stores a JPEG with dimensions', () => {
    expect(ingestMedia(db, t.dir, makeJpeg(640, 480)).media).toMatchObject({ width: 640, height: 480 });
    expect(ingestMedia(db, t.dir, makeJpeg(640, 480)).media.url.endsWith('.jpg')).toBe(true);
  });

  it('dedupes identical bytes to the same media (and restores a deleted file)', () => {
    const png = makePng(8, 8, 1);
    const a = ingestMedia(db, t.dir, png);
    const file = join(t.dir, 'media', a.media.url.slice('/media/'.length));
    rmSync(file);
    const b = ingestMedia(db, t.dir, Buffer.from(png));
    expect(b.isNew).toBe(false);
    expect(b.media).toEqual(a.media);
    expect(existsSync(file)).toBe(true);
    expect(ingestMedia(db, t.dir, makePng(8, 8, 2)).media.id).not.toBe(a.media.id);
    expect((db.prepare('SELECT COUNT(*) AS n FROM media').get() as { n: number }).n).toBe(2);
  });

  it('enforces type (415), size (413) and non-empty (400)', () => {
    const status = (b: Uint8Array) => {
      try {
        ingestMedia(db, t.dir, b);
        return 0;
      } catch (e) {
        return e instanceof MediaError ? e.status : -1;
      }
    };
    expect(status(Buffer.from('<svg/>'))).toBe(415);
    const big = Buffer.alloc(MAX_MEDIA_BYTES + 1);
    makePng(1, 1).copy(big);
    expect(status(big)).toBe(413);
    expect(status(Buffer.alloc(0))).toBe(400);
  });
});
