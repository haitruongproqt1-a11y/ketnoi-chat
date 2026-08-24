import { describe, expect, it } from "vitest";

const baseUrl = process.env.KETNOI_CALL_TEST_URL ?? "http://127.0.0.1:3000";

async function request<T>(path: string, options: RequestInit = {}, token?: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { message?: string }).message ?? `Request failed: ${response.status}`);
  return body as T;
}

describe("TURN credentials", () => {
  it("returns the configured authenticated TURN relay through the protected ICE endpoint", async () => {
    const suffix = `turn${Date.now()}${Math.random().toString(36).slice(2, 7)}`.toLowerCase();
    const auth = await request<{ token: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: suffix, displayName: "Kiểm thử TURN", password: "ketnoi-test-password" }),
    });
    const ice = await request<{ iceServers: Array<{ urls: string[]; username?: string; credential?: string }> }>("/api/webrtc/config", {}, auth.token);
    const turn = ice.iceServers.find((server) => server.urls.some((url) => url.startsWith("turn:")));

    expect(turn).toBeDefined();
    expect(turn?.username).toBeTruthy();
    expect(turn?.credential).toBeTruthy();
  }, 15_000);
});
