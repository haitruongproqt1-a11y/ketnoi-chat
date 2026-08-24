import { describe, expect, it } from "vitest";

import { createMobilePeerConfiguration, GOOGLE_PUBLIC_STUN } from "../lib/mobile-call-config";

describe("mobile WebRTC peer configuration", () => {
  it("keeps Google STUN plus authenticated TURN in the ICE list", () => {
    const configuration = createMobilePeerConfiguration({
      iceServers: [
        { urls: [GOOGLE_PUBLIC_STUN] },
        { urls: ["turn:turn.example.com:3478?transport=udp", "turns:turn.example.com:5349?transport=tcp"], username: "short-lived-user", credential: "short-lived-secret" },
      ],
    });
    expect(configuration.iceCandidatePoolSize).toBe(8);
    expect(configuration.iceServers[0].urls).toContain(GOOGLE_PUBLIC_STUN);
    expect(configuration.iceServers[1].credential).toBe("short-lived-secret");
  });

  it("rejects an empty ICE configuration", () => {
    expect(() => createMobilePeerConfiguration({ iceServers: [] })).toThrow("ICE configuration");
  });
});
