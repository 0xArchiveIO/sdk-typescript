/**
 * How the WebSocket client sends before, during and after a connection, and
 * the `ws` package used where the runtime has no global WebSocket.
 */
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';
import { OxArchiveWs } from '../src';
import { notConnectedError } from '../src/websocket';

/** Minimal stand-in for the global WebSocket. */
class FakeSocket {
  static readonly OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  /** The connection closes from the other side (or never opens). */
  drop(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code, reason: '' });
  }
}

function useFakeSocket(): void {
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
}

const lastSocket = (): FakeSocket => FakeSocket.instances[FakeSocket.instances.length - 1]!;

describe('requests made before the socket opens', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('queues a replay made before connect() resolves and sends it once the socket opens', async () => {
    useFakeSocket();
    const ws = new OxArchiveWs({ apiKey: 'k', autoReconnect: false });
    const opening = ws.connect();
    ws.subscribe('trades', 'BTC');
    ws.replay('orderbook', 'BTC', { start: 1, end: 2, speed: 10 });

    const socket = lastSocket();
    expect(socket.sent).toEqual([]);
    socket.open();
    await opening;

    expect(socket.sent).toEqual([
      { op: 'subscribe', channel: 'trades', symbol: 'BTC' },
      { op: 'replay', channel: 'orderbook', symbol: 'BTC', start: 1, end: 2, speed: 10 },
    ]);
  });

  it('throws instead of dropping a request when the client is not connected', () => {
    const ws = new OxArchiveWs({ apiKey: 'k' });
    expect(() => ws.replay('orderbook', 'BTC', { start: 1, end: 2 })).toThrow(notConnectedError('replay'));
    expect(() => ws.multiReplay(['orderbook', 'trades'], 'BTC', { start: 1, end: 2 })).toThrow(
      notConnectedError('replay'),
    );
    expect(() => ws.replayPause()).toThrow(notConnectedError('replay.pause'));
    expect(() => ws.replaySeek(5)).toThrow(notConnectedError('replay.seek'));
    // Nothing is running, so there is nothing to stop.
    expect(() => ws.replayStop()).not.toThrow();
    // Subscriptions are kept and sent on connect, as before.
    expect(() => ws.subscribe('trades', 'BTC')).not.toThrow();
  });

  it('throws after disconnect()', async () => {
    useFakeSocket();
    const ws = new OxArchiveWs({ apiKey: 'k', autoReconnect: false });
    const opening = ws.connect();
    lastSocket().open();
    await opening;
    ws.replay('trades', 'BTC', { start: 1, end: 2 });
    expect(lastSocket().sent).toHaveLength(1);

    ws.disconnect();
    expect(() => ws.replay('trades', 'BTC', { start: 1, end: 2 })).toThrow(notConnectedError('replay'));
  });

  it('drops what was queued when the first connect fails', async () => {
    useFakeSocket();
    const ws = new OxArchiveWs({ apiKey: 'k', autoReconnect: false });
    const opening = ws.connect();
    ws.replay('orderbook', 'BTC', { start: 1, end: 2 });
    lastSocket().drop(1006);
    await expect(opening).rejects.toThrow('closed before connecting');

    // A later connection does not send the old request.
    const reopening = ws.connect();
    const second = lastSocket();
    second.open();
    await reopening;
    expect(second.sent).toEqual([]);
  });

  it('keeps a request made while reconnecting and sends it on the new socket', async () => {
    useFakeSocket();
    const ws = new OxArchiveWs({ apiKey: 'k', reconnectDelay: 1 });
    const opening = ws.connect();
    const first = lastSocket();
    first.open();
    await opening;

    first.drop(1006);
    expect(ws.getState()).toBe('reconnecting');
    ws.replay('trades', 'BTC', { start: 1, end: 2 });
    expect(first.sent).toEqual([]);

    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(2));
    const second = lastSocket();
    second.open();
    await vi.waitFor(() => expect(ws.getState()).toBe('connected'));
    expect(second.sent).toEqual([{ op: 'replay', channel: 'trades', symbol: 'BTC', start: 1, end: 2, speed: 1 }]);
    ws.disconnect();
  });
});

describe('the ws package in Node.js', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('receives a compressed message larger than 4 MB, which some Node.js 24 built-in WebSockets refuse', async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0, perMessageDeflate: true });
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const { port } = server.address() as AddressInfo;
    const book = 'x'.repeat(9_000_000);
    server.on('connection', (socket) => {
      socket.on('message', () => {
        socket.send(JSON.stringify({ type: 'l4_snapshot', channel: 'l4_diffs', coin: 'BTC', data: { book } }));
      });
    });

    try {
      // No WebSocket assigned by the caller: the runtime's own, or none.
      const ws = new OxArchiveWs({ apiKey: 'k', wsUrl: `ws://127.0.0.1:${port}/ws`, autoReconnect: false });
      const snapshot = new Promise<number>((resolve, reject) => {
        ws.on('onMessage', (message) => {
          const data = (message as unknown as { data?: { book?: string } }).data;
          if (message.type === 'l4_snapshot') resolve(data?.book?.length ?? 0);
        });
        ws.on('onClose', (code) => reject(new Error(`closed with ${code}`)));
      });
      await ws.connect();
      ws.replay('l4_diffs', 'BTC', { start: 1, end: 2 });
      await expect(snapshot).resolves.toBe(book.length);
      ws.disconnect();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('connects, sends a request made while connecting, and receives messages', async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const { port } = server.address() as AddressInfo;
    const received: Array<Record<string, unknown>> = [];
    let requestUrl = '';
    server.on('connection', (socket, request) => {
      requestUrl = request.url ?? '';
      socket.on('message', (data) => {
        const message = JSON.parse(String(data)) as Record<string, unknown>;
        received.push(message);
        if (message.op === 'replay') {
          socket.send(
            JSON.stringify({
              type: 'replay_started',
              channel: message.channel,
              coin: message.symbol,
              start: message.start,
              end: message.end,
              speed: message.speed,
            }),
          );
        }
      });
    });

    try {
      vi.stubGlobal('WebSocket', undefined);
      const ws = new OxArchiveWs({ apiKey: 'k', wsUrl: `ws://127.0.0.1:${port}/ws`, autoReconnect: false });
      const started = new Promise<[string, string]>((resolve) =>
        ws.onReplayStart((channel, coin) => resolve([channel, coin])),
      );

      const opening = ws.connect();
      ws.replay('orderbook', 'BTC', { start: 1, end: 2 });
      await opening;

      expect(ws.isConnected()).toBe(true);
      await expect(started).resolves.toEqual(['orderbook', 'BTC']);
      expect(requestUrl).toContain('version=2026-10-01');
      expect(received).toContainEqual({ op: 'replay', channel: 'orderbook', symbol: 'BTC', start: 1, end: 2, speed: 1 });
      ws.disconnect();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
