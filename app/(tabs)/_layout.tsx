import { Tabs } from "expo-router";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useMobileSocket } from "@/lib/socket-context";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { pendingFriendRequestCount } = useMobileSocket();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 14);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#1577E8",
        tabBarInactiveTintColor: "#738299",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", marginTop: 3 },
        tabBarStyle: { height: 60 + bottomPadding, paddingTop: 8, paddingBottom: bottomPadding, borderTopColor: "#E6EDF5", borderTopWidth: 1, backgroundColor: colors.background, elevation: 12, shadowColor: "#153150", shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: -4 } },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Tin nhắn", tabBarIcon: ({ color }) => <IconSymbol name="message.fill" size={23} color={color} /> }} />
      <Tabs.Screen name="contacts" options={{ title: "Danh bạ", tabBarIcon: ({ color }) => <View><IconSymbol name="person.2.fill" size={24} color={color} />{pendingFriendRequestCount > 0 ? <View style={{ position: "absolute", right: -5, top: -4, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: colors.background, backgroundColor: "#E5484D" }} /> : null}</View> }} />
      <Tabs.Screen name="calls" options={{ title: "Nhật ký", tabBarIcon: ({ color }) => <IconSymbol name="phone.fill" size={23} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Cá nhân", tabBarIcon: ({ color }) => <IconSymbol name="person.crop.circle" size={25} color={color} /> }} />
    </Tabs>
  );
}
