import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig, parseDotenv, SERVER_DIR } from '../src/config.ts';
import { tempDir } from './helpers.ts';

let t: ReturnType<typeof tempDir>;
beforeEach(() => (t = tempDir()));
afterEach(() => t.cleanup());

describe('parseDotenv', () => {
  it('handles comments, export, quotes and inline comments', () => {
    const env = parseDotenv(
      ['# comment', '', 'export A=1', 'B = "two words"', "C='#not a comment'", 'D=val # trailing', 'E=a#b', 'bad line', 'F="x\\ny"'].join(
        '\n',
      ),
    );
    expect(env).toEqual({ A: '1', B: 'two words', C: '#not a comment', D: 'val', E: 'a#b', F: 'x\ny' });
  });
});

describe('loadConfig', () => {
  it('defaults: port 8790, all paths anchored at apps/server, ingest disabled', () => {
    const c = loadConfig({}, join(t.dir, 'missing.env'));
    expect(c).toMatchObject({
      port: 8790,
      host: '0.0.0.0',
      ingestToken: undefined,
      dataDir: resolve(SERVER_DIR, 'data'),
      contentDir: resolve(SERVER_DIR, 'content'),
      webDir: resolve(SERVER_DIR, '../mobile/dist'),
    });
  });

  it('reads the .env file but real env vars win; blank token = disabled', () => {
    const f = join(t.dir, '.env');
    writeFileSync(f, 'PORT=9000\nINGEST_TOKEN=from-file\nDATA_DIR=/tmp/x\n');
    expect(loadConfig({}, f)).toMatchObject({ port: 9000, ingestToken: 'from-file', dataDir: '/tmp/x' });
    expect(loadConfig({ PORT: '9100', INGEST_TOKEN: '   ' }, f)).toMatchObject({ port: 9100, ingestToken: undefined });
  });

  it('rejects a nonsense port', () => {
    expect(() => loadConfig({ PORT: 'abc' }, join(t.dir, 'none'))).toThrow(/PORT/);
  });
});
