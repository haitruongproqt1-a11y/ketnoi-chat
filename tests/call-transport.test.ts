import { describe, expect, it } from "vitest";

import { createPeerConnectionConfiguration, getCallRuntimeLabel, REQUIRED_SIGNALING_EVENTS } from "../lib/call-transport";

describe("call transport contract", () => {
  const ice = {
    expiresAt: "2030-08-24T10:00:00.000Z",
    iceServers: [
      { urls: ["stun:stun.example.net:3478"] },
      { urls: ["turn:turn-ap-southeast.example.net:3478?transport=udp"], username: "expires:user", credential: "signature" },
    ],
  };

  it("produces a bundle-only PeerConnection configuration from valid short-lived ICE", () => {
    expect(createPeerConnectionConfiguration(ice, Date.parse("2030-08-24T09:55:00.000Z"))).toMatchObject({
      iceCandidatePoolSize: 8,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });
  });

  it("documents all necessary signaling event categories and transparent preview label", () => {
    expect(REQUIRED_SIGNALING_EVENTS).toContain("call:screen-share");
    expect(getCallRuntimeLabel(false)).toContain("Bản xem trước");
  });
});
