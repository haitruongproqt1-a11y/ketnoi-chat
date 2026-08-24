import { Pressable, StyleSheet, View } from "react-native";

import { haptic } from "@/lib/haptics";
import { IconSymbol, type IconSymbolName } from "@/components/ui/icon-symbol";

export function IconButton({ name, onPress, color = "#0A284A", size = 22, background = "transparent", accessibilityLabel }: { name: IconSymbolName; onPress: () => void; color?: string; size?: number; background?: string; accessibilityLabel: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => { haptic.light(); onPress(); }}
      style={({ pressed }) => [styles.button, { backgroundColor: background, opacity: pressed ? 0.58 : 1 }]}
    >
      <View pointerEvents="none"><IconSymbol name={name} size={size} color={color} /></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({ button: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" } });
