import { describe, expect, it } from "vitest";

import { createCallId, isValidCallId } from "../lib/call-id";

describe("createCallId", () => {
  it("never includes the decimal point produced by Math.random().toString(36)", () => {
    const callId = createCallId(1_727_000_000_000, 0.123456789);
    expect(callId).not.toContain(".");
    expect(isValidCallId(callId)).toBe(true);
  });

  it("creates distinct valid IDs when the random seed changes", () => {
    expect(createCallId(10, 0.1)).not.toBe(createCallId(10, 0.2));
  });
});
