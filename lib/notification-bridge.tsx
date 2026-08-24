import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Platform } from "react-native";
import { useEffect } from "react";

import { useMobileAuth } from "./auth-context";
import { mobileApi } from "./mobile-api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === "web" || !Device.isDevice) return null;
  if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("messages", { name: "Tin nhắn", importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 200, 120, 200], lightColor: "#1577E8" });
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.status === "granted" ? existing : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return null;
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return null;
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

export function NotificationBridge() {
  const { token } = useMobileAuth();
  const router = useRouter();

  useEffect(() => {
    if (!token) return;
    void getExpoPushToken().then((pushToken) => {
      if (pushToken && (Platform.OS === "ios" || Platform.OS === "android")) void mobileApi.registerPushToken(token, pushToken, Platform.OS);
    }).catch(() => undefined);
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === "string" && url.startsWith("/")) router.push(url as any);
    });
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === "string" && url.startsWith("/")) router.push(url as any);
    });
    return () => responseSubscription.remove();
  }, [router, token]);
  return null;
}
