import type { CallKind, IceConfigurationPayload } from "@/shared/chat-types";

import { isExpiredIceConfiguration, validateIceConfiguration } from "./webrtc-config";

export type SignalingEventName = "call:offer" | "call:answer" | "call:ice-candidate" | "call:hangup" | "call:screen-share";

export interface CallLaunchRequest {
  callId: string;
  peerId: string;
  kind: CallKind;
  wantsScreenShare: boolean;
}

export interface PeerConnectionConfiguration {
  iceServers: IceConfigurationPayload["iceServers"];
  iceCandidatePoolSize: number;
  bundlePolicy: "max-bundle";
  rtcpMuxPolicy: "require";
}

/**
 * Chuyển payload ICE có TTL từ API thành cấu hình chuẩn để truyền vào
 * RTCPeerConnection trong development build có mô-đun WebRTC native.
 */
export function createPeerConnectionConfiguration(ice: IceConfigurationPayload, now = Date.now()): PeerConnectionConfiguration {
  if (!validateIceConfiguration(ice) || isExpiredIceConfiguration(ice, now)) {
    throw new Error("ICE configuration is invalid or expired");
  }

  return {
    iceServers: ice.iceServers,
    iceCandidatePoolSize: 8,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  };
}

export function getCallRuntimeLabel(nativeMediaAvailable: boolean): string {
  return nativeMediaAvailable ? "Đang thiết lập WebRTC P2P…" : "Bản xem trước luồng WebRTC P2P";
}

export const REQUIRED_SIGNALING_EVENTS: SignalingEventName[] = [
  "call:offer",
  "call:answer",
  "call:ice-candidate",
  "call:hangup",
  "call:screen-share",
];
