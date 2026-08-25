import { afterEach, describe, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";

type AuthPayload = { token: string; user: { id: number; username: string } };
type SignalPayload = {
  callId: string;
  fromUserId: number;
  isScreenSharing?: boolean;
  reason?: string;
  iceRestart?: boolean;
  description?: { type: string; sdp: string };
  candidate?: { candidate: string; sdpMid?: string; sdpMLineIndex?: number };
};

const baseUrl = process.env.KETNOI_CALL_TEST_URL ?? "http://127.0.0.1:3000";
const shouldRun = process.env.RUN_KETNOI_CALL_E2E === "true";
const sockets: Socket[] = [];

async function request<T>(path: string, options: RequestInit = {}, token?: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { message?: string }).message ?? `Request failed: ${response.status}`);
  return body as T;
}

async function register(label: string) {
  const suffix = `${label}${Date.now()}${Math.random().toString(36).slice(2, 7)}`.toLowerCase();
  return request<AuthPayload>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username: suffix, password: "ketnoi-test-password", email: `${suffix}@example.test`, secretQuestion: "favorite_color", secretAnswer: "xanh dương" }),
  });
}

async function connect(token: string) {
  const socket = io(baseUrl, { auth: { token }, transports: ["websocket"] });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  return socket;
}

function once<T>(socket: Socket, event: string, predicate: (payload: T) => boolean = () => true) {
  return new Promise<T>((resolve) => {
    const handler = (payload: T) => {
      if (!predicate(payload)) return;
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

afterEach(() => sockets.splice(0).forEach((socket) => socket.disconnect()));

describe.skipIf(!shouldRun)("call signaling end-to-end", () => {
  it("rejects an invalid callId with an explicit signaling error", async () => {
    const caller = await register("invalidcall");
    const callerSocket = await connect(caller.token);
    const invalidId = "call.invalid";

    const rejected = once<{ callId: string; message: string }>(callerSocket, "call:error", (payload) => payload.callId === invalidId);
    callerSocket.emit("call:offer", {
      toUserId: 999_999,
      callId: invalidId,
      description: { type: "offer", sdp: "invalid" },
    });

    await expect(rejected).resolves.toMatchObject({
      callId: invalidId,
      message: expect.stringContaining("không hợp lệ"),
    });
  });

  it("relays offer/answer/candidates/ICE restart/screen-share/hangup and saves call history", async () => {
    const [caller, callee] = await Promise.all([register("caller"), register("callee")]);
    const iceConfig = await request<{ iceServers: Array<{ urls: string[]; username?: string; credential?: string }> }>("/api/webrtc/config", {}, caller.token);
    expect(iceConfig.iceServers.map((server) => server.urls[0])).toEqual([
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun2.l.google.com:19302",
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443?transport=tcp",
    ]);
    expect(iceConfig.iceServers.slice(3)).toEqual([
      { urls: ["turn:openrelay.metered.ca:80"], username: "openrelayproject", credential: "openrelayproject" },
      { urls: ["turn:openrelay.metered.ca:443?transport=tcp"], username: "openrelayproject", credential: "openrelayproject" },
    ]);
    const invite = await request<{ id: number }>("/api/friend-requests", { method: "POST", body: JSON.stringify({ recipientId: callee.user.id }) }, caller.token);
    await request(`/api/friend-requests/${invite.id}/respond`, { method: "POST", body: JSON.stringify({ accept: true }) }, callee.token);

    const [callerSocket, calleeSocket] = await Promise.all([connect(caller.token), connect(callee.token)]);
    const callId = `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const offer = once<SignalPayload>(calleeSocket, "call:offer", (payload) => payload.callId === callId);
    callerSocket.emit("call:offer", { toUserId: callee.user.id, callId, withVideo: true, description: { type: "offer", sdp: "test-offer" } });
    await expect(offer).resolves.toMatchObject({ callId, fromUserId: caller.user.id });

    const pushTokenResponse = await fetch(`${baseUrl}/api/push-tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${callee.token}` },
      body: JSON.stringify({ token: `ExpoPushToken[calltest${Date.now()}]`, platform: "android" }),
    });
    expect(pushTokenResponse.status).toBe(204);
    const savedInvite = await request<{ callId: string; fromUserId: number; withVideo: boolean; description: { type: string; sdp: string } }>(`/api/calls/${callId}/invite`, {}, callee.token);
    expect(savedInvite).toMatchObject({ callId, fromUserId: caller.user.id, withVideo: true, description: { type: "offer", sdp: "test-offer" } });

    const answer = once<SignalPayload>(callerSocket, "call:answer", (payload) => payload.callId === callId);
    calleeSocket.emit("call:answer", { toUserId: caller.user.id, callId, description: { type: "answer", sdp: "test-answer" } });
    await expect(answer).resolves.toMatchObject({ callId, fromUserId: callee.user.id });

    const candidate = once<SignalPayload>(calleeSocket, "call:ice-candidate", (payload) => payload.callId === callId);
    callerSocket.emit("call:ice-candidate", { toUserId: callee.user.id, callId, candidate: { candidate: "candidate:1 1 UDP 1 192.0.2.10 54000 typ host", sdpMid: "0", sdpMLineIndex: 0 } });
    await expect(candidate).resolves.toMatchObject({ callId, candidate: expect.objectContaining({ sdpMid: "0" }) });

    const restartOffer = once<SignalPayload>(calleeSocket, "call:offer", (payload) => payload.callId === callId && payload.iceRestart === true);
    callerSocket.emit("call:offer", { toUserId: callee.user.id, callId, withVideo: true, iceRestart: true, description: { type: "offer", sdp: "test-ice-restart-offer" } });
    await expect(restartOffer).resolves.toMatchObject({ callId, iceRestart: true, description: { type: "offer", sdp: "test-ice-restart-offer" } });

    const restartAnswer = once<SignalPayload>(callerSocket, "call:answer", (payload) => payload.callId === callId && payload.iceRestart === true);
    calleeSocket.emit("call:answer", { toUserId: caller.user.id, callId, iceRestart: true, description: { type: "answer", sdp: "test-ice-restart-answer" } });
    await expect(restartAnswer).resolves.toMatchObject({ callId, iceRestart: true });

    const shareStarted = once<SignalPayload>(calleeSocket, "call:screen-share", (payload) => payload.callId === callId && payload.isScreenSharing === true);
    callerSocket.emit("call:screen-share", { toUserId: callee.user.id, callId, isScreenSharing: true });
    await expect(shareStarted).resolves.toMatchObject({ callId, isScreenSharing: true });

    const hangup = once<SignalPayload>(calleeSocket, "call:hangup", (payload) => payload.callId === callId);
    callerSocket.emit("call:hangup", { toUserId: callee.user.id, callId, reason: "ended" });
    await expect(hangup).resolves.toMatchObject({ callId, reason: "ended" });

    const history = await request<Array<{ id: string; kind: string; status: string }>>(`/api/calls?peerId=${callee.user.id}`, {}, caller.token);
    expect(history).toContainEqual(expect.objectContaining({ id: callId, kind: "video", status: "ended" }));
    const chatHistory = await request<Array<{ callEvent?: { callId: string; kind: string; status: string } }>>(`/api/messages/${callee.user.id}`, {}, caller.token);
    expect(chatHistory).toContainEqual(expect.objectContaining({ callEvent: expect.objectContaining({ callId, kind: "video", status: "ended" }) }));
  }, 30_000);
});
