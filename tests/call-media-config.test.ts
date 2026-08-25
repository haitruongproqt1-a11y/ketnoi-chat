import { describe, expect, it } from "vitest";

import { createMobileMediaConstraints } from "../lib/call-media-config";

describe("createMobileMediaConstraints", () => {
  it("does not request a camera for voice calls", () => {
    expect(createMobileMediaConstraints(false)).toEqual({ audio: true, video: false });
  });

  it("requests the front camera with bounded mobile video settings", () => {
    expect(createMobileMediaConstraints(true)).toEqual({
      audio: true,
      video: {
        facingMode: "user",
        frameRate: { ideal: 24, max: 30 },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  });
});
