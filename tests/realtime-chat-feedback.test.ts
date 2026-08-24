import { io, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";

type AuthResponse = { token: string; user: { id: number } };
type TypingPayload = { fromUserId: number; isTyping: boolean };
type ReadPayload = { readerId: number; messageIds: number[]; readAt: string };
type MessagePayload = { id: number; senderId: number; recipientId: number };

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

    const receipt = once<ReadPayload>(firstSocket, "chat:read", (payload) => payload.readerId === second.user.id && payload.messageIds.includes(message.id));
    const readResponse = await fetch(`${apiUrl!.replace(/\/$/, "")}/api/messages/${first.user.id}/read`, { method: "POST", headers: { Authorization: `Bearer ${second.token}` } });
    expect(readResponse.status).toBe(204);
    await expect(receipt).resolves.toMatchObject({ readerId: second.user.id });
  }, 15_000);
});
