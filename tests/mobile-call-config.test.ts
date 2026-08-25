import { describe, expect, it } from "vitest";

import { createMobilePeerConfiguration, REQUIRED_ICE_SERVERS } from "../lib/mobile-call-config";

describe("mobile WebRTC peer configuration", () => {
  it("applies the required three Google STUN and two OpenRelay TURN entries", () => {
    const configuration = createMobilePeerConfiguration();
    expect(configuration.iceCandidatePoolSize).toBe(8);
    expect(configuration.iceServers).toEqual(REQUIRED_ICE_SERVERS);
    expect(configuration.iceServers.map((server) => server.urls[0])).toEqual([
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun2.l.google.com:19302",
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443?transport=tcp",
    ]);
    expect(configuration.iceServers[3]).toMatchObject({ username: "openrelayproject", credential: "openrelayproject" });
    expect(configuration.iceServers[4]).toMatchObject({ username: "openrelayproject", credential: "openrelayproject" });
  });
});
