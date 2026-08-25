import { describe, expect, it } from "vitest";

import { MAX_ICE_RESTART_ATTEMPTS, shouldStartIceRestart } from "../lib/call-ice-recovery";

describe("ICE recovery policy", () => {
  it("lets the offerer retry disconnected and failed ICE connections with a bounded attempt count", () => {
    expect(shouldStartIceRestart("disconnected", 0, true)).toBe(true);
    expect(shouldStartIceRestart("failed", 1, true)).toBe(true);
    expect(shouldStartIceRestart("failed", MAX_ICE_RESTART_ATTEMPTS, true)).toBe(false);
  });

  it("does not create glare from the answerer or restart a healthy connection", () => {
    expect(shouldStartIceRestart("connected", 0, true)).toBe(false);
    expect(shouldStartIceRestart("disconnected", 0, false)).toBe(false);
  });
});
