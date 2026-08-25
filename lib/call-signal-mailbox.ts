export type CallSignalEvent =
  | "call:offer"
  | "call:answer"
  | "call:ice-candidate"
  | "call:hangup"
  | "call:screen-share"
  | "call:error";

export type CallSignalPayload = {
  fromUserId?: number;
  toUserId?: number;
  callId: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  withVideo?: boolean;
  callerName?: string;
  reason?: "ended" | "missed" | "declined";
  quickReply?: string;
  isScreenSharing?: boolean;
  message?: string;
};

export type CallSignalEnvelope = {
  event: CallSignalEvent;
  payload: CallSignalPayload;
};

type Listener = (signal: CallSignalEnvelope) => void;

/**
 * Preserves every call signal until the route owning that call session is ready.
 * A live subscriber receives signals directly; without one, signals are queued by callId.
 */
export class CallSignalMailbox {
  private readonly queued = new Map<string, CallSignalEnvelope[]>();
  private readonly listeners = new Map<string, Set<Listener>>();

  push(signal: CallSignalEnvelope) {
    const listeners = this.listeners.get(signal.payload.callId);
    if (listeners?.size) {
      listeners.forEach((listener) => listener(signal));
      return;
    }

    const queue = this.queued.get(signal.payload.callId) ?? [];
    queue.push(signal);
    // A candidate flood must not grow forever when a recipient never opens a call route.
    if (queue.length > 96) queue.splice(0, queue.length - 96);
    this.queued.set(signal.payload.callId, queue);
  }

  consume(callId: string) {
    const queue = this.queued.get(callId) ?? [];
    this.queued.delete(callId);
    return queue;
  }

  subscribe(callId: string, listener: Listener) {
    const listeners = this.listeners.get(callId) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(callId, listeners);
    return () => {
      const current = this.listeners.get(callId);
      current?.delete(listener);
      if (!current?.size) this.listeners.delete(callId);
    };
  }

  clear(callId: string) {
    this.queued.delete(callId);
    this.listeners.delete(callId);
  }

  clearAll() {
    this.queued.clear();
    this.listeners.clear();
  }
}
