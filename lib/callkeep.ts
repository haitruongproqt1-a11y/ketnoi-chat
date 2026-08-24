import { PermissionsAndroid, Platform } from "react-native";
import RNCallKeep, { CONSTANTS } from "react-native-callkeep";

export type SystemCall = {
  callId: string;
  peerId: number;
  peerName: string;
  withVideo: boolean;
  direction: "incoming" | "outgoing";
};

const activeCalls = new Map<string, SystemCall>();
let initialized = false;

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
  initialized = await RNCallKeep.setup(options);
  RNCallKeep.setReachable();
  if (Platform.OS === "android") RNCallKeep.setAvailable(true);
  return initialized;
}

export function presentIncomingSystemCall(call: SystemCall) {
  if (Platform.OS === "web") return;
  activeCalls.set(call.callId, call);
  RNCallKeep.displayIncomingCall(call.callId, `@${call.peerId}`, call.peerName, "generic", call.withVideo, {
    ios: { supportsHolding: false, supportsDTMF: false, supportsGrouping: false, supportsUngrouping: false },
  });
}

export function presentOutgoingSystemCall(call: SystemCall) {
  if (Platform.OS === "web") return;
  activeCalls.set(call.callId, call);
  RNCallKeep.startCall(call.callId, `@${call.peerId}`, call.peerName, "generic", call.withVideo);
  if (Platform.OS === "ios") RNCallKeep.reportConnectingOutgoingCallWithUUID(call.callId);
}

export function markSystemCallConnected(callId: string) {
  if (Platform.OS === "web") return;
  if (Platform.OS === "ios") RNCallKeep.reportConnectedOutgoingCallWithUUID(callId);
  if (Platform.OS === "android") RNCallKeep.setCurrentCallActive(callId);
}

export function setSystemCallMuted(callId: string, muted: boolean) {
  if (Platform.OS === "web") return;
  RNCallKeep.setMutedCall(callId, muted);
}

export function setSystemCallSpeaker(callId: string, speakerOn: boolean) {
  if (Platform.OS === "android") RNCallKeep.toggleAudioRouteSpeaker(callId, speakerOn);
}

export function endSystemCall(callId: string, reason = CONSTANTS.END_CALL_REASONS.REMOTE_ENDED) {
  if (Platform.OS === "web") return;
  activeCalls.delete(callId);
  RNCallKeep.reportEndCallWithUUID(callId, reason);
}

export function getSystemCall(callId: string) {
  return activeCalls.get(callId) ?? null;
}

export function clearSystemCall(callId: string) {
  activeCalls.delete(callId);
}

export { RNCallKeep };
