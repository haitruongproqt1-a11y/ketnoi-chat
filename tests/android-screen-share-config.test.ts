import { describe, expect, it } from "vitest";

import { createAndroidScreenShareConstraints } from "../lib/android-screen-share-config";

describe("createAndroidScreenShareConstraints", () => {
  it("requests video-only MediaProjection at a mobile-friendly scale", () => {
    expect(createAndroidScreenShareConstraints()).toEqual({
      audio: false,
      video: true,
      android: {
        createConfigForDefaultDisplay: true,
        resolutionScale: 0.75,
      },
    });
  });
});
