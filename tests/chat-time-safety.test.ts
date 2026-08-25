import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const chatSource = readFileSync(resolve(process.cwd(), "app/chat/[id].tsx"), "utf8");

describe("chat time safety", () => {
  it("formats ISO timestamps without adding a second timezone suffix", () => {
    expect(chatSource).toContain("function formatMessageTime");
    expect(chatSource).toContain("formatMessageTime(message.createdAt)");
    expect(chatSource).not.toContain("new Date(`${message.createdAt}Z`)");
  });

  it("uses a harmless fallback when a message timestamp is missing or invalid", () => {
    expect(chatSource).toContain('return date && !Number.isNaN(date.getTime())');
    expect(chatSource).toContain('"--:--"');
  });
});
