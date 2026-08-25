import { describe, expect, it } from "vitest";

const apiUrl = process.env.EXPO_PUBLIC_API_URL;

describe("public authentication endpoint", () => {
  it("uses the configured public API URL and reaches health", async () => {
    expect(apiUrl).toMatch(/^https:\/\//);
    const response = await fetch(`${apiUrl}/health`);
    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });
});
