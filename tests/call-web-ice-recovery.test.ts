import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webCallSource = readFileSync(resolve(process.cwd(), "app/call.tsx"), "utf8");
const nativeCallSource = readFileSync(resolve(process.cwd(), "app/call.native.tsx"), "utf8");

describe("WebRTC call ICE recovery integration", () => {
  it("uses authenticated backend ICE configuration on both call surfaces", () => {
    expect(webCallSource).toContain("const iceConfig = await mobileApi.iceConfig(token);");
    expect(nativeCallSource).toContain("const iceConfig = await mobileApi.iceConfig(token);");
    expect(webCallSource).toContain("iceServers: iceConfig.iceServers");
    expect(nativeCallSource).toContain("iceServers: iceConfig.iceServers");
  });

  it("restarts ICE from disconnected or failed state and exchanges restart SDP", () => {
    for (const source of [webCallSource, nativeCallSource]) {
      expect(source).toContain('peer.oniceconnectionstatechange = observeIceConnection;');
      expect(source).toContain('if (!["disconnected", "failed"].includes(state)) return;');
      expect(source).toContain("createOffer({ iceRestart: true }");
      expect(source).toContain("iceRestart: true");
      expect(source).toContain("MAX_ICE_RESTART_ATTEMPTS");
    }
  });

  it("queues candidates until a remote description exists and answers restart offers", () => {
    for (const source of [webCallSource, nativeCallSource]) {
      expect(source).toContain("else candidatesRef.current.push(payload.candidate)");
      expect(source).toContain('event === "call:offer" && payload.iceRestart');
      expect(source).toContain('event === "call:answer" && payload.description');
      expect(source).toContain('event === "call:ice-candidate" && payload.candidate');
    }
  });
});
