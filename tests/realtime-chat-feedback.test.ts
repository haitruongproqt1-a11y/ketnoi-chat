import { io, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";

type AuthResponse = { token: string; user: { id: number } };
type TypingPayload = { fromUserId: number; isTyping: boolean };
type ReadPayload = { readerId: number; messageIds: number[]; readAt: string };
type MessagePayload = { id: number; senderId: number; recipientId: number; deliveredAt: string | null; media?: { url: string; kind: "image" | "video"; name: string } | null; mediaItems?: Array<{ url: string }>; callEvent?: { callId: string; status: string } | null };
type MediaRecallPayload = { messageId: number; revokedAt: string };

const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const firstUsername = process.env.KETNOI_TEST_USER_A;
const secondUsername = process.env.KETNOI_TEST_USER_B;
const password = process.env.KETNOI_TEST_PASSWORD;
const hasCredentials = Boolean(apiUrl && firstUsername && secondUsername && password);
const sockets: Socket[] = [];

async function login(username: string): Promise<AuthResponse> {
  const response = await fetch(`${apiUrl!.replace(/\/$/, "")}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
  expect(response.ok).toBe(true);
  return response.json() as Promise<AuthResponse>;
}

async function connect(token: string): Promise<Socket> {
  const socket = io(apiUrl!, { auth: { token }, transports: ["websocket"] });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => { socket.once("connect", () => resolve()); socket.once("connect_error", reject); });
  return socket;
}

function once<T>(socket: Socket, event: string, predicate: (payload: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve) => socket.on(event, (payload: T) => { if (predicate(payload)) { socket.off(event); resolve(payload); } }));
}

afterEach(() => { sockets.splice(0).forEach((socket) => socket.disconnect()); });

describe.skipIf(!hasCredentials)("realtime chat feedback", () => {
  it("forwards typing and read receipts between two authenticated users", async () => {
    const [first, second] = await Promise.all([login(firstUsername!), login(secondUsername!)]);
    const [firstSocket, secondSocket] = await Promise.all([connect(first.token), connect(second.token)]);

    const typing = once<TypingPayload>(secondSocket, "chat:typing", (payload) => payload.fromUserId === first.user.id);
    firstSocket.emit("chat:typing", { recipientId: second.user.id, isTyping: true });
    await expect(typing).resolves.toMatchObject({ fromUserId: first.user.id, isTyping: true });

    const incomingMessage = once<MessagePayload>(secondSocket, "chat:new", (payload) => payload.senderId === first.user.id && payload.recipientId === second.user.id);
    const reply = await new Promise<{ ok: boolean; message?: MessagePayload }>((resolve) => firstSocket.emit("chat:send", { recipientId: second.user.id, body: `feedback-${Date.now()}` }, resolve));
    expect(reply.ok).toBe(true);
    const message = await incomingMessage;
    expect(message.deliveredAt).toBeTruthy();

    const uploadForm = new FormData();
    uploadForm.append("file", new Blob(["ketnoi-media-test"], { type: "image/png" }), "media-check.png");
    const uploadResponse = await fetch(`${apiUrl!.replace(/\/$/, "")}/api/media`, { method: "POST", headers: { Authorization: `Bearer ${first.token}` }, body: uploadForm });
    expect(uploadResponse.status).toBe(201);
    const media = await uploadResponse.json() as { url: string; kind: "image" | "video"; name: string; mimeType: string; size: number };
    const mediaIncoming = once<MessagePayload>(secondSocket, "chat:new", (payload) => payload.media?.url === media.url);
    const mediaReply = await new Promise<{ ok: boolean; message?: MessagePayload }>((resolve) => firstSocket.emit("chat:send", { recipientId: second.user.id, body: "", media }, resolve));
    expect(mediaReply.ok).toBe(true);
    await expect(mediaIncoming).resolves.toMatchObject({ media: { url: media.url, kind: "image" } });
    const batchIncoming = once<MessagePayload>(secondSocket, "chat:new", (payload) => payload.mediaItems?.length === 2);
    const batchReply = await new Promise<{ ok: boolean; message?: MessagePayload }>((resolve) => firstSocket.emit("chat:send", { recipientId: second.user.id, body: "", mediaItems: [media, media] }, resolve));
    expect(batchReply.ok).toBe(true);
    await expect(batchIncoming).resolves.toMatchObject({ mediaItems: [{ url: media.url }, { url: media.url }] });
    const callId = `call-feedback-${Date.now()}`;
    const callEvent = once<MessagePayload>(secondSocket, "chat:new", (payload) => payload.callEvent?.callId === callId);
    firstSocket.emit("call:offer", { toUserId: second.user.id, callId, withVideo: false });
    firstSocket.emit("call:hangup", { toUserId: second.user.id, callId, reason: "missed" });
    await expect(callEvent).resolves.toMatchObject({ callEvent: { callId, status: "missed" } });
    const recall = once<MediaRecallPayload>(secondSocket, "chat:media-recalled", (payload) => payload.messageId === mediaReply.message?.id);
    const recallResponse = await fetch(`${apiUrl!.replace(/\/$/, "")}/api/messages/${mediaReply.message!.id}/media`, { method: "DELETE", headers: { Authorization: `Bearer ${first.token}` } });
    expect(recallResponse.ok).toBe(true);
    expect((await recallResponse.json() as { media: unknown; mediaRevokedAt: string | null }).media).toBeNull();
    await expect(recall).resolves.toMatchObject({ messageId: mediaReply.message!.id });

    const conversationsResponse = await fetch(`${apiUrl!.replace(/\/$/, "")}/api/conversations`, { headers: { Authorization: `Bearer ${first.token}` } });
    expect(conversationsResponse.ok).toBe(true);
    const conversations = await conversationsResponse.json() as Array<{ peer: { id: number }; pinned: boolean }>;
    const existingConversation = conversations.find((item) => item.peer.id === second.user.id);
    expect(existingConversation).toBeDefined();
    const pinnedResponse = await fetch(`${apiUrl!.replace(/\/$/, "")}/api/conversations/${second.user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${first.token}` }, body: JSON.stringify({ pinned: !existingConversation!.pinned }) });
    expect(pinnedResponse.ok).toBe(true);
    expect((await pinnedResponse.json() as { pinned: boolean }).pinned).toBe(!existingConversation!.pinned);
    await fetch(`${apiUrl!.replace(/\/$/, "")}/api/conversations/${second.user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${first.token}` }, body: JSON.stringify({ pinned: existingConversation!.pinned }) });
    const archiveResponse = await fetch(`${apiUrl!.replace(/\/$/, "")}/api/conversations/${second.user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${first.token}` }, body: JSON.stringify({ archived: true }) });
    expect((await archiveResponse.json() as { archived: boolean }).archived).toBe(true);
    const restoreResponse = await fetch(`${apiUrl!.replace(/\/$/, "")}/api/conversations/${second.user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${first.token}` }, body: JSON.stringify({ archived: false }) });
    expect((await restoreResponse.json() as { archived: boolean }).archived).toBe(false);
    const searchResponse = await fetch(`${apiUrl!.replace(/\/$/, "")}/api/messages/search?q=feedback-`, { headers: { Authorization: `Bearer ${second.token}` } });
    expect(searchResponse.ok).toBe(true);
    expect((await searchResponse.json() as Array<{ id: number }>).some((item) => item.id === message.id)).toBe(true);

    const unreadResponse = await fetch(`${apiUrl!.replace(/\/$/, "")}/api/messages/unread-counts`, { headers: { Authorization: `Bearer ${second.token}` } });
    expect(unreadResponse.ok).toBe(true);
    const unreadCounts = await unreadResponse.json() as Array<{ senderId: number; count: number }>;
    expect(unreadCounts.find((item) => item.senderId === first.user.id)?.count).toBeGreaterThan(0);

    const preferenceResponse = await fetch(`${apiUrl!.replace(/\/$/, "")}/api/preferences`, { headers: { Authorization: `Bearer ${second.token}` } });
    expect(preferenceResponse.ok).toBe(true);
    const preference = await preferenceResponse.json() as { readReceiptsEnabled: boolean };
    const updatePreference = await fetch(`${apiUrl!.replace(/\/$/, "")}/api/preferences/read-receipts`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${second.token}` }, body: JSON.stringify({ enabled: !preference.readReceiptsEnabled }) });
    expect(updatePreference.ok).toBe(true);
    await fetch(`${apiUrl!.replace(/\/$/, "")}/api/preferences/read-receipts`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${second.token}` }, body: JSON.stringify({ enabled: preference.readReceiptsEnabled }) });

    const receipt = once<ReadPayload>(firstSocket, "chat:read", (payload) => payload.readerId === second.user.id && payload.messageIds.includes(message.id));
    const readResponse = await fetch(`${apiUrl!.replace(/\/$/, "")}/api/messages/${first.user.id}/read`, { method: "POST", headers: { Authorization: `Bearer ${second.token}` } });
    expect(readResponse.status).toBe(204);
    await expect(receipt).resolves.toMatchObject({ readerId: second.user.id });

    const secondMessage = await new Promise<{ ok: boolean }>((resolve) => firstSocket.emit("chat:send", { recipientId: second.user.id, body: `read-all-${Date.now()}` }, resolve));
    expect(secondMessage.ok).toBe(true);
    const readAllResponse = await fetch(`${apiUrl!.replace(/\/$/, "")}/api/messages/read-all`, { method: "POST", headers: { Authorization: `Bearer ${second.token}` } });
    expect(readAllResponse.status).toBe(204);
    const remainingUnread = await fetch(`${apiUrl!.replace(/\/$/, "")}/api/messages/unread-counts`, { headers: { Authorization: `Bearer ${second.token}` } });
    const remainingCounts = await remainingUnread.json() as Array<{ senderId: number; count: number }>;
    expect(remainingCounts.find((item) => item.senderId === first.user.id)).toBeUndefined();
  }, 15_000);
});
