import { Linking, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

/**
 * Đặt EXPO_PUBLIC_API_URL và EXPO_PUBLIC_SOCKET_URL khi phát triển với server Node.js.
 * Android emulator mặc định dùng 10.0.2.2; thiết bị thật cần IP LAN hoặc HTTPS công khai.
 */
const localHost = Platform.OS === "android" ? "http://10.0.2.2:3001" : "http://127.0.0.1:3001";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? localHost;
export const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL ?? API_URL;

export type MobileUser = { id: number; username: string; displayName: string; email: string | null; createdAt: string };
export type AuthPayload = { token: string; user: MobileUser };
export type ChatMedia = { url: string; kind: "image" | "video"; name: string; mimeType: string; size: number; thumbnailUrl: string | null };
export type ChatCallEvent = { callId: string; kind: "audio" | "video"; status: "missed" | "answered" | "declined" | "ended"; durationSeconds: number };
export type MobileMessage = { id: number; senderId: number; recipientId: number; body: string; createdAt: string; deliveredAt: string | null; readAt: string | null; media: ChatMedia | null; mediaItems?: ChatMedia[]; mediaRevokedAt: string | null; callEvent?: ChatCallEvent | null };
export type ConversationSummary = { peer: MobileUser; lastMessage: MobileMessage | null; unreadCount: number; pinned: boolean; archived: boolean; muted: boolean };
export type MessageSearchResult = MobileMessage & ConversationSummary;
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
  conversations: (token: string) => request<ConversationSummary[]>("/api/conversations", {}, token),
  updateConversation: (token: string, peerId: number, changes: Partial<{ pinned: boolean; archived: boolean; muted: boolean; hidden: boolean }>) => request<ConversationSummary>(`/api/conversations/${peerId}`, { method: "PATCH", body: JSON.stringify(changes) }, token),
  searchUsers: (token: string, query: string) => request<UserSearchResult[]>(`/api/users/search?q=${encodeURIComponent(query)}`, {}, token),
  friendRequests: (token: string, direction: "incoming" | "outgoing" = "incoming") => request<FriendRequest[]>(`/api/friend-requests?direction=${direction}`, {}, token),
  sendFriendRequest: (token: string, recipientId: number) => request<FriendRequest>("/api/friend-requests", { method: "POST", body: JSON.stringify({ recipientId }) }, token),
  respondFriendRequest: (token: string, requestId: number, accept: boolean) => request<FriendRequest>(`/api/friend-requests/${requestId}/respond`, { method: "POST", body: JSON.stringify({ accept }) }, token),
  messages: (token: string, peerId: number) => request<MobileMessage[]>(`/api/messages/${peerId}`, {}, token),
  markMessagesRead: (token: string, peerId: number) => request<void>(`/api/messages/${peerId}/read`, { method: "POST" }, token),
  unreadCounts: (token: string) => request<Array<{ senderId: number; count: number }>>("/api/messages/unread-counts", {}, token),
  markAllMessagesRead: (token: string) => request<void>("/api/messages/read-all", { method: "POST" }, token),
  mediaUrl: (path: string) => path.startsWith("http") ? path : `${API_URL}${path}`,
  uploadMedia: async (token: string, asset: { uri: string; name: string; mimeType: string; size: number }, onProgress?: (progress: number) => void, onCancelReady?: (cancel: () => void) => void) => {
    if (Platform.OS !== "web") {
      const task = FileSystem.createUploadTask(`${API_URL}/api/media`, asset.uri, { uploadType: FileSystem.FileSystemUploadType.MULTIPART, fieldName: "file", mimeType: asset.mimeType, headers: { Authorization: `Bearer ${token}` } }, ({ totalBytesSent, totalBytesExpectedToSend }) => onProgress?.(totalBytesExpectedToSend > 0 ? Math.min(1, totalBytesSent / totalBytesExpectedToSend) : 0));
      onCancelReady?.(() => { void task.cancelAsync(); });
      const result = await task.uploadAsync();
      if (!result) throw new Error("Tải tệp đã bị hủy trước khi hoàn tất");
      const body = JSON.parse(result.body || "{}") as ChatMedia & { message?: string; error?: string };
      if (result.status < 200 || result.status >= 300) throw new Error(body.message ?? body.error ?? "Không thể tải tệp lên máy chủ");
      onProgress?.(1);
      return { ...body, thumbnailUrl: body.thumbnailUrl ?? null } as ChatMedia;
    }
    const controller = new AbortController();
    onCancelReady?.(() => controller.abort());
    const form = new FormData();
    const file = Platform.OS === "web" ? await fetch(asset.uri).then((response) => response.blob()) : { uri: asset.uri, name: asset.name, type: asset.mimeType } as unknown as Blob;
    form.append("file", file, asset.name);
    const response = await fetch(`${API_URL}/api/media`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message ?? body.error ?? "Không thể tải tệp lên máy chủ");
    onProgress?.(1);
    return { ...body, thumbnailUrl: body.thumbnailUrl ?? null } as ChatMedia;
  },
  downloadMedia: async (media: ChatMedia) => {
    const url = mobileApi.mediaUrl(media.url);
    if (Platform.OS === "web") return Linking.openURL(url);
    const cleanName = media.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const result = await FileSystem.downloadAsync(url, `${FileSystem.cacheDirectory ?? ""}${Date.now()}-${cleanName}`);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri, { mimeType: media.mimeType, dialogTitle: "Lưu hoặc chia sẻ tệp" });
    return result.uri;
  },
  revokeMedia: (token: string, messageId: number) => request<MobileMessage>(`/api/messages/${messageId}/media`, { method: "DELETE" }, token),
  searchMessages: (token: string, query: string) => request<MessageSearchResult[]>(`/api/messages/search?q=${encodeURIComponent(query)}`, {}, token),
  readReceiptPreference: (token: string) => request<{ readReceiptsEnabled: boolean }>("/api/preferences", {}, token),
  setReadReceiptPreference: (token: string, enabled: boolean) => request<{ readReceiptsEnabled: boolean }>("/api/preferences/read-receipts", { method: "PUT", body: JSON.stringify({ enabled }) }, token),
  callHistory: (token: string) => request<CallHistoryEntry[]>("/api/calls", {}, token),
  registerPushToken: (token: string, pushToken: string, platform: "ios" | "android") => request<void>("/api/push-tokens", { method: "POST", body: JSON.stringify({ token: pushToken, platform }) }, token),
  iceConfig: (token: string) => request<IceConfig>("/api/webrtc/config", {}, token),
};
