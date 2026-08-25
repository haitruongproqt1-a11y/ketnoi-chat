export const REQUIRED_ICE_SERVERS = [
  { urls: ["stun:stun.l.google.com:19302"] },
  { urls: ["stun:stun1.l.google.com:19302"] },
  { urls: ["stun:stun2.l.google.com:19302"] },
  {
    urls: ["turn:openrelay.metered.ca:80"],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: ["turn:openrelay.metered.ca:443?transport=tcp"],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
] as const;

export function createMobilePeerConfiguration() {
  return {
    iceServers: REQUIRED_ICE_SERVERS.map((server) => ({ ...server, urls: [...server.urls] })),
    iceCandidatePoolSize: 8,
    bundlePolicy: "max-bundle" as const,
    rtcpMuxPolicy: "require" as const,
  };
}
