/**
 * Wire config → db → store → courses → Hono app → node HTTP server → live WS.
 * Kept separate from main.ts (process concerns: signals, exit codes) so the
 * end-to-end test can boot a real server on an ephemeral port.
 */
import { createAdaptorServer } from '@hono/node-server';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync } from 'node:fs';
import { createApp } from './app.ts';
import type { Config } from './config.ts';
import { loadCourses } from './courses.ts';
import { openDb } from './db.ts';
import { attachLive, type Live } from './live.ts';
import { createStore } from './store.ts';

export interface RunningServer {
  url: string;
  port: number;
  live: Live;
  summary: { channels: number; posts: number; courses: number; ingest: boolean; web: boolean };
  close(): Promise<void>;
}

export async function startServer(config: Config, opts: { heartbeatMs?: number } = {}): Promise<RunningServer> {
  // Courses first: a bad course.json must abort BEFORE we bind a port.
  const courses = loadCourses(config.contentDir);
  const db = openDb(config.dataDir);
  const store = createStore(db);

  let live: Live | undefined;
  const app = createApp({ config, db, store, courses, publish: (e) => live?.broadcast(e) });
  const server = createAdaptorServer({ fetch: app.fetch, hostname: config.host }) as Server;
  live = attachLive(server, opts);

  await new Promise<void>((ok, fail) => {
    server.once('error', fail);
    server.listen(config.port, config.host, () => {
      server.off('error', fail);
      ok();
    });
  });
  const port = (server.address() as AddressInfo).port;
  const shownHost = config.host === '0.0.0.0' || config.host === '::' ? 'localhost' : config.host;

  return {
    url: `http://${shownHost}:${port}`,
    port,
    live,
    summary: {
      channels: store.listChannels().length,
      posts: store.postCount(),
      courses: courses.size,
      ingest: Boolean(config.ingestToken),
      web: existsSync(config.webDir),
    },
    async close() {
      await live!.close();
      await new Promise<void>((done) => {
        server.close(() => done());
        server.closeAllConnections?.(); // keep-alive sockets would otherwise hold close() open
      });
      db.close();
    },
  };
}
