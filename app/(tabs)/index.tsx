import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import { Avatar } from "@/components/avatar";
import { IconButton } from "@/components/icon-button";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useMobileAuth } from "@/lib/auth-context";
import { mobileApi, type MobileUser } from "@/lib/mobile-api";
import { useMobileSocket } from "@/lib/socket-context";

export default function ConversationsScreen() {
  const { token, user } = useMobileAuth();
  const { onlineIds, lastMessage } = useMobileSocket();
  const [friends, setFriends] = useState<MobileUser[]>([]);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const loadFriends = useCallback(async () => {
    if (!token) return;
    try { setError(""); setFriends(await mobileApi.friends(token)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không tải được danh sách bạn bè."); }
  }, [token]);
  useEffect(() => { void loadFriends(); }, [loadFriends]);
  const visible = useMemo(() => friends.filter((friend) => friend.displayName.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi"))), [friends, query]);
  const refresh = async () => { setRefreshing(true); await loadFriends(); setRefreshing(false); };

  return <ScreenContainer containerClassName="bg-[#F4F7FB]" className="flex-1"><FlatList data={visible} keyExtractor={(item) => String(item.id)} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#1577E8" />} contentContainerStyle={styles.list} ListHeaderComponent={<View><View style={styles.header}><View><Text style={styles.title}>Tin nhắn</Text><Text style={styles.subtitle}>{friends.filter((friend) => onlineIds.includes(friend.id)).length} người đang trực tuyến</Text></View><IconButton name="person.badge.plus" onPress={() => router.push("/(tabs)/contacts")} accessibilityLabel="Danh bạ" background="#1577E8" color="#FFFFFF" /></View><View style={styles.search}><IconSymbol name="magnifyingglass" size={20} color="#74849A" /><TextInput value={query} onChangeText={setQuery} placeholder="Tìm bạn bè" placeholderTextColor="#8997A9" style={styles.searchInput} returnKeyType="search" /></View>{error ? <Text style={styles.error}>{error}</Text> : null}<Text style={styles.sectionLabel}>Cuộc trò chuyện</Text></View>} ListEmptyComponent={friends.length === 0 && !error ? <View style={styles.empty}><ActivityIndicator color="#1577E8" /><Text style={styles.emptyText}>Chưa có người dùng khác. Hãy tạo thêm một tài khoản để bắt đầu.</Text></View> : null} renderItem={({ item }) => { const online = onlineIds.includes(item.id); const hasNew = lastMessage && (lastMessage.senderId === item.id || lastMessage.recipientId === item.id); return <Pressable onPress={() => router.push({ pathname: "/chat/[id]", params: { id: String(item.id) } })} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><Avatar participant={{ id: String(item.id), name: item.displayName, initials: item.displayName.split(" ").map((word) => word[0]).slice(0, 2).join(""), avatarColor: ["#8A63D2", "#D35D77", "#2F9E8F", "#3269C6"][item.id % 4], presence: online ? "online" : "offline" }} size={54} /><View style={styles.copy}><View style={styles.nameLine}><Text numberOfLines={1} style={styles.name}>{item.displayName}</Text>{hasNew ? <View style={styles.unreadDot} /> : null}</View><Text numberOfLines={1} style={[styles.status, online && styles.online]}>{online ? "Đang hoạt động" : `@${item.username}`}</Text></View><IconSymbol name="chevron.right" size={21} color="#A1ADBD" /></Pressable>; }} /></ScreenContainer>;
}

const styles = StyleSheet.create({ list: { paddingHorizontal: 16, paddingBottom: 24 }, header: { paddingTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, title: { color: "#0A284A", fontSize: 29, lineHeight: 34, fontWeight: "900", letterSpacing: -0.9 }, subtitle: { marginTop: 2, color: "#6F8096", fontSize: 12 }, search: { marginTop: 19, height: 48, borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E3EBF4", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 }, searchInput: { flex: 1, height: "100%", color: "#153150", fontSize: 14 }, sectionLabel: { marginTop: 24, marginBottom: 4, fontSize: 16, color: "#153150", fontWeight: "900" }, error: { marginTop: 12, padding: 10, borderRadius: 11, color: "#BD3940", backgroundColor: "#FFF0F0", fontSize: 12 }, row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#E3EBF4" }, copy: { minWidth: 0, flex: 1 }, nameLine: { flexDirection: "row", alignItems: "center", gap: 7 }, name: { flexShrink: 1, color: "#153150", fontWeight: "800", fontSize: 16 }, status: { marginTop: 3, color: "#8190A3", fontSize: 12 }, online: { color: "#198A68", fontWeight: "600" }, unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#1577E8" }, empty: { alignItems: "center", gap: 12, paddingTop: 55, paddingHorizontal: 28 }, emptyText: { color: "#7A8BA1", fontSize: 13, lineHeight: 20, textAlign: "center" }, pressed: { opacity: 0.6 } });
