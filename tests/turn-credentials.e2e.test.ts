import { describe, expect, it } from "vitest";

const baseUrl = process.env.KETNOI_CALL_TEST_URL ?? "http://127.0.0.1:3000";
const shouldRun = process.env.RUN_KETNOI_CALL_E2E === "true";

async function request<T>(path: string, options: RequestInit = {}, token?: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { message?: string }).message ?? `Request failed: ${response.status}`);
  return body as T;
}

describe.skipIf(!shouldRun)("TURN configuration endpoint", () => {
  it("returns the required OpenRelay UDP/TCP credentials through the protected ICE endpoint", async () => {
    const suffix = `turn${Date.now()}${Math.random().toString(36).slice(2, 7)}`.toLowerCase();
    const auth = await request<{ token: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: suffix, email: `${suffix}@example.test`, password: "ketnoi-test-password", secretQuestion: "favorite_color", secretAnswer: "xanh" }),
    });
    const ice = await request<{ iceServers: Array<{ urls: string[]; username?: string; credential?: string }> }>("/api/webrtc/config", {}, auth.token);
    expect(ice.iceServers.slice(3)).toEqual([
      { urls: ["turn:openrelay.metered.ca:80"], username: "openrelayproject", credential: "openrelayproject" },
      { urls: ["turn:openrelay.metered.ca:443?transport=tcp"], username: "openrelayproject", credential: "openrelayproject" },
    ]);
  }, 15_000);
});
