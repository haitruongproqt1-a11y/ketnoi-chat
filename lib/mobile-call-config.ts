import type { IceConfig } from "./mobile-api";

export const GOOGLE_PUBLIC_STUN = "stun:stun.l.google.com:19302";

export function createMobilePeerConfiguration(ice: IceConfig) {
  if (!ice.iceServers.length || !ice.iceServers.some((server) => server.urls.length > 0)) {
    throw new Error("ICE configuration must contain at least one STUN or TURN URL");
  }
  return {
    iceServers: ice.iceServers,
    iceCandidatePoolSize: 8,
    bundlePolicy: "max-bundle" as const,
    rtcpMuxPolicy: "require" as const,
  };
}
