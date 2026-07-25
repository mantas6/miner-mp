import { describe, expect, it, vi } from 'vitest';
import { createNet } from '../src/net';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly OPEN = 1;
  readyState = this.OPEN;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  sent: string[] = [];

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.({} as CloseEvent);
  }

  open(): void {
    this.onopen?.({} as Event);
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
  }
}

describe('relay lifecycle', () => {
  it('promotes a remaining guest and accepts a later guest without reconnecting', () => {
    FakeWebSocket.instances = [];
    const onPeerLeft = vi.fn();
    const onPeerJoined = vi.fn();
    const net = createNet({
      url: 'ws://relay.test',
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
      callbacks: { onPeerLeft, onPeerJoined }
    });

    net.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.receive({ t: 'paired', role: 'guest' });
    expect(net).toMatchObject({ connected: true, paired: true, role: 'guest' });

    socket.receive({ t: 'peer-left' });
    expect(onPeerLeft).toHaveBeenCalledOnce();
    expect(net).toMatchObject({ connected: true, paired: false, role: 'host' });

    socket.receive({ t: 'peer-joined' });
    expect(onPeerJoined).toHaveBeenCalledOnce();
    expect(net).toMatchObject({ connected: true, paired: true, role: 'host' });
  });

  it('keeps an existing host role when its guest leaves and clears it on socket close', () => {
    FakeWebSocket.instances = [];
    const net = createNet({ WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket });

    net.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.receive({ t: 'paired', role: 'host' });
    socket.receive({ t: 'peer-left' });
    expect(net).toMatchObject({ connected: true, paired: false, role: 'host' });

    socket.close();
    expect(net).toMatchObject({ connected: false, paired: false, role: null });
  });
});
