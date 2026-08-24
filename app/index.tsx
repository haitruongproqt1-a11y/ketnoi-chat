import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";

import { useMobileAuth } from "@/lib/auth-context";

export default function IndexRoute() {
  const { loading, token } = useMobileAuth();
  if (loading) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#1577E8" /></View>;
  if (token) return <Redirect href="/(tabs)" />;
  return <Redirect href="/auth" />;
}
