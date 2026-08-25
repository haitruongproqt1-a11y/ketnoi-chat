import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const callsScreen = readFileSync(resolve(process.cwd(), "app/(tabs)/calls.tsx"), "utf8");
const service = readFileSync(resolve(process.cwd(), "server/mobile-call-service.ts"), "utf8");

describe("call history safety", () => {
  it("formats ISO timestamps without appending a duplicate timezone suffix", () => {
    expect(callsScreen).toContain("function formatDate(value: string | null | undefined)");
    expect(callsScreen).not.toContain("new Date(`${value}Z`)");
    expect(callsScreen).toContain('"Không rõ thời gian"');
  });

  it("persists one call event message when a call completes", () => {
    expect(service).toContain("saveCallHistoryMessage");
    expect(service).toContain("__ketnoi_call:");
    expect(service).toContain("callEvent");
    expect(service).toContain('emit("chat:new", message)');
  });
});
