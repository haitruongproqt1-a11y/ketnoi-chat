import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

function lightFeedback() {
  if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

export function playIncomingMessageTone() { lightFeedback(); }
export function playFriendRequestFeedback() { lightFeedback(); }
export function startIncomingRingtone() {}
export function stopIncomingRingtone() {}
export function startCallWaitingTone() {}
export function stopCallWaitingTone() {}
