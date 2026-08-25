import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("keeps Android MediaProjection permissions and the WebRTC foreground-service option", () => {
    const plugin = readFileSync(resolve(__dirname, "../plugins/with-ketnoi-android-permissions.cjs"), "utf8");
    expect(plugin).toContain("android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION");
    expect(plugin).toContain("android.permission.FOREGROUND_SERVICE_CAMERA");
    expect(plugin).toContain("android.permission.FOREGROUND_SERVICE_MICROPHONE");
    expect(plugin).toContain("enableMediaProjectionService = true");
  });
});
