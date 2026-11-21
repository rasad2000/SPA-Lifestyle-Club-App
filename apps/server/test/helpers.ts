/** Shared fixtures: a temp DATA_DIR per test, tiny generated images, an app wired to a recorder. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import type { LiveEvent } from '@spa/contract';
import { createApp } from '../src/app.ts';
import { SERVER_DIR, type Config } from '../src/config.ts';
import { loadCourses } from '../src/courses.ts';
import { openDb, type Db } from '../src/db.ts';
import { createStore, type Store } from '../src/store.ts';

export const TOKEN = 'test-token-0123456789';
export const AUTH = { authorization: `Bearer ${TOKEN}` };

export function tempDir(prefix = 'spa-test-'): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function testConfig(dataDir: string, over: Partial<Config> = {}): Config {
  return {
    port: 0,
    host: '127.0.0.1',
    dataDir,
    ingestToken: TOKEN,
    webDir: join(dataDir, 'no-web-build'),
    contentDir: resolve(SERVER_DIR, 'content'),
    version: '0.0.0-test',
    demoControls: false,
    demoChannel: 'gold-desk',
    ...over,
  };
}

export interface TestEnv {
  app: ReturnType<typeof createApp>;
  db: Db;
  store: Store;
  events: LiveEvent[];
  config: Config;
  cleanup: () => void;
}

export function makeEnv(over: Partial<Config> = {}): TestEnv {
  const t = tempDir();
  const config = testConfig(t.dir, over);
  const db = openDb(config.dataDir);
  const store = createStore(db);
  const events: LiveEvent[] = [];
  const app = createApp({ config, db, store, courses: loadCourses(config.contentDir), publish: (e) => events.push(e) });
  return {
    app,
    db,
    store,
    events,
    config,
    cleanup: () => {
      db.close();
      t.cleanup();
    },
  };
}

export const json = (body: unknown, headers: Record<string, string> = {}) => ({
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json', ...headers },
});

export const GOLD = { title: 'SPA Gold Desk', kind: 'stream', accent: '#8B5CF6', demo: true } as const;

// ---------------------------------------------------------------- tiny images

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

/** A real, decodable greyscale PNG of the given size (`seed` varies the pixels → different hash). */
export function makePng(width: number, height: number, seed = 0): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = (x + y + seed) & 0xff;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * JPEG header bytes with JFIF APP0, a DHT (0xC4 — must be skipped, it sits in the
 * SOF marker range), fill bytes, then SOF0 carrying the dimensions.
 */
export function makeJpeg(width: number, height: number): Buffer {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const dht = [0xff, 0xc4, 0x00, 0x05, 0x00, 0x00, 0x00];
  const sof0 = [0xff, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  return Buffer.from([0xff, 0xd8, ...app0, ...dht, ...sof0, 0xff, 0xd9]);
}

/** WebP VP8X (extended) header: canvas dims stored as 24-bit (value-1). */
export function makeWebpVp8x(width: number, height: number): Buffer {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(22, 4);
  b.write('WEBP', 8, 'ascii');
  b.write('VP8X', 12, 'ascii');
  b.writeUInt32LE(10, 16);
  b.writeUIntLE(width - 1, 24, 3);
  b.writeUIntLE(height - 1, 27, 3);
  return b;
}

/** WebP VP8L (lossless) header: 14-bit (w-1) | 14-bit (h-1) << 14, after signature 0x2f. */
export function makeWebpVp8l(width: number, height: number): Buffer {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(22, 4);
  b.write('WEBP', 8, 'ascii');
  b.write('VP8L', 12, 'ascii');
  b.writeUInt32LE(5, 16);
  b[20] = 0x2f;
  b.writeUInt32LE((((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14)) >>> 0, 21);
  return b;
}

/** WebP VP8 (lossy) header: start code 9d 01 2a then 14-bit LE width/height. */
export function makeWebpVp8(width: number, height: number): Buffer {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(22, 4);
  b.write('WEBP', 8, 'ascii');
  b.write('VP8 ', 12, 'ascii');
  b.writeUInt32LE(10, 16);
  b[23] = 0x9d;
  b[24] = 0x01;
  b[25] = 0x2a;
  b.writeUInt16LE(width, 26);
  b.writeUInt16LE(height, 28);
  return b;
}
