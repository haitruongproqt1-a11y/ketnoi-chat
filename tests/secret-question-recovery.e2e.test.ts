import { describe, expect, it } from "vitest";

const baseUrl = process.env.KETNOI_CALL_TEST_URL ?? "http://127.0.0.1:3000";
const shouldRun = process.env.RUN_KETNOI_CALL_E2E === "true";

async function request(path: string, body: Record<string, string>) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!shouldRun)("secret-question password recovery", () => {
  it("registers, reveals the selected question, resets the password, and allows a new login", async () => {
    const username = `recovery${Date.now()}${Math.random().toString(36).slice(2, 7)}`.toLowerCase();
    const email = `${username}@example.test`;
    const originalPassword = "ketnoi-original-password";
    const newPassword = "ketnoi-recovered-password";

    const registration = await request("/api/auth/register", { username, password: originalPassword, email, secretQuestion: "favorite_food", secretAnswer: "Bánh mì" });
    expect(registration.status).toBe(201);

    const question = await request("/api/auth/recovery-question", { username });
    expect(question.status).toBe(200);
    await expect(question.json()).resolves.toEqual({ question: "Bạn thích món nào nhất?" });

    const reset = await request("/api/auth/reset-password", { username, secretAnswer: "banh   mi", newPassword });
    expect(reset.status).toBe(204);

    const oldLogin = await request("/api/auth/login", { username, password: originalPassword });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request("/api/auth/login", { username, password: newPassword });
    expect(newLogin.status).toBe(200);
  });
});
