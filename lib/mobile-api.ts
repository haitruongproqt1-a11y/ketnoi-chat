import { Platform } from "react-native";

/**
 * Đặt EXPO_PUBLIC_API_URL và EXPO_PUBLIC_SOCKET_URL khi phát triển với server Node.js.
 * Android emulator mặc định dùng 10.0.2.2; thiết bị thật cần IP LAN hoặc HTTPS công khai.
 */
const localHost = Platform.OS === "android" ? "http://10.0.2.2:3001" : "http://127.0.0.1:3001";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? localHost;
export const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL ?? API_URL;

export type MobileUser = { id: number; username: string; displayName: string; email: string | null; createdAt: string };
export type AuthPayload = { token: string; user: MobileUser };
export type MobileMessage = { id: number; senderId: number; recipientId: number; body: string; createdAt: string; deliveredAt: string | null; readAt: string | null };
export type IceConfig = { iceServers: Array<{ urls: string[]; username?: string; credential?: string }> };
export type FriendRelationship = "friends" | "incoming" | "outgoing" | "none";
export type UserSearchResult = MobileUser & { relationship: FriendRelationship };
export type FriendRequest = { id: number; sender: MobileUser; recipient: MobileUser; status: "pending" | "accepted" | "declined"; createdAt: string; respondedAt: string | null };
export type CallHistoryEntry = { id: string; peer: MobileUser; direction: "incoming" | "outgoing" | "missed"; kind: "audio" | "video"; status: "ringing" | "answered" | "missed" | "declined" | "ended"; startedAt: string; endedAt: string | null; durationSeconds: number };

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? body.error ?? "Không thể kết nối máy chủ");
  return body as T;
}

export const mobileApi = {
  login: (username: string, password: string) => request<AuthPayload>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  register: (username: string, displayName: string, password: string, email?: string) => request<AuthPayload>("/api/auth/register", { method: "POST", body: JSON.stringify({ username, displayName, password, email }) }),
  friends: (token: string) => request<MobileUser[]>("/api/friends", {}, token),
  searchUsers: (token: string, query: string) => request<UserSearchResult[]>(`/api/users/search?q=${encodeURIComponent(query)}`, {}, token),
  friendRequests: (token: string, direction: "incoming" | "outgoing" = "incoming") => request<FriendRequest[]>(`/api/friend-requests?direction=${direction}`, {}, token),
  sendFriendRequest: (token: string, recipientId: number) => request<FriendRequest>("/api/friend-requests", { method: "POST", body: JSON.stringify({ recipientId }) }, token),
  respondFriendRequest: (token: string, requestId: number, accept: boolean) => request<FriendRequest>(`/api/friend-requests/${requestId}/respond`, { method: "POST", body: JSON.stringify({ accept }) }, token),
  messages: (token: string, peerId: number) => request<MobileMessage[]>(`/api/messages/${peerId}`, {}, token),
  markMessagesRead: (token: string, peerId: number) => request<void>(`/api/messages/${peerId}/read`, { method: "POST" }, token),
  unreadCounts: (token: string) => request<Array<{ senderId: number; count: number }>>("/api/messages/unread-counts", {}, token),
  markAllMessagesRead: (token: string) => request<void>("/api/messages/read-all", { method: "POST" }, token),
  readReceiptPreference: (token: string) => request<{ readReceiptsEnabled: boolean }>("/api/preferences", {}, token),
  setReadReceiptPreference: (token: string, enabled: boolean) => request<{ readReceiptsEnabled: boolean }>("/api/preferences/read-receipts", { method: "PUT", body: JSON.stringify({ enabled }) }, token),
  callHistory: (token: string) => request<CallHistoryEntry[]>("/api/calls", {}, token),
  registerPushToken: (token: string, pushToken: string, platform: "ios" | "android") => request<void>("/api/push-tokens", { method: "POST", body: JSON.stringify({ token: pushToken, platform }) }, token),
  iceConfig: (token: string) => request<IceConfig>("/api/webrtc/config", {}, token),
};
