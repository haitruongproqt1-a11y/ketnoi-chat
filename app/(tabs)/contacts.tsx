import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import { Avatar } from "@/components/avatar";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useMobileAuth } from "@/lib/auth-context";
import { mobileApi, type FriendRequest, type MobileUser, type UserSearchResult } from "@/lib/mobile-api";
import { useMobileSocket } from "@/lib/socket-context";

export default function ContactsScreen() {
  const { token } = useMobileAuth();
  const { onlineIds } = useMobileSocket();
  const [friends, setFriends] = useState<MobileUser[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [friendList, incoming] = await Promise.all([mobileApi.friends(token), mobileApi.friendRequests(token)]);
      setFriends(friendList);
      setRequests(incoming.filter((request) => request.status === "pending"));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không tải được danh bạ.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!token || !query.trim()) { setResults([]); return; }
    const handle = setTimeout(() => {
      void mobileApi.searchUsers(token, query).then(setResults).catch((error: Error) => setNotice(error.message));
    }, 260);
    return () => clearTimeout(handle);
  }, [query, token]);

  const sendRequest = async (userId: number) => {
    if (!token) return;
    try {
      await mobileApi.sendFriendRequest(token, userId);
      setNotice("Đã gửi lời mời kết bạn.");
      if (query) setResults(await mobileApi.searchUsers(token, query));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không gửi được lời mời.");
    }
  };
  const respond = async (requestId: number, accept: boolean) => {
    if (!token) return;
    try {
      await mobileApi.respondFriendRequest(token, requestId, accept);
      setNotice(accept ? "Đã trở thành bạn bè." : "Đã từ chối lời mời.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể cập nhật lời mời.");
    }
  };

  const list = query.trim() ? results : friends;
  return <ScreenContainer containerClassName="bg-[#F4F7FB]" className="flex-1"><FlatList data={list} keyExtractor={(item) => String(item.id)} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor="#1577E8" />} contentContainerStyle={styles.list} ListHeaderComponent={<View><View style={styles.header}><Text style={styles.title}>Danh bạ</Text><Text style={styles.subtitle}>Nơi tìm người dùng và kết bạn</Text></View><View style={styles.finderIntro}><View style={styles.finderIcon}><IconSymbol name="person.badge.plus" size={19} color="#1577E8" /></View><View style={styles.finderCopy}><Text style={styles.finderTitle}>Tìm người dùng để kết bạn</Text><Text style={styles.finderText}>Nhập tên đăng nhập, tên hoặc email; sau đó chạm “Kết bạn”.</Text></View></View><View style={styles.search}><IconSymbol name="magnifyingglass" size={19} color="#7D8FA4" /><TextInput value={query} onChangeText={setQuery} placeholder="Tìm người dùng để kết bạn" placeholderTextColor="#8E9BAE" style={styles.searchInput} returnKeyType="search" /></View>{notice ? <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text><Pressable onPress={() => setNotice("")}><Text style={styles.dismiss}>Bỏ</Text></Pressable></View> : null}{!query && requests.length ? <View style={styles.requestBox}><Text style={styles.requestTitle}>Lời mời đang chờ</Text>{requests.map((request) => <View key={request.id} style={styles.requestRow}><Avatar participant={participant(request.sender, false)} size={39} /><Text style={styles.requestName}>{request.sender.displayName}</Text><Pressable onPress={() => void respond(request.id, false)} style={styles.decline}><Text style={styles.declineText}>Bỏ qua</Text></Pressable><Pressable onPress={() => void respond(request.id, true)} style={styles.accept}><Text style={styles.acceptText}>Đồng ý</Text></Pressable></View>)}</View> : null}<Text style={styles.sectionTitle}>{query ? "Kết quả tìm kiếm" : "Bạn bè"}</Text></View>} ListEmptyComponent={loading ? <View style={styles.empty}><ActivityIndicator color="#1577E8" /></View> : <Text style={styles.emptyText}>{query ? "Không tìm thấy người dùng phù hợp." : "Chưa có bạn bè. Dùng ô tìm người dùng ở trên để gửi lời mời kết bạn."}</Text>} renderItem={({ item }) => { const person = item as MobileUser & Partial<UserSearchResult>; const online = onlineIds.includes(person.id); const relationship = person.relationship ?? "friends"; return <Pressable onPress={() => relationship === "friends" && router.push({ pathname: "/chat/[id]", params: { id: String(person.id) } })} style={({ pressed }) => [styles.row, pressed && relationship === "friends" && styles.pressed]}><Avatar participant={participant(person, online)} size={53} /><View style={styles.copy}><Text style={styles.name}>{person.displayName}</Text><Text style={[styles.status, online && styles.online]}>{online ? "Đang hoạt động" : person.email || `@${person.username}`}</Text></View>{relationship === "friends" ? <View style={styles.chatBadge}><IconSymbol name="message.fill" size={18} color="#1577E8" /></View> : relationship === "incoming" ? <Pressable onPress={() => { const request = requests.find((candidate) => candidate.sender.id === person.id); if (request) void respond(request.id, true); }} style={styles.smallAccept}><Text style={styles.smallAcceptText}>Đồng ý</Text></Pressable> : relationship === "outgoing" ? <Text style={styles.sent}>Đã gửi</Text> : <Pressable onPress={() => void sendRequest(person.id)} style={styles.add}><Text style={styles.addText}>Kết bạn</Text></Pressable>}</Pressable>; }} /></ScreenContainer>;
}

