import { Platform } from "react-native";

/**
 * Đặt EXPO_PUBLIC_API_URL và EXPO_PUBLIC_SOCKET_URL khi phát triển với server Node.js.
 * Android emulator mặc định dùng 10.0.2.2; thiết bị thật cần IP LAN hoặc HTTPS công khai.
 */
const localHost = Platform.OS === "android" ? "http://10.0.2.2:3001" : "http://127.0.0.1:3001";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? localHost;
export const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL ?? API_URL;

export type MobileUser = { id: number; username: string; displayName: string; createdAt: string };
export type AuthPayload = { token: string; user: MobileUser };
export type MobileMessage = { id: number; senderId: number; recipientId: number; body: string; createdAt: string };
export type IceConfig = { iceServers: Array<{ urls: string[]; username?: string; credential?: string }> };

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
  register: (username: string, displayName: string, password: string) => request<AuthPayload>("/api/auth/register", { method: "POST", body: JSON.stringify({ username, displayName, password }) }),
  friends: (token: string) => request<MobileUser[]>("/api/friends", {}, token),
  messages: (token: string, peerId: number) => request<MobileMessage[]>(`/api/messages/${peerId}`, {}, token),
  iceConfig: (token: string) => request<IceConfig>("/api/webrtc/config", {}, token),
};
