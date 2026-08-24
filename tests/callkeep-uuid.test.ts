import { describe, expect, it } from "vitest";

import { toSystemCallUuid } from "../lib/call-id";

describe("CallKeep system UUID mapping", () => {
  it("uses the original identifier when the signaling call ID is already a UUID", () => {
    expect(toSystemCallUuid("A48BE54B-D5B6-4EE1-9BA0-111111111111")).toBe("a48be54b-d5b6-4ee1-9ba0-111111111111");
  });

  it("converts the app signaling ID into a stable CallKeep-compatible UUID", () => {
    const first = toSystemCallUuid("call-1724512345678-abcde");
    const second = toSystemCallUuid("call-1724512345678-abcde");
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