function participant(user: MobileUser, online: boolean) { return { id: String(user.id), name: user.displayName, initials: user.displayName.split(" ").map((word) => word[0]).slice(0, 2).join(""), avatarColor: ["#8A63D2", "#D35D77", "#2F9E8F", "#3269C6"][user.id % 4], avatarUrl: user.avatarUrl ? mobileApi.mediaUrl(user.avatarUrl) : null, presence: online ? "online" as const : "offline" as const }; }

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 24 }, header: { paddingTop: 10 }, title: { fontSize: 29, fontWeight: "900", lineHeight: 34, letterSpacing: -0.9, color: "#0A284A" }, subtitle: { marginTop: 3, color: "#708096", fontSize: 12 }, finderIntro: { marginTop: 15, padding: 13, borderRadius: 16, flexDirection: "row", gap: 10, backgroundColor: "#EAF5FF", borderWidth: 1, borderColor: "#D8EBFC" }, finderIcon: { width: 35, height: 35, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" }, finderCopy: { flex: 1 }, finderTitle: { color: "#163252", fontSize: 13, fontWeight: "900" }, finderText: { color: "#58728C", marginTop: 3, fontSize: 11, lineHeight: 16 }, search: { marginTop: 11, height: 48, paddingHorizontal: 14, gap: 8, flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 15, borderWidth: 1, borderColor: "#A9D4FA" }, searchInput: { flex: 1, color: "#153150", fontSize: 14 }, notice: { marginTop: 11, padding: 10, borderRadius: 11, gap: 6, flexDirection: "row", alignItems: "center", backgroundColor: "#E8F2FF" }, noticeText: { flex: 1, color: "#366585", fontSize: 11 }, dismiss: { color: "#1577E8", fontSize: 11, fontWeight: "800" }, requestBox: { marginTop: 16, padding: 13, borderRadius: 17, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E1EAF4" }, requestTitle: { marginBottom: 5, color: "#163252", fontSize: 13, fontWeight: "900" }, requestRow: { minHeight: 52, gap: 8, flexDirection: "row", alignItems: "center" }, requestName: { flex: 1, color: "#294561", fontSize: 13, fontWeight: "800" }, decline: { paddingHorizontal: 8, paddingVertical: 7 }, declineText: { color: "#73859B", fontSize: 11, fontWeight: "700" }, accept: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, backgroundColor: "#1577E8" }, acceptText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" }, sectionTitle: { marginTop: 21, marginBottom: 5, color: "#153150", fontWeight: "900", fontSize: 16 }, row: { minHeight: 77, gap: 12, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#E3EBF4" }, copy: { flex: 1 }, name: { color: "#153150", fontSize: 16, fontWeight: "800" }, status: { marginTop: 3, color: "#8090A4", fontSize: 11 }, online: { color: "#198A68", fontWeight: "700" }, chatBadge: { width: 38, height: 38, justifyContent: "center", alignItems: "center", backgroundColor: "#E8F2FF", borderRadius: 12 }, add: { paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#1577E8", borderRadius: 10 }, addText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" }, smallAccept: { paddingHorizontal: 9, paddingVertical: 8, backgroundColor: "#E8F8F1", borderRadius: 10 }, smallAcceptText: { color: "#15835E", fontSize: 11, fontWeight: "900" }, sent: { color: "#7B8FA6", fontSize: 11, fontWeight: "700" }, empty: { paddingTop: 55 }, emptyText: { paddingTop: 30, paddingHorizontal: 35, color: "#8291A3", textAlign: "center", fontSize: 13, lineHeight: 19 }, pressed: { opacity: 0.62 },
});
