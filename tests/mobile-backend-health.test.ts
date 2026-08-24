import { describe, expect, it } from "vitest";

describe("mobile backend environment", () => {
  it("reaches the configured API health endpoint", async () => {
    const baseUrl = process.env.EXPO_PUBLIC_API_URL;
    expect(baseUrl, "EXPO_PUBLIC_API_URL must be configured").toBeTruthy();

    const response = await fetch(`${baseUrl!.replace(/\/$/, "")}/health`);
    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  }, 15_000);
});
