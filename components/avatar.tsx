import { StyleSheet, Text, View } from "react-native";

import type { ChatParticipant } from "@/shared/chat-types";

export function Avatar({ participant, size = 48, showPresence = true }: { participant: ChatParticipant; size?: number; showPresence?: boolean }) {
  const indicatorSize = Math.max(10, Math.round(size * 0.25));
  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: participant.avatarColor }]}>
        <Text style={[styles.initials, { fontSize: Math.max(12, size * 0.29) }]}>{participant.initials}</Text>
      </View>
      {showPresence && participant.presence !== "offline" ? (
        <View
          style={[
            styles.presence,
            { width: indicatorSize, height: indicatorSize, borderRadius: indicatorSize / 2, backgroundColor: participant.presence === "online" ? "#19A974" : "#E6A23C" },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center" },
  initials: { color: "#FFFFFF", fontWeight: "800", letterSpacing: -0.3 },
  presence: { position: "absolute", right: -1, bottom: -1, borderWidth: 2, borderColor: "#FFFFFF" },
});
