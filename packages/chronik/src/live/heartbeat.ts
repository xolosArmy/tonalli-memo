/**
 * Node.js WebSocket liveness probe. Chronik blocks are not a heartbeat:
 * a quiet chain must never cause a reconnect. Ping/pong control frames
 * independently detect half-open TCP/TLS connections.
 */
export interface ChronikHeartbeatSocket {
  ping(): void;
  terminate(): void;
  on(event: "pong", listener: () => void): unknown;
  off(event: "pong", listener: () => void): unknown;
}

export class ChronikWsHeartbeat {
  private socket: ChronikHeartbeatSocket | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly intervalMs: number,
    private readonly timeoutMs: number,
    private readonly onPong: () => void,
    private readonly onTimeout: () => void
  ) {
    if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0 ||
        !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error("Chronik heartbeat intervals must be positive safe integers.");
    }
  }

  attach(socket: ChronikHeartbeatSocket): void {
    this.stop();
    this.socket = socket;
    socket.on("pong", this.handlePong);
    this.interval = setInterval(() => this.sendPing(), this.intervalMs);
    this.interval.unref?.();
  }

  stop(): void {
    if (this.interval !== null) clearInterval(this.interval);
    if (this.deadline !== null) clearTimeout(this.deadline);
    this.interval = null;
    this.deadline = null;
    this.socket?.off("pong", this.handlePong);
    this.socket = null;
  }

  private readonly handlePong = (): void => {
    if (this.socket === null || this.deadline === null) return;
    clearTimeout(this.deadline);
    this.deadline = null;
    this.onPong();
  };

  private sendPing(): void {
    const socket = this.socket;
    if (socket === null || this.deadline !== null) return;
    this.deadline = setTimeout(() => this.expire(socket), this.timeoutMs);
    this.deadline.unref?.();
    try {
      socket.ping();
    } catch {
      this.expire(socket);
    }
  }

  private expire(socket: ChronikHeartbeatSocket): void {
    if (this.socket !== socket) return;
    this.stop();
    // Mark unhealthy before terminating: ws will then trigger SDK auto-reconnect
    // and re-send its existing TM0, TM1 and block subscriptions.
    this.onTimeout();
    try {
      socket.terminate();
    } catch {
      // The caller has already been informed; avoid throwing from a timer.
    }
  }
}
