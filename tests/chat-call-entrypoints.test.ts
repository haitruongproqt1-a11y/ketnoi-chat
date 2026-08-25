import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const chatSource = readFileSync(resolve(__dirname, "../app/chat/[id].tsx"), "utf8");
const nativeCallSource = readFileSync(resolve(__dirname, "../app/call.native.tsx"), "utf8");

describe("chat call entry points", () => {
  it("exposes separate voice, video and screen-share controls in the 1:1 header", () => {
    expect(chatSource).toContain('accessibilityLabel="Gọi thoại"');
    expect(chatSource).toContain('accessibilityLabel="Gọi video"');
    expect(chatSource).toContain('accessibilityLabel="Chia sẻ màn hình"');
    expect(chatSource).toContain('startScreenShare: "1"');
  });

  it("waits for a connected video call before requesting native screen capture", () => {
    expect(nativeCallSource).toContain('callState !== "connected"');
    expect(nativeCallSource).toContain('mediaDevices.getDisplayMedia');
  });
});
