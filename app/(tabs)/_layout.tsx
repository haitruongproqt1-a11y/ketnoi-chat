import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 10 : Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#1577E8",
        tabBarInactiveTintColor: "#738299",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginTop: 2 },
        tabBarStyle: { height: 58 + bottomPadding, paddingTop: 7, paddingBottom: bottomPadding, borderTopColor: "#E6EDF5", backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Tin nhắn", tabBarIcon: ({ color }) => <IconSymbol name="message.fill" size={23} color={color} /> }} />
      <Tabs.Screen name="contacts" options={{ title: "Danh bạ", tabBarIcon: ({ color }) => <IconSymbol name="person.2.fill" size={24} color={color} /> }} />
      <Tabs.Screen name="calls" options={{ title: "Nhật ký", tabBarIcon: ({ color }) => <IconSymbol name="phone.fill" size={23} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Cá nhân", tabBarIcon: ({ color }) => <IconSymbol name="person.crop.circle" size={25} color={color} /> }} />
    </Tabs>
  );
}
