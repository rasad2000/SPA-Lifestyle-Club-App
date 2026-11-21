/**
 * Server configuration from the environment (+ an optional apps/server/.env).
 *
 * A tiny .env parser instead of `dotenv`: the format we need is KEY=VALUE with
 * optional quotes and comments, and one fewer dependency is one fewer thing to
 * audit on a VPS. Real environment variables always WIN over the file, so a
 * systemd `Environment=` line can override a stale .env without editing it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** apps/server/ — every default path is anchored here, never to the CWD. */
export const SERVER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  /** Unset => ingest is DISABLED (503), never "open". */
  ingestToken: string | undefined;
  /** Exported Expo web build; served only when the directory exists. */
  webDir: string;
  contentDir: string;
  version: string;
  /**
   * DEMO_CONTROLS=1: expose the presenter demo (`POST /v1/demo/run|reset`) that replays
   * a scripted signal sequence into `demoChannel`. Unauthenticated by design (the app
   * triggers it), so it can only ever write/delete posts whose sourceId starts "demo-".
   * Off by default; never enable it on a production server.
   */
  demoControls: boolean;
  /** DEMO_CHANNEL (default "gold-desk", the seeded SPA Gold Desk). */
  demoChannel: string;
}

/** Parse KEY=VALUE lines. Supports `export `, # comments, '…' and "…" (with \n escapes). */
export function parseDotenv(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2]!;
    const q = val[0];
    if ((q === '"' || q === "'") && val.length >= 2 && val.endsWith(q)) {
      val = val.slice(1, -1);
      if (q === '"') val = val.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else {
      // Unquoted: an inline " #" starts a comment (a bare # inside a token is kept).
      const hash = val.search(/\s#/);
      if (hash >= 0) val = val.slice(0, hash);
      val = val.trim();
    }
    out[key] = val;
  }
  return out;
}

/** Merge a .env file UNDER the given env (existing keys are never overwritten). */
export function withDotenv(env: NodeJS.ProcessEnv, file: string): NodeJS.ProcessEnv {
  if (!existsSync(file)) return env;
  const parsed = parseDotenv(readFileSync(file, 'utf8'));
  return { ...parsed, ...env };
}

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(SERVER_DIR, 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const abs = (p: string) => (isAbsolute(p) ? p : resolve(SERVER_DIR, p));

export function loadConfig(baseEnv: NodeJS.ProcessEnv = process.env, dotenvFile = resolve(SERVER_DIR, '.env')): Config {
  const env = withDotenv(baseEnv, dotenvFile);
  const port = Number(env.PORT || 8790);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`invalid PORT: ${env.PORT}`);
  const token = env.INGEST_TOKEN?.trim();
  return {
    port,
    host: env.HOST || '0.0.0.0',
    dataDir: abs(env.DATA_DIR || 'data'),
    ingestToken: token ? token : undefined,
    webDir: abs(env.WEB_DIR || '../mobile/dist'),
    contentDir: abs(env.CONTENT_DIR || 'content'),
    version: readVersion(),
    demoControls: env.DEMO_CONTROLS === '1',
    demoChannel: env.DEMO_CHANNEL || 'gold-desk',
  };
}
