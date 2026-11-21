/**
 * Process entry: `tsx src/main.ts`. Boots the server, logs ONE startup line,
 * and shuts down gracefully on SIGTERM/SIGINT (systemd stop / Ctrl-C) so the
 * WAL is checkpointed and clients get a clean 1001 close instead of a reset.
 */
import { loadConfig } from './config.ts';
import { CourseLoadError } from './courses.ts';
import { startServer } from './server.ts';

const config = loadConfig();

try {
  const s = await startServer(config);
  const { channels, posts, courses, ingest, web } = s.summary;
  console.log(
    `[spa-server] v${config.version} listening on http://${config.host}:${s.port}` +
      (s.url.includes(config.host) ? '' : ` (local ${s.url})`) +
      ' — ' +
      `${channels} channels, ${posts} posts, ${courses} courses, ingest ${ingest ? 'ENABLED' : 'disabled'}, ` +
      `web build ${web ? 'served' : 'absent'}, data ${config.dataDir}`,
  );

  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[spa-server] ${signal} — shutting down`);
    const force = setTimeout(() => {
      console.error('[spa-server] shutdown timed out, forcing exit');
      process.exit(1);
    }, 5000);
    force.unref();
    s.close().then(
      () => process.exit(0),
      (e) => {
        console.error('[spa-server] shutdown error', e);
        process.exit(1);
      },
    );
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
} catch (e) {
  if (e instanceof CourseLoadError) console.error(`[spa-server] course content invalid — refusing to start\n${e.message}`);
  else console.error('[spa-server] failed to start', e);
  process.exit(1);
}
