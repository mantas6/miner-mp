import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNet, RECONNECT, type NetClient } from './net';

/**
 * Minimal WebSocket double. partysocket drives the underlying socket through
 * `addEventListener`, so this is a real `EventTarget` that dispatches real
 * events; `drop` simulates a connection lost without an explicit close.
 */
class FakeWebSocket extends EventTarget {
  static instances: FakeWebSocket[] = [];
  static readonly CLOSED = 3;
  readonly OPEN = 1;
  readyState = 0;
  binaryType = 'blob';
  sent: string[] = [];

  constructor(readonly url: string) {
    super();
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new Event('close'));
  }

  /** The transport died; the client should retry. */
  drop(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new Event('close'));
  }

  open(): void {
    this.readyState = this.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  receive(message: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
  }
}

function net(callbacks = {}): NetClient {
  FakeWebSocket.instances = [];
  return createNet({
    url: 'ws://relay.test',
    WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    callbacks
  });
}

/** partysocket connects asynchronously; wait for the next socket to appear. */
async function openSocket(client: NetClient, index = 0): Promise<FakeWebSocket> {
  client.connect();
  await vi.advanceTimersByTimeAsync(1);
  const socket = FakeWebSocket.instances[index];
  socket.open();
  return socket;
}

describe('relay lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('promotes a remaining guest and accepts a later guest without reconnecting', async () => {
    vi.useFakeTimers();
    const onPeerLeft = vi.fn();
    const onPeerJoined = vi.fn();
    const client = net({ onPeerLeft, onPeerJoined });

    const socket = await openSocket(client);
    socket.receive({ t: 'paired', role: 'guest' });
    expect(client).toMatchObject({ connected: true, paired: true, role: 'guest' });

    socket.receive({ t: 'peer-left' });
    expect(onPeerLeft).toHaveBeenCalledOnce();
    expect(client).toMatchObject({ connected: true, paired: false, role: 'host' });

    socket.receive({ t: 'peer-joined' });
    expect(onPeerJoined).toHaveBeenCalledOnce();
    expect(client).toMatchObject({ connected: true, paired: true, role: 'host' });
    expect(FakeWebSocket.instances).toHaveLength(1);
    client.disconnect();
  });

  it('keeps an existing host role when its guest leaves and clears it on disconnect', async () => {
    vi.useFakeTimers();
    const client = net();

    const socket = await openSocket(client);
    socket.receive({ t: 'paired', role: 'host' });
    socket.receive({ t: 'peer-left' });
    expect(client).toMatchObject({ connected: true, paired: false, role: 'host' });

    client.disconnect();
    expect(client).toMatchObject({ connected: false, paired: false, role: null });
  });
});

describe('reconnect', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries after a dropped connection and re-pairs through the relay handshake', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const onOpen = vi.fn();
    const client = net({ onClose, onOpen });

    const first = await openSocket(client);
    first.receive({ t: 'paired', role: 'guest' });

    first.drop();
    expect(onClose).toHaveBeenCalledOnce();
    expect(client).toMatchObject({ connected: false, paired: false, role: null });

    await vi.advanceTimersByTimeAsync(RECONNECT.minDelayMs + 10);
    expect(FakeWebSocket.instances).toHaveLength(2);

    // The relay re-hydrates and re-pairs every accepted connection, possibly
    // handing out a different role, so no join message is replayed.
    const second = FakeWebSocket.instances[1];
    second.open();
    second.receive({ t: 'paired', role: 'host' });
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(client).toMatchObject({ connected: true, paired: true, role: 'host' });
    expect(client.send({ type: 'died' })).toBe(true);
    expect(second.sent).toEqual([JSON.stringify({ t: 'relay', payload: { type: 'died' } })]);
    client.disconnect();
  });

  it('stops retrying once the relay reports the room is full', async () => {
    vi.useFakeTimers();
    const onRoomFull = vi.fn();
    const client = net({ onRoomFull });

    const socket = await openSocket(client);
    socket.receive({ t: 'room-full' });
    expect(onRoomFull).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(RECONNECT.maxDelayMs * 2);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(client.send({ type: 'died' })).toBe(false);
  });

  it('does not queue messages while the connection is down', async () => {
    vi.useFakeTimers();
    const client = net();
    const socket = await openSocket(client);
    socket.drop();

    expect(client.send({ type: 'died' })).toBe(false);
    await vi.advanceTimersByTimeAsync(RECONNECT.minDelayMs + 10);
    const second = FakeWebSocket.instances[1];
    second.open();
    expect(second.sent).toEqual([]);
    client.disconnect();
  });
});
