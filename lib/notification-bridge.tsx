import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Platform } from "react-native";
import { useEffect } from "react";

import { presentIncomingSystemCall } from "./callkeep";
import { useMobileAuth } from "./auth-context";
import { mobileApi } from "./mobile-api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

type IncomingCallData = { type?: string; callId?: string; fromUserId?: number; callerName?: string; withVideo?: boolean; url?: string };

function getIncomingCall(data: unknown) {
  const value = data as IncomingCallData | undefined;
  const peerId = value?.fromUserId;
  if (value?.type !== "incoming_call" || !value.callId || typeof peerId !== "number" || !Number.isInteger(peerId)) return null;
  return { callId: value.callId, peerId, peerName: value.callerName || `Người dùng #${peerId}`, withVideo: Boolean(value.withVideo), direction: "incoming" as const, url: value.url };
}

async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === "web" || !Device.isDevice) return null;
  if (Platform.OS === "android") {
    await Promise.all([
      Notifications.setNotificationChannelAsync("messages", { name: "Tin nhắn", importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 200, 120, 200], lightColor: "#1577E8" }),
      Notifications.setNotificationChannelAsync("calls", { name: "Cuộc gọi đến", importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 350, 180, 350], lightColor: "#19A974", sound: "default", lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC }),
    ]);
  }
  await Notifications.setNotificationCategoryAsync("incoming-call", [
    { identifier: "answer", buttonTitle: "Nhận", options: { opensAppToForeground: true } },
    { identifier: "decline", buttonTitle: "Từ chối", options: { isDestructive: true } },
  ]);
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.status === "granted" ? existing : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return null;
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  return (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
}

export function NotificationBridge() {
  const { token } = useMobileAuth();
  const router = useRouter();

  useEffect(() => {
    if (!token) return;
    void getExpoPushToken().then((pushToken) => {
      if (pushToken && (Platform.OS === "ios" || Platform.OS === "android")) void mobileApi.registerPushToken(token, pushToken, Platform.OS);
    }).catch(() => undefined);
    const handleResponse = (response: Notifications.NotificationResponse) => {
      const call = getIncomingCall(response.notification.request.content.data);
      if (call) {
        if (response.actionIdentifier === "decline") {
          void mobileApi.declineCall(token, call.callId).catch(() => undefined);
          return;
        }
        const baseUrl = call.url ?? `/call?peerId=${call.peerId}&peerName=${encodeURIComponent(call.peerName)}&direction=incoming&mode=${call.withVideo ? "video" : "audio"}&callId=${call.callId}`;
        router.push(`${baseUrl}${response.actionIdentifier === "answer" ? "&autoAnswer=1" : ""}` as any);
        return;
      }
      const url = response.notification.request.content.data?.url;
      if (typeof url === "string" && url.startsWith("/")) router.push(url as any);
    };
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      const call = getIncomingCall(notification.request.content.data);
      if (call && Platform.OS !== "web") presentIncomingSystemCall(call);
    });
    void Notifications.getLastNotificationResponseAsync().then((response) => { if (response) handleResponse(response); });
    return () => { responseSubscription.remove(); receivedSubscription.remove(); };
  }, [router, token]);

  return null;
}
