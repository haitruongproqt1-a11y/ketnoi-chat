import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { Avatar } from "@/components/avatar";
import { IconButton } from "@/components/icon-button";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CALL_LOGS } from "@/lib/demo-data";

export default function CallsScreen() {
  return (
    <ScreenContainer containerClassName="bg-[#F4F7FB]" className="flex-1">
      <FlatList
        data={CALL_LOGS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<View><View style={styles.header}><View><Text style={styles.title}>Nhật ký</Text><Text style={styles.subTitle}>Cuộc gọi được bảo vệ bằng P2P</Text></View><View style={styles.shield}><IconSymbol name="lock.fill" size={16} color="#1577E8" /><Text style={styles.shieldText}>P2P</Text></View></View><View style={styles.summary}><View style={styles.summaryIcon}><IconSymbol name="phone.fill" size={21} color="#1577E8" /></View><View><Text style={styles.summaryTitle}>Gọi trực tiếp khi có thể</Text><Text style={styles.summaryCopy}>TURN là lớp dự phòng khi mạng chặn kết nối trực tiếp.</Text></View></View><Text style={styles.sectionTitle}>Gần đây</Text></View>}
        renderItem={({ item }) => <Pressable onPress={() => router.push({ pathname: "/call", params: { peerId: item.participant.id, mode: item.kind } })} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><Avatar participant={item.participant} size={52} /><View style={styles.rowCopy}><View style={styles.nameLine}><Text style={[styles.name, item.direction === "missed" && styles.missed]}>{item.participant.name}</Text><IconSymbol name={item.kind === "video" ? "video.fill" : "phone.fill"} size={15} color={item.direction === "missed" ? "#E5484D" : "#7D8EA5"} /></View><Text style={[styles.meta, item.direction === "missed" && styles.missed]}>{item.direction === "missed" ? "Cuộc gọi nhỡ" : item.direction === "incoming" ? "Cuộc gọi đến" : "Cuộc gọi đi"} · {item.occurredAtLabel}</Text>{item.durationLabel ? <Text style={styles.duration}>{item.durationLabel}</Text> : null}</View><IconButton name="phone.fill" onPress={() => router.push({ pathname: "/call", params: { peerId: item.participant.id, mode: item.kind } })} accessibilityLabel={`Gọi lại cho ${item.participant.name}`} background="#E8F2FF" color="#1577E8" size={19} /></Pressable>}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ list: { paddingHorizontal: 16, paddingBottom: 22 }, header: { paddingTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, title: { fontSize: 29, lineHeight: 34, fontWeight: "800", letterSpacing: -0.9, color: "#0A284A" }, subTitle: { marginTop: 2, color: "#708096", fontSize: 12 }, shield: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 7, flexDirection: "row", gap: 4, alignItems: "center", backgroundColor: "#E8F2FF" }, shieldText: { color: "#1577E8", fontSize: 11, fontWeight: "800" }, summary: { marginTop: 20, padding: 14, borderRadius: 18, backgroundColor: "#FFFFFF", flexDirection: "row", gap: 12, borderWidth: 1, borderColor: "#EAF0F6" }, summaryIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: "#E8F2FF", alignItems: "center", justifyContent: "center" }, summaryTitle: { color: "#163252", fontSize: 14, fontWeight: "800" }, summaryCopy: { color: "#74859B", marginTop: 3, maxWidth: 250, fontSize: 11, lineHeight: 16 }, sectionTitle: { marginTop: 24, marginBottom: 6, fontSize: 16, fontWeight: "800", color: "#112D4E" }, row: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#E5ECF4" }, rowCopy: { flex: 1 }, nameLine: { flexDirection: "row", alignItems: "center", gap: 6 }, name: { fontSize: 16, fontWeight: "700", color: "#163252" }, meta: { marginTop: 4, fontSize: 12, color: "#7B8DA4" }, duration: { fontSize: 11, color: "#A0ACBC", marginTop: 2 }, missed: { color: "#E5484D" }, pressed: { opacity: 0.58 } });
