import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Avatar } from "@/components/avatar";
import { IconSymbol, type IconSymbolName } from "@/components/ui/icon-symbol";
import { CURRENT_USER } from "@/lib/demo-data";

const rows: { icon: IconSymbolName; label: string; description: string }[] = [
  { icon: "lock.fill", label: "Quyền riêng tư", description: "Ai có thể tìm và gọi bạn" },
  { icon: "wifi", label: "Kết nối & cuộc gọi", description: "P2P ưu tiên · TURN dự phòng" },
  { icon: "bell.fill", label: "Thông báo", description: "Tin nhắn, cuộc gọi và lời mời" },
  { icon: "gearshape.fill", label: "Thiết lập", description: "Giao diện, ngôn ngữ và thiết bị" },
];

export default function ProfileScreen() {
  const [notice, setNotice] = useState("Sẵn sàng cho các cuộc trò chuyện an toàn.");
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.header}><Text style={styles.title}>Cá nhân</Text><Pressable onPress={() => setNotice("Đã mở tùy chọn tài khoản.")} style={({ pressed }) => [styles.moreButton, pressed && styles.pressed]}><IconSymbol name="ellipsis" size={23} color="#163252" /></Pressable></View>
      <View style={styles.profileCard}><Avatar participant={CURRENT_USER} size={72} showPresence={false} /><View style={styles.profileCopy}><Text style={styles.name}>Bạn</Text><Text style={styles.handle}>@ketnoi_user</Text><Pressable onPress={() => setNotice("Chỉnh sửa hồ sơ sẽ được bổ sung ở bước tiếp theo.")} style={({ pressed }) => [styles.edit, pressed && styles.pressed]}><Text style={styles.editText}>Chỉnh sửa hồ sơ</Text></Pressable></View></View>
      <View style={styles.statusCard}><View style={styles.statusIcon}><IconSymbol name="lock.fill" size={19} color="#1577E8" /></View><View style={styles.statusCopy}><Text style={styles.statusTitle}>Kết nối riêng tư</Text><Text style={styles.statusText}>{notice}</Text></View></View>
      <Text style={styles.sectionTitle}>Tài khoản & thiết lập</Text>
      <View style={styles.settingsCard}>{rows.map((row, index) => <Pressable key={row.label} onPress={() => setNotice(`Đã chọn ${row.label.toLocaleLowerCase("vi")}.`)} style={({ pressed }) => [styles.settingRow, index < rows.length - 1 && styles.divider, pressed && styles.pressed]}><View style={styles.settingIcon}><IconSymbol name={row.icon} size={20} color="#1577E8" /></View><View style={styles.settingCopy}><Text style={styles.settingLabel}>{row.label}</Text><Text style={styles.settingDescription}>{row.description}</Text></View><IconSymbol name="chevron.right" size={21} color="#A1ADBD" /></Pressable>)}</View>
      <View style={styles.footer}><IconSymbol name="heart.fill" size={15} color="#E5484D" /><Text style={styles.footerText}>Kết Nối · Phiên bản nền tảng</Text></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: "#F4F7FB" }, content: { padding: 16, paddingBottom: 28 }, header: { paddingTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, title: { fontSize: 29, lineHeight: 34, fontWeight: "800", letterSpacing: -0.9, color: "#0A284A" }, moreButton: { width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" }, profileCard: { marginTop: 18, padding: 17, borderRadius: 22, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", gap: 15, borderWidth: 1, borderColor: "#EAF0F6" }, profileCopy: { flex: 1 }, name: { color: "#163252", fontSize: 20, fontWeight: "800" }, handle: { color: "#7B8DA4", marginTop: 2, fontSize: 13 }, edit: { alignSelf: "flex-start", marginTop: 10, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 9, backgroundColor: "#E8F2FF" }, editText: { color: "#1577E8", fontSize: 12, fontWeight: "800" }, statusCard: { marginTop: 14, padding: 14, flexDirection: "row", gap: 12, borderRadius: 18, backgroundColor: "#EAF5FF", borderWidth: 1, borderColor: "#D9EBFC" }, statusIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#FFFFFF" }, statusCopy: { flex: 1 }, statusTitle: { color: "#163252", fontWeight: "800", fontSize: 13 }, statusText: { color: "#627892", marginTop: 3, fontSize: 12, lineHeight: 17 }, sectionTitle: { marginTop: 25, marginBottom: 8, color: "#112D4E", fontWeight: "800", fontSize: 16 }, settingsCard: { borderRadius: 20, backgroundColor: "#FFFFFF", overflow: "hidden", borderWidth: 1, borderColor: "#EAF0F6" }, settingRow: { minHeight: 71, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 12 }, divider: { borderBottomWidth: 1, borderBottomColor: "#E8EEF5" }, settingIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#E8F2FF" }, settingCopy: { flex: 1 }, settingLabel: { color: "#163252", fontWeight: "800", fontSize: 14 }, settingDescription: { marginTop: 3, color: "#7C8BA0", fontSize: 11 }, footer: { marginTop: 23, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6 }, footerText: { color: "#96A3B4", fontSize: 11 }, pressed: { opacity: 0.58 } });
