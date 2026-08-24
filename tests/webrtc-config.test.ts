import { describe, expect, it } from "vitest";

import {
  isExpiredIceConfiguration,
  TURN_CONFIGURATION_CONTRACT,
  validateIceConfiguration,
} from "../lib/webrtc-config";

describe("TURN configuration contract", () => {
  it("accepts a short-lived multi-transport TURN configuration", () => {
    const config = {
      expiresAt: "2030-08-24T10:00:00.000Z",
      iceServers: [
        { urls: ["stun:stun.example.net:3478"] },
        {
          urls: [
            "turn:turn-ap-southeast.example.net:3478?transport=udp",
            "turn:turn-ap-southeast.example.net:3478?transport=tcp",
            "turns:turn-ap-southeast.example.net:5349?transport=tcp",
          ],
          username: "1735689600:user-42",
          credential: "signed-credential",
        },
      ],
    };

    expect(validateIceConfiguration(config)).toBe(true);
    expect(isExpiredIceConfiguration(config, Date.parse("2030-08-24T09:55:00.000Z"))).toBe(false);
    expect(TURN_CONFIGURATION_CONTRACT.supportedTransports).toEqual(["udp", "tcp", "tls"]);
  });

  it("rejects TURN endpoints without credentials or expired credentials", () => {
    const missingCredential = {
      expiresAt: "2030-08-24T10:00:00.000Z",
      iceServers: [{ urls: ["turn:turn.example.net:3478?transport=udp"] }],
    };

    expect(validateIceConfiguration(missingCredential)).toBe(false);
    expect(isExpiredIceConfiguration({ ...missingCredential, iceServers: [] }, Date.parse("2030-08-24T11:00:00.000Z"))).toBe(true);
  });
});
