/**
 * WebSocket push: /v1/live. Server → client only (client frames are ignored).
 *
 * Two keep-alive layers on the same 25 s tick, for different reasons:
 *  - a protocol-level ping; a socket that missed the previous pong is
 *    terminated (half-open TCP after a phone switches networks would otherwise
 *    leak until the kernel notices, minutes later);
 *  - a JSON {type:'ping'} LiveEvent — browsers/RN can't observe protocol
 *    pings, so this is what lets the app show "live" vs "stale".
 */
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import type { LiveEvent } from '@spa/contract';

export const LIVE_PATH = '/v1/live';

export interface Live {
  broadcast(event: LiveEvent): void;
  clientCount(): number;
  close(): Promise<void>;
}

export function attachLive(server: Server, opts: { heartbeatMs?: number; path?: string } = {}): Live {
  const path = opts.path ?? LIVE_PATH;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, clientTracking: true });
  const alive = new WeakMap<WebSocket, boolean>();

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    // This runs in the http server's synchronous 'upgrade' listener: an exception
    // here is uncaught and kills the whole process, so the request target is
    // compared as a plain string (no URL parsing that can throw on e.g. "//[").
    const target = req.url ?? '/';
    const q = target.indexOf('?');
    const pathname = q >= 0 ? target.slice(0, q) : target;
    if (pathname !== path) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  };
  server.on('upgrade', onUpgrade);

  wss.on('connection', (ws: WebSocket) => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    ws.on('error', () => ws.terminate());
    ws.on('message', () => {}); // server → client only
    send(ws, { type: 'hello', serverTime: new Date().toISOString() });
  });

  const timer = setInterval(() => {
    const ping = JSON.stringify({ type: 'ping', serverTime: new Date().toISOString() } satisfies LiveEvent);
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
      if (ws.readyState === WebSocket.OPEN) ws.send(ping);
    }
  }, opts.heartbeatMs ?? 25_000);
  timer.unref();

  function send(ws: WebSocket, event: LiveEvent) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
  }

  return {
    broadcast(event) {
      const frame = JSON.stringify(event); // serialize once, fan out
      for (const ws of wss.clients) if (ws.readyState === WebSocket.OPEN) ws.send(frame);
    },
    clientCount: () => wss.clients.size,
    close() {
      clearInterval(timer);
      server.off('upgrade', onUpgrade);
      for (const ws of wss.clients) ws.close(1001, 'server shutting down');
      return new Promise<void>((done) => {
        // Give close frames a moment, then cut whatever is left.
        const cut = setTimeout(() => {
          for (const ws of wss.clients) ws.terminate();
        }, 1000);
        cut.unref();
        wss.close(() => {
          clearTimeout(cut);
          done();
        });
      });
    },
  };
}
