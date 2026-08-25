import { describe, expect, it } from "vitest";

const baseUrl = process.env.KETNOI_CALL_TEST_URL ?? "http://127.0.0.1:3000";
const shouldRun = process.env.RUN_KETNOI_CALL_E2E === "true";

type Auth = { token: string; user: { id: number } };

async function request<T>(path: string, options: RequestInit = {}, token?: string) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { message?: string }).message ?? `HTTP ${response.status}`);
  return body as T;
}

async function register(label: string): Promise<Auth> {
  const username = `${label}${Date.now()}${Math.random().toString(36).slice(2, 7)}`.toLowerCase();
  return request<Auth>("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password: "ketnoi-chat-test", email: `${username}@example.test`, secretQuestion: "favorite_color", secretAnswer: "xanh" }) });
}

describe.skipIf(!shouldRun)("chat persistence", () => {
  it("saves a text message and returns it in the conversation history", async () => {
    const sender = await register("chatfrom");
    const recipient = await register("chatto");
    const requestRecord = await request<{ id: number }>("/api/friend-requests", { method: "POST", body: JSON.stringify({ recipientId: recipient.user.id }) }, sender.token);
    await request(`/api/friend-requests/${requestRecord.id}/respond`, { method: "POST", body: JSON.stringify({ accept: true }) }, recipient.token);

    const message = await request<{ id: number; body: string; senderId: number; recipientId: number }>(`/api/messages/${recipient.user.id}`, { method: "POST", body: JSON.stringify({ body: "Xin chào từ kiểm thử" }) }, sender.token);
    expect(message.body).toBe("Xin chào từ kiểm thử");
    expect(message.senderId).toBe(sender.user.id);
    expect(message.recipientId).toBe(recipient.user.id);

    const history = await request<Array<{ id: number; body: string }>>(`/api/messages/${sender.user.id}`, {}, recipient.token);
    expect(history).toEqual(expect.arrayContaining([expect.objectContaining({ id: message.id, body: "Xin chào từ kiểm thử" })]));

    const form = new FormData();
    form.append("file", new Blob(["Nội dung tệp kiểm thử Kết Nối"], { type: "text/plain" }), "kiem-thu.txt");
    const uploadResponse = await fetch(`${baseUrl}/api/media`, { method: "POST", headers: { Authorization: `Bearer ${sender.token}` }, body: form });
    expect(uploadResponse.status).toBe(201);
    const media = await uploadResponse.json() as { url: string; kind: string; name: string; mimeType: string; size: number; thumbnailUrl: null };
    expect(media).toMatchObject({ kind: "file", name: "kiem-thu.txt", mimeType: "text/plain", thumbnailUrl: null });

    const mediaMessage = await request<{ id: number; media: { url: string; name: string } }>(`/api/messages/${recipient.user.id}`, { method: "POST", body: JSON.stringify({ body: "Tệp kiểm thử", media }) }, sender.token);
    expect(mediaMessage.media).toMatchObject({ url: media.url, name: "kiem-thu.txt" });

    const recalled = await request<{ id: number; body: string; media: null }>(`/api/messages/${message.id}/recall`, { method: "POST" }, sender.token);
    expect(recalled).toMatchObject({ id: message.id, body: "Tin nhắn đã được thu hồi", media: null });
    const historyAfterRecall = await request<Array<{ id: number; body: string }>>(`/api/messages/${sender.user.id}`, {}, recipient.token);
    expect(historyAfterRecall).toEqual(expect.arrayContaining([expect.objectContaining({ id: message.id, body: "Tin nhắn đã được thu hồi" })]));

    await request(`/api/messages/${mediaMessage.id}`, { method: "DELETE" }, recipient.token);
    const recipientHistoryAfterDelete = await request<Array<{ id: number }>>(`/api/messages/${sender.user.id}`, {}, recipient.token);
    expect(recipientHistoryAfterDelete.some((item) => item.id === mediaMessage.id)).toBe(false);

    const conversations = await request<Array<{ peer: { id: number }; lastMessage: { id: number } }>>("/api/conversations", {}, sender.token);
    expect(conversations).toEqual(expect.arrayContaining([expect.objectContaining({ peer: expect.objectContaining({ id: recipient.user.id }), lastMessage: expect.objectContaining({ id: mediaMessage.id }) })]));

    await request(`/api/conversations/${recipient.user.id}/clear`, { method: "POST" }, sender.token);
    const historyAfterClear = await request<Array<{ id: number }>>(`/api/messages/${recipient.user.id}`, {}, sender.token);
    expect(historyAfterClear).toEqual([]);
    const newMessage = await request<{ id: number }>(`/api/messages/${sender.user.id}`, { method: "POST", body: JSON.stringify({ body: "Tin nhắn sau khi làm mới" }) }, recipient.token);
    const historyWithNewMessage = await request<Array<{ id: number }>>(`/api/messages/${recipient.user.id}`, {}, sender.token);
    expect(historyWithNewMessage).toEqual([expect.objectContaining({ id: newMessage.id })]);

    await request(`/api/messages/${sender.user.id}/read`, { method: "POST" }, recipient.token);
  });
});
