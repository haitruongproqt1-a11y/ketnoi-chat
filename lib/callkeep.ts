import { PermissionsAndroid, Platform } from "react-native";
import RNCallKeep, { CONSTANTS } from "react-native-callkeep";

import { toSystemCallUuid } from "./call-id";

export type SystemCall = {
  callId: string;
  peerId: number;
  peerName: string;
  withVideo: boolean;
  direction: "incoming" | "outgoing";
};

const activeCalls = new Map<string, SystemCall>();
let initialized = false;
let initialization: Promise<boolean> | null = null;

const options = {
  ios: {
    appName: "Kết Nối",
    handleType: "generic" as const,
    supportsVideo: true,
    maximumCallGroups: "1",
    maximumCallsPerCallGroup: "1",
    includesCallsInRecents: true,
  },
  android: {
    alertTitle: "Cho phép cuộc gọi Kết Nối",
    alertDescription: "Kết Nối cần quyền tài khoản điện thoại để hiển thị cuộc gọi đến trên hệ thống.",
    cancelButton: "Để sau",
    okButton: "Cho phép",
    additionalPermissions: [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE],
    foregroundService: {
      channelId: "ketnoi-calls",
      channelName: "Cuộc gọi Kết Nối",
      notificationTitle: "Cuộc gọi Kết Nối đang hoạt động",
    },
  },
};

export async function initializeCallKeep() {
  if (initialized || Platform.OS === "web") return true;
  if (!initialization) {
    initialization = RNCallKeep.setup(options)
      .then((ready) => {
        initialized = ready;
        if (ready) {
          RNCallKeep.setReachable();
          if (Platform.OS === "android") RNCallKeep.setAvailable(true);
        }
        return ready;
      })
      .finally(() => { initialization = null; });
  }
  return initialization;
}

export function presentIncomingSystemCall(call: SystemCall) {
  if (Platform.OS === "web") return;
  const callUuid = toSystemCallUuid(call.callId);
  if (activeCalls.has(callUuid)) return;
  activeCalls.set(callUuid, call);
  RNCallKeep.displayIncomingCall(callUuid, `@${call.peerId}`, call.peerName, "generic", call.withVideo, {
    ios: { supportsHolding: false, supportsDTMF: false, supportsGrouping: false, supportsUngrouping: false },
  });
}

export function presentOutgoingSystemCall(call: SystemCall) {
  if (Platform.OS === "web") return;
  const callUuid = toSystemCallUuid(call.callId);
  activeCalls.set(callUuid, call);
  RNCallKeep.startCall(callUuid, `@${call.peerId}`, call.peerName, "generic", call.withVideo);
  if (Platform.OS === "ios") RNCallKeep.reportConnectingOutgoingCallWithUUID(callUuid);
}

export function markSystemCallConnected(callId: string) {
  if (Platform.OS === "web") return;
  const callUuid = toSystemCallUuid(callId);
  if (Platform.OS === "ios") RNCallKeep.reportConnectedOutgoingCallWithUUID(callUuid);
  if (Platform.OS === "android") RNCallKeep.setCurrentCallActive(callUuid);
}

export function setSystemCallMuted(callId: string, muted: boolean) {
  if (Platform.OS !== "ios") return;
  RNCallKeep.setMutedCall(toSystemCallUuid(callId), muted);
}

export function setSystemCallSpeaker(callId: string, speakerOn: boolean) {
  if (Platform.OS === "android") RNCallKeep.toggleAudioRouteSpeaker(toSystemCallUuid(callId), speakerOn);
}

export function endSystemCall(callId: string, reason = CONSTANTS.END_CALL_REASONS.REMOTE_ENDED) {
  if (Platform.OS === "web") return;
  const callUuid = toSystemCallUuid(callId);
  activeCalls.delete(callUuid);
  RNCallKeep.reportEndCallWithUUID(callUuid, reason);
}

export function getSystemCall(callId: string) {
  return activeCalls.get(toSystemCallUuid(callId)) ?? null;
}

export function clearSystemCall(callId: string) {
  activeCalls.delete(toSystemCallUuid(callId));
}

export { RNCallKeep };
