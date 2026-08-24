import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { Avatar } from "@/components/avatar";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useMobileAuth } from "@/lib/auth-context";
import { mobileApi, type MobileUser } from "@/lib/mobile-api";
import { useMobileSocket } from "@/lib/socket-context";

export default function ContactsScreen() {
  const { token } = useMobileAuth();
  const { onlineIds } = useMobileSocket();
  const [friends, setFriends] = useState<MobileUser[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { if (!token) return; setLoading(true); try { setFriends(await mobileApi.friends(token)); } finally { setLoading(false); } }, [token]);
  useEffect(() => { void load(); }, [load]);
  return <ScreenContainer containerClassName="bg-[#F4F7FB]" className="flex-1"><FlatList data={friends} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.list} ListHeaderComponent={<View style={styles.header}><Text style={styles.title}>Danh bạ</Text><Text style={styles.subtitle}>Chọn liên hệ để nhắn tin hoặc gọi ngay</Text></View>} ListEmptyComponent={loading ? <View style={styles.empty}><ActivityIndicator color="#1577E8" /></View> : <Text style={styles.emptyText}>Chưa có người dùng nào khác.</Text>} renderItem={({ item }) => { const online = onlineIds.includes(item.id); return <Pressable onPress={() => router.push({ pathname: "/chat/[id]", params: { id: String(item.id) } })} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><Avatar participant={{ id: String(item.id), name: item.displayName, initials: item.displayName.split(" ").map((word) => word[0]).slice(0, 2).join(""), avatarColor: ["#8A63D2", "#D35D77", "#2F9E8F", "#3269C6"][item.id % 4], presence: online ? "online" : "offline" }} size={53} /><View style={styles.copy}><Text style={styles.name}>{item.displayName}</Text><Text style={[styles.status, online && styles.online]}>{online ? "Đang hoạt động" : `@${item.username}`}</Text></View><View style={styles.action}><IconSymbol name="message.fill" size={19} color="#1577E8" /></View></Pressable>; }} /></ScreenContainer>;
}

const styles = StyleSheet.create({ list: { paddingHorizontal: 16, paddingBottom: 24 }, header: { paddingTop: 10, paddingBottom: 15 }, title: { fontSize: 29, fontWeight: "900", lineHeight: 34, letterSpacing: -0.9, color: "#0A284A" }, subtitle: { marginTop: 4, color: "#71839A", fontSize: 12 }, row: { flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 13, borderBottomColor: "#E3EBF4", borderBottomWidth: 1 }, copy: { flex: 1 }, name: { color: "#153150", fontWeight: "800", fontSize: 16 }, status: { marginTop: 3, color: "#8090A4", fontSize: 12 }, online: { color: "#198A68", fontWeight: "600" }, action: { width: 39, height: 39, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#E8F2FF" }, empty: { paddingTop: 60 }, emptyText: { color: "#8190A2", textAlign: "center", paddingTop: 52 }, pressed: { opacity: 0.6 } });
