import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import { Avatar } from "@/components/avatar";
import { IconButton } from "@/components/icon-button";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useMobileAuth } from "@/lib/auth-context";
import { mobileApi, type ConversationSummary, type MessageSearchResult } from "@/lib/mobile-api";
import { useMobileSocket } from "@/lib/socket-context";

type ViewMode = "all" | "unread" | "archived";
type ListItem = { kind: "conversation"; value: ConversationSummary } | { kind: "message"; value: MessageSearchResult };

const sortConversations = (items: ConversationSummary[]) => [...items].sort((left, right) => Number(right.pinned) - Number(left.pinned) || (right.lastMessage?.id ?? 0) - (left.lastMessage?.id ?? 0) || left.peer.displayName.localeCompare(right.peer.displayName, "vi"));

export default function ConversationsScreen() {
  const { token, user } = useMobileAuth();
  const { onlineIds, lastMessage, lastTyping } = useMobileSocket();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [query, setQuery] = useState("");
  const [messageResults, setMessageResults] = useState<MessageSearchResult[]>([]);
  const [searchingMessages, setSearchingMessages] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [activeActionsId, setActiveActionsId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [error, setError] = useState("");

  const loadConversations = useCallback(async () => {
    if (!token) return;
    try { setError(""); setConversations(sortConversations(await mobileApi.conversations(token))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không tải được danh sách trò chuyện."); }
  }, [token]);
  useFocusEffect(useCallback(() => { void loadConversations(); }, [loadConversations]));

  useEffect(() => {
    const term = query.trim();
    if (!token || term.length < 2) { setMessageResults([]); setSearchingMessages(false); return; }
    setSearchingMessages(true);
    const timer = setTimeout(() => { void mobileApi.searchMessages(token, term).then(setMessageResults).catch(() => setMessageResults([])).finally(() => setSearchingMessages(false)); }, 280);
    return () => clearTimeout(timer);
  }, [query, token]);

  useEffect(() => {
    if (!lastMessage || !user) return;
    const peerId = lastMessage.senderId === user.id ? lastMessage.recipientId : lastMessage.senderId;
    setConversations((current) => sortConversations(current.map((conversation) => conversation.peer.id !== peerId ? conversation : { ...conversation, lastMessage, unreadCount: lastMessage.recipientId === user.id ? conversation.unreadCount + 1 : conversation.unreadCount })));
  }, [lastMessage, user]);

  const updateConversation = async (peerId: number, changes: Partial<{ pinned: boolean; archived: boolean; muted: boolean; hidden: boolean }>) => {
    if (!token) return;
    setActiveActionsId(null);
    try {
      await mobileApi.updateConversation(token, peerId, changes);
      await loadConversations();
    } catch { setError("Không thể cập nhật cuộc trò chuyện. Vui lòng thử lại."); }
  };
  const markAllRead = async () => {
    if (!token || !unreadTotal || markingAllRead) return;
    setMarkingAllRead(true); setError("");
    try { await mobileApi.markAllMessagesRead(token); setConversations((current) => current.map((conversation) => ({ ...conversation, unreadCount: 0 }))); }
    catch { setError("Không thể đánh dấu tất cả là đã đọc. Vui lòng thử lại."); }
    finally { setMarkingAllRead(false); }
  };
  const refresh = async () => { setRefreshing(true); await loadConversations(); setRefreshing(false); };

  const unreadTotal = conversations.reduce((sum, item) => sum + item.unreadCount, 0);
  const term = query.trim().toLocaleLowerCase("vi");
  const visibleConversations = useMemo(() => conversations.filter((conversation) => {
    if (viewMode === "archived" ? !conversation.archived : conversation.archived) return false;
    if (viewMode === "unread" && !conversation.unreadCount) return false;
    return !term || conversation.peer.displayName.toLocaleLowerCase("vi").includes(term) || conversation.peer.username.toLocaleLowerCase("vi").includes(term);
  }), [conversations, term, viewMode]);
  const listItems = useMemo<ListItem[]>(() => term.length >= 2 ? [...visibleConversations.map((value) => ({ kind: "conversation" as const, value })), ...messageResults.map((value) => ({ kind: "message" as const, value }))] : visibleConversations.map((value) => ({ kind: "conversation" as const, value })), [messageResults, term.length, visibleConversations]);

  return <ScreenContainer containerClassName="bg-[#F4F7FB]" className="flex-1"><FlatList data={listItems} keyExtractor={(item) => item.kind === "conversation" ? `c-${item.value.peer.id}` : `m-${item.value.id}`} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#1577E8" />} contentContainerStyle={styles.list} ListHeaderComponent={<View><View style={styles.header}><View><Text style={styles.title}>Tin nhắn</Text><Text style={styles.subtitle}>{onlineIds.length} người đang trực tuyến</Text></View><IconButton name="person.badge.plus" onPress={() => router.push("/(tabs)/contacts")} accessibilityLabel="Danh bạ" background="#1577E8" color="#FFFFFF" /></View><View style={styles.search}><IconSymbol name="magnifyingglass" size={20} color="#74849A" /><TextInput value={query} onChangeText={setQuery} placeholder="Tìm tên hoặc nội dung tin nhắn" placeholderTextColor="#8997A9" style={styles.searchInput} returnKeyType="search" /></View><View style={styles.filterRow}><View style={styles.filterTabs}><FilterTab active={viewMode === "all"} label="Tất cả" onPress={() => setViewMode("all")} /><FilterTab active={viewMode === "unread"} label={`Chưa đọc${unreadTotal ? ` (${unreadTotal})` : ""}`} onPress={() => setViewMode("unread")} /><FilterTab active={viewMode === "archived"} label="Lưu trữ" onPress={() => setViewMode("archived")} /></View>{unreadTotal && viewMode !== "archived" ? <Pressable disabled={markingAllRead} onPress={() => void markAllRead()} style={({ pressed }) => [styles.readAll, (pressed || markingAllRead) && styles.pressed]}><Text style={styles.readAllText}>{markingAllRead ? "Đang xử lý…" : "Đọc tất cả"}</Text></Pressable> : null}</View>{error ? <Text style={styles.error}>{error}</Text> : null}<Text style={styles.sectionLabel}>{term.length >= 2 ? "Kết quả tìm kiếm" : viewMode === "unread" ? "Tin chưa đọc" : viewMode === "archived" ? "Đã lưu trữ" : "Cuộc trò chuyện"}</Text>{searchingMessages ? <View style={styles.searching}><ActivityIndicator size="small" color="#1577E8" /><Text style={styles.searchingText}>Đang tìm trong tin nhắn…</Text></View> : null}</View>} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>{term.length >= 2 ? "Không tìm thấy nội dung phù hợp." : viewMode === "unread" ? "Không có tin nhắn chưa đọc." : viewMode === "archived" ? "Chưa có cuộc trò chuyện được lưu trữ." : "Chưa có người dùng khác. Hãy tạo thêm tài khoản để bắt đầu."}</Text></View>} renderItem={({ item }) => item.kind === "conversation" ? <ConversationRow conversation={item.value} online={onlineIds.includes(item.value.peer.id)} typing={lastTyping?.fromUserId === item.value.peer.id && lastTyping.isTyping} actionsOpen={activeActionsId === item.value.peer.id} onOpen={() => setActiveActionsId((current) => current === item.value.peer.id ? null : item.value.peer.id)} onClose={() => setActiveActionsId(null)} onUpdate={updateConversation} /> : <MessageSearchRow result={item.value} />} /></ScreenContainer>;
}

function FilterTab({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.filterTab, active && styles.filterTabActive, pressed && styles.pressed]}><Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text></Pressable>; }

function ConversationRow({ conversation, online, typing, actionsOpen, onOpen, onClose, onUpdate }: { conversation: ConversationSummary; online: boolean; typing: boolean; actionsOpen: boolean; onOpen: () => void; onClose: () => void; onUpdate: (peerId: number, changes: Partial<{ pinned: boolean; archived: boolean; muted: boolean; hidden: boolean }>) => Promise<void> }) {
  const { peer, unreadCount, pinned, muted } = conversation;
  const participant = { id: String(peer.id), name: peer.displayName, initials: peer.displayName.split(" ").map((word) => word[0]).slice(0, 2).join(""), avatarColor: ["#8A63D2", "#D35D77", "#2F9E8F", "#3269C6"][peer.id % 4], presence: online ? "online" as const : "offline" as const };
  return <Pressable onHoverIn={onOpen} onHoverOut={onClose} style={styles.rowShell}><Pressable onPress={() => router.push({ pathname: "/chat/[id]", params: { id: String(peer.id) } })} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><Avatar participant={participant} size={54} /><View style={styles.copy}><View style={styles.nameLine}>{pinned ? <Text style={styles.pin}>Ghim</Text> : null}<Text numberOfLines={1} style={styles.name}>{peer.displayName}</Text></View><Text numberOfLines={1} style={[styles.status, (online || typing) && styles.online]}>{typing ? "Đang gõ…" : conversation.lastMessage ? conversation.lastMessage.body : online ? "Đang hoạt động" : `@${peer.username}`}</Text></View>{unreadCount ? <View style={styles.unreadBadge}><Text style={styles.unreadCount}>{unreadCount > 99 ? "99+" : unreadCount}</Text></View> : null}</Pressable><Pressable onPress={onOpen} accessibilityLabel="Thao tác nhanh" style={styles.more}><Text style={styles.moreText}>•••</Text></Pressable>{actionsOpen ? <View style={styles.quickActions}><QuickAction label={pinned ? "Bỏ ghim" : "Ghim"} onPress={() => void onUpdate(peer.id, { pinned: !pinned })} /><QuickAction label="Lưu trữ" onPress={() => void onUpdate(peer.id, { archived: true })} /><QuickAction label={muted ? "Bật thông báo" : "Tắt thông báo"} onPress={() => void onUpdate(peer.id, { muted: !muted })} /><QuickAction destructive label="Xóa" onPress={() => void onUpdate(peer.id, { hidden: true })} /></View> : null}</Pressable>;
}

function QuickAction({ label, destructive, onPress }: { label: string; destructive?: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}><Text style={[styles.quickActionText, destructive && styles.destructive]}>{label}</Text></Pressable>; }

function MessageSearchRow({ result }: { result: MessageSearchResult }) { const time = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(`${result.createdAt}Z`)); return <Pressable onPress={() => router.push({ pathname: "/chat/[id]", params: { id: String(result.peer.id) } })} style={({ pressed }) => [styles.searchResult, pressed && styles.pressed]}><View style={styles.searchResultTop}><Text style={styles.searchResultName}>{result.peer.displayName}</Text><Text style={styles.searchResultTime}>{time}</Text></View><Text numberOfLines={2} style={styles.searchResultBody}>{result.body}</Text></Pressable>; }

const styles = StyleSheet.create({ list: { paddingHorizontal: 16, paddingBottom: 24 }, header: { paddingTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, title: { color: "#0A284A", fontSize: 29, lineHeight: 34, fontWeight: "900", letterSpacing: -0.9 }, subtitle: { marginTop: 2, color: "#6F8096", fontSize: 12 }, search: { marginTop: 19, height: 48, borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E3EBF4", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 }, searchInput: { flex: 1, height: "100%", color: "#153150", fontSize: 14 }, filterRow: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, filterTabs: { flexDirection: "row", gap: 7 }, filterTab: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 11, backgroundColor: "#EAF0F6" }, filterTabActive: { backgroundColor: "#D9ECFF" }, filterText: { color: "#71839B", fontSize: 10, fontWeight: "800" }, filterTextActive: { color: "#0C67C6" }, readAll: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D8E8F8" }, readAllText: { color: "#1577E8", fontSize: 10, fontWeight: "900" }, sectionLabel: { marginTop: 20, marginBottom: 4, fontSize: 16, color: "#153150", fontWeight: "900" }, searching: { marginTop: 9, flexDirection: "row", alignItems: "center", gap: 7 }, searchingText: { color: "#5E7793", fontSize: 11 }, error: { marginTop: 12, padding: 10, borderRadius: 11, color: "#BD3940", backgroundColor: "#FFF0F0", fontSize: 12 }, rowShell: { position: "relative", borderBottomWidth: 1, borderBottomColor: "#E3EBF4" }, row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingRight: 28 }, more: { position: "absolute", right: 0, top: 24, padding: 7 }, moreText: { color: "#8395AB", fontSize: 12, fontWeight: "900", letterSpacing: 1 }, copy: { minWidth: 0, flex: 1 }, nameLine: { flexDirection: "row", alignItems: "center", gap: 6 }, pin: { color: "#0C67C6", fontSize: 9, fontWeight: "900", backgroundColor: "#E5F2FF", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 }, name: { flexShrink: 1, color: "#153150", fontWeight: "800", fontSize: 16 }, status: { marginTop: 3, color: "#8190A3", fontSize: 12 }, online: { color: "#198A68", fontWeight: "600" }, unreadBadge: { minWidth: 22, height: 22, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#1577E8" }, unreadCount: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" }, quickActions: { position: "absolute", zIndex: 3, right: 0, top: 57, padding: 6, flexDirection: "row", gap: 3, borderRadius: 12, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCE8F5", shadowColor: "#17395D", shadowOpacity: 0.13, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5 }, quickAction: { paddingHorizontal: 7, paddingVertical: 6, borderRadius: 8, backgroundColor: "#F3F7FB" }, quickActionText: { color: "#36536E", fontSize: 10, fontWeight: "800" }, destructive: { color: "#C63E47" }, searchResult: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#E3EBF4" }, searchResultTop: { flexDirection: "row", justifyContent: "space-between", gap: 12 }, searchResultName: { flex: 1, color: "#153150", fontSize: 14, fontWeight: "900" }, searchResultTime: { color: "#8A99AB", fontSize: 10 }, searchResultBody: { marginTop: 5, color: "#627892", fontSize: 13, lineHeight: 18 }, empty: { alignItems: "center", gap: 12, paddingTop: 55, paddingHorizontal: 28 }, emptyText: { color: "#7A8BA1", fontSize: 13, lineHeight: 20, textAlign: "center" }, pressed: { opacity: 0.6 } });
