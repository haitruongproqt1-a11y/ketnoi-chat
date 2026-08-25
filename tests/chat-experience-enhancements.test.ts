import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const chatScreen = readFileSync(resolve(process.cwd(), "app/chat/[id].tsx"), "utf8");
const feedback = readFileSync(resolve(process.cwd(), "lib/sound-feedback.ts"), "utf8");
const service = readFileSync(resolve(process.cwd(), "server/mobile-call-service.ts"), "utf8");

describe("chat experience enhancements", () => {
  it("opens image attachments in a full-screen modal", () => {
    expect(chatScreen).toContain("fullScreenImage");
    expect(chatScreen).toContain("<Modal visible transparent animationType=\"fade\"");
    expect(chatScreen).toContain("Xem phóng to");
  });

  it("uses lightweight native haptic feedback for incoming messages and friend invitations", () => {
    expect(feedback).toContain("expo-haptics");
    expect(feedback).toContain("ImpactFeedbackStyle.Light");
    expect(feedback).toContain("Platform.OS !== \"web\"");
  });

  it("persists delete, recall and clear-history operations on the chat backend", () => {
    expect(service).toContain('"/api/conversations/:peerId/clear"');
    expect(service).toContain('app.delete("/api/messages/:messageId"');
    expect(service).toContain('"/api/messages/:messageId/recall"');
    expect(service).toContain("deletedForSenderAt");
    expect(service).toContain("clearedAt");
  });
});
