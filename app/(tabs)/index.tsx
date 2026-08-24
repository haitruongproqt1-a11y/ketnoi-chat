import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import { Avatar } from "@/components/avatar";
import { IconButton } from "@/components/icon-button";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useMobileAuth } from "@/lib/auth-context";
import { mobileApi, type MobileUser } from "@/lib/mobile-api";
import { useMobileSocket } from "@/lib/socket-context";

export default function ConversationsScreen() {
  const { token, user } = useMobileAuth();
  const { onlineIds, lastMessage, lastTyping } = useMobileSocket();
  const [friends, setFriends] = useState<MobileUser[]>([]);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const loadFriends = useCallback(async () => {
    if (!token) return;
    try { setError(""); setFriends(await mobileApi.friends(token)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không tải được danh sách bạn bè."); }
  }, [token]);
  useEffect(() => { void loadFriends(); }, [loadFriends]);
  const loadUnreadCounts = useCallback(async () => {
    if (!token) return;
    try { const counts = await mobileApi.unreadCounts(token); setUnreadCounts(Object.fromEntries(counts.map((item) => [item.senderId, item.count]))); }
    catch { /* Keep the last known badges when the network is temporarily unavailable. */ }
  }, [token]);
  useFocusEffect(useCallback(() => { void loadUnreadCounts(); }, [loadUnreadCounts]));
  useEffect(() => {
    if (!lastMessage || lastMessage.recipientId !== user?.id) return;
    setUnreadCounts((current) => ({ ...current, [lastMessage.senderId]: (current[lastMessage.senderId] ?? 0) + 1 }));
  }, [lastMessage, user?.id]);
  const visible = useMemo(() => friends.filter((friend) => friend.displayName.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")) && (!unreadOnly || (unreadCounts[friend.id] ?? 0) > 0)), [friends, query, unreadCounts, unreadOnly]);
  const refresh = async () => { setRefreshing(true); await Promise.all([loadFriends(), loadUnreadCounts()]); setRefreshing(false); };
  const unreadTotal = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
  const markAllRead = async () => { if (!token || !unreadTotal || markingAllRead) return; setMarkingAllRead(true); setError(""); try { await mobileApi.markAllMessagesRead(token); setUnreadCounts({}); } catch { setError("Không thể đánh dấu tất cả là đã đọc. Vui lòng thử lại."); } finally { setMarkingAllRead(false); } };

  return <ScreenContainer containerClassName="bg-[#F4F7FB]" className="flex-1"><FlatList data={visible} keyExtractor={(item) => String(item.id)} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#1577E8" />} contentContainerStyle={styles.list} ListHeaderComponent={<View><View style={styles.header}><View><Text style={styles.title}>Tin nhắn</Text><Text style={styles.subtitle}>{friends.filter((friend) => onlineIds.includes(friend.id)).length} người đang trực tuyến</Text></View><IconButton name="person.badge.plus" onPress={() => router.push("/(tabs)/contacts")} accessibilityLabel="Danh bạ" background="#1577E8" color="#FFFFFF" /></View><View style={styles.search}><IconSymbol name="magnifyingglass" size={20} color="#74849A" /><TextInput value={query} onChangeText={setQuery} placeholder="Tìm bạn bè" placeholderTextColor="#8997A9" style={styles.searchInput} returnKeyType="search" /></View><View style={styles.filterRow}><View style={styles.filterTabs}><Pressable onPress={() => setUnreadOnly(false)} style={({ pressed }) => [styles.filterTab, !unreadOnly && styles.filterTabActive, pressed && styles.pressed]}><Text style={[styles.filterText, !unreadOnly && styles.filterTextActive]}>Tất cả</Text></Pressable><Pressable onPress={() => setUnreadOnly(true)} style={({ pressed }) => [styles.filterTab, unreadOnly && styles.filterTabActive, pressed && styles.pressed]}><Text style={[styles.filterText, unreadOnly && styles.filterTextActive]}>Chưa đọc{unreadTotal ? ` (${unreadTotal})` : ""}</Text></Pressable></View>{unreadTotal ? <Pressable disabled={markingAllRead} onPress={() => void markAllRead()} style={({ pressed }) => [styles.readAll, (pressed || markingAllRead) && styles.pressed]}><Text style={styles.readAllText}>{markingAllRead ? "Đang xử lý…" : "Đọc tất cả"}</Text></Pressable> : null}</View>{error ? <Text style={styles.error}>{error}</Text> : null}<Text style={styles.sectionLabel}>{unreadOnly ? "Tin chưa đọc" : "Cuộc trò chuyện"}</Text></View>} ListEmptyComponent={friends.length === 0 && !error ? <View style={styles.empty}><ActivityIndicator color="#1577E8" /><Text style={styles.emptyText}>Chưa có người dùng khác. Hãy tạo thêm một tài khoản để bắt đầu.</Text></View> : unreadOnly ? <View style={styles.empty}><Text style={styles.emptyText}>Không có tin nhắn chưa đọc.</Text></View> : null} renderItem={({ item }) => { const online = onlineIds.includes(item.id); const typing = lastTyping?.fromUserId === item.id && lastTyping.isTyping; const unread = unreadCounts[item.id] ?? 0; return <Pressable onPress={() => router.push({ pathname: "/chat/[id]", params: { id: String(item.id) } })} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><Avatar participant={{ id: String(item.id), name: item.displayName, initials: item.displayName.split(" ").map((word) => word[0]).slice(0, 2).join(""), avatarColor: ["#8A63D2", "#D35D77", "#2F9E8F", "#3269C6"][item.id % 4], presence: online ? "online" : "offline" }} size={54} /><View style={styles.copy}><View style={styles.nameLine}><Text numberOfLines={1} style={styles.name}>{item.displayName}</Text></View><Text numberOfLines={1} style={[styles.status, (online || typing) && styles.online]}>{typing ? "Đang gõ…" : online ? "Đang hoạt động" : `@${item.username}`}</Text></View>{unread ? <View style={styles.unreadBadge}><Text style={styles.unreadCount}>{unread > 99 ? "99+" : unread}</Text></View> : null}<IconSymbol name="chevron.right" size={21} color="#A1ADBD" /></Pressable>; }} /></ScreenContainer>;
}

const styles = StyleSheet.create({ list: { paddingHorizontal: 16, paddingBottom: 24 }, header: { paddingTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, title: { color: "#0A284A", fontSize: 29, lineHeight: 34, fontWeight: "900", letterSpacing: -0.9 }, subtitle: { marginTop: 2, color: "#6F8096", fontSize: 12 }, search: { marginTop: 19, height: 48, borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E3EBF4", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 }, searchInput: { flex: 1, height: "100%", color: "#153150", fontSize: 14 }, filterRow: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, filterTabs: { flexDirection: "row", gap: 7 }, filterTab: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 11, backgroundColor: "#EAF0F6" }, filterTabActive: { backgroundColor: "#D9ECFF" }, filterText: { color: "#71839B", fontSize: 11, fontWeight: "800" }, filterTextActive: { color: "#0C67C6" }, readAll: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D8E8F8" }, readAllText: { color: "#1577E8", fontSize: 10, fontWeight: "900" }, sectionLabel: { marginTop: 20, marginBottom: 4, fontSize: 16, color: "#153150", fontWeight: "900" }, error: { marginTop: 12, padding: 10, borderRadius: 11, color: "#BD3940", backgroundColor: "#FFF0F0", fontSize: 12 }, row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#E3EBF4" }, copy: { minWidth: 0, flex: 1 }, nameLine: { flexDirection: "row", alignItems: "center", gap: 7 }, name: { flexShrink: 1, color: "#153150", fontWeight: "800", fontSize: 16 }, status: { marginTop: 3, color: "#8190A3", fontSize: 12 }, online: { color: "#198A68", fontWeight: "600" }, unreadBadge: { minWidth: 22, height: 22, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#1577E8" }, unreadCount: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" }, empty: { alignItems: "center", gap: 12, paddingTop: 55, paddingHorizontal: 28 }, emptyText: { color: "#7A8BA1", fontSize: 13, lineHeight: 20, textAlign: "center" }, pressed: { opacity: 0.6 } });
