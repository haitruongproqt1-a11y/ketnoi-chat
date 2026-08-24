import type { IceConfigurationPayload, IceServerDescriptor } from "@/shared/chat-types";

/**
 * Chỉ là bản hợp đồng client-side. Thông tin TURN thật phải được backend cấp
 * ngắn hạn cho từng phiên gọi, không đóng gói credential tĩnh trong ứng dụng.
 */
export const TURN_CONFIGURATION_CONTRACT = {
  endpoint: "/api/trpc/calls.iceConfig",
  credentialLifetimeSeconds: 600,
  supportedTransports: ["udp", "tcp", "tls"] as const,
  regions: ["ap-southeast", "ap-east", "eu-central", "us-west"] as const,
};

export function validateIceConfiguration(config: IceConfigurationPayload): boolean {
  if (!config.expiresAt || Number.isNaN(Date.parse(config.expiresAt))) return false;

  return config.iceServers.every((server: IceServerDescriptor) => {
    const hasUsableUrl = server.urls.some((url) => /^(stun:|turn:|turns:)/.test(url));
    const isTurnServer = server.urls.some((url) => /^(turn:|turns:)/.test(url));
    const hasTurnCredentials = !isTurnServer || Boolean(server.username && server.credential);
    return hasUsableUrl && hasTurnCredentials;
  });
}

export function isExpiredIceConfiguration(config: IceConfigurationPayload, now = Date.now()): boolean {
  return Date.parse(config.expiresAt) <= now;
}
