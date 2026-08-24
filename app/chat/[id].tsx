import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";

import { Avatar } from "@/components/avatar";
import { IconButton } from "@/components/icon-button";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useMobileAuth } from "@/lib/auth-context";
import { mobileApi, type MobileMessage, type MobileUser } from "@/lib/mobile-api";
import { useMobileSocket } from "@/lib/socket-context";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const peerId = Number(id);
  const { token, user } = useMobileAuth();
  const { onlineIds, lastMessage, lastTyping, lastReadReceipt, lastDeliveryReceipt, sendMessage, sendTyping } = useMobileSocket();
  const [peer, setPeer] = useState<MobileUser | null>(null);
  const [messages, setMessages] = useState<MobileMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [peerTyping, setPeerTyping] = useState(false);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markRead = useCallback(() => {
    if (token && Number.isInteger(peerId)) void mobileApi.markMessagesRead(token, peerId).catch(() => undefined);
  }, [peerId, token]);

  const load = useCallback(async () => {
    if (!token || !Number.isInteger(peerId)) return;
    setLoading(true);
    try {
      const [friends, history] = await Promise.all([mobileApi.friends(token), mobileApi.messages(token, peerId)]);
      setPeer(friends.find((friend) => friend.id === peerId) ?? null);
      setMessages(history);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không tải được cuộc trò chuyện.");
    } finally {
      setLoading(false);
    }
  }, [peerId, token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!lastMessage || !user) return;
    const belongs = (lastMessage.senderId === peerId && lastMessage.recipientId === user.id) || (lastMessage.recipientId === peerId && lastMessage.senderId === user.id);
    if (!belongs) return;
    setMessages((current) => current.some((message) => message.id === lastMessage.id) ? current : [...current, lastMessage]);
    if (lastMessage.senderId === peerId) markRead();
  }, [lastMessage, markRead, peerId, user]);
  useEffect(() => {
    if (!lastTyping || lastTyping.fromUserId !== peerId) return;
    setPeerTyping(lastTyping.isTyping);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    if (lastTyping.isTyping) typingTimeout.current = setTimeout(() => setPeerTyping(false), 1800);
  }, [lastTyping, peerId]);
  useEffect(() => {
    if (!lastReadReceipt || lastReadReceipt.readerId !== peerId || !lastReadReceipt.messageIds.length) return;
    const receivedIds = new Set(lastReadReceipt.messageIds);
    setMessages((current) => current.map((message) => receivedIds.has(message.id) ? { ...message, readAt: lastReadReceipt.readAt } : message));
  }, [lastReadReceipt, peerId]);
  useEffect(() => {
    if (!lastDeliveryReceipt || lastDeliveryReceipt.recipientId !== peerId || !lastDeliveryReceipt.messageIds.length) return;
    const receivedIds = new Set(lastDeliveryReceipt.messageIds);
    setMessages((current) => current.map((message) => receivedIds.has(message.id) ? { ...message, deliveredAt: lastDeliveryReceipt.deliveredAt } : message));
  }, [lastDeliveryReceipt, peerId]);
  useEffect(() => () => {
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    if (peerId) sendTyping(peerId, false);
  }, [peerId, sendTyping]);

  const handleDraft = (value: string) => {
    setDraft(value);
    if (!peerId) return;
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    if (!value.trim()) {
      sendTyping(peerId, false);
      return;
    }
    sendTyping(peerId, true);
    typingTimeout.current = setTimeout(() => sendTyping(peerId, false), 1200);
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || !peer) return;
    setDraft("");
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    sendTyping(peer.id, false);
    try {
      const message = await sendMessage(peer.id, body);
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    } catch (reason) {
      setDraft(body);
      setError(reason instanceof Error ? reason.message : "Không gửi được tin nhắn.");
    }
  };

  const online = peer ? onlineIds.includes(peer.id) : false;
  const avatar = peer ? { id: String(peer.id), name: peer.displayName, initials: peer.displayName.split(" ").map((word) => word[0]).slice(0, 2).join(""), avatarColor: ["#8A63D2", "#D35D77", "#2F9E8F", "#3269C6"][peer.id % 4], presence: online ? "online" as const : "offline" as const } : null;

  return <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-[#F4F7FB]" className="flex-1"><Stack.Screen options={{ headerShown: false }} /><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}><View style={styles.header}><IconButton name="chevron.left" onPress={() => router.back()} accessibilityLabel="Quay lại" /><View style={styles.peerHeader}>{avatar ? <Avatar participant={avatar} size={38} /> : null}<View style={styles.peerCopy}><Text numberOfLines={1} style={styles.peerName}>{peer?.displayName ?? "Cuộc trò chuyện"}</Text><Text style={[styles.peerStatus, (online || peerTyping) && styles.online]}>{peerTyping ? "Đang gõ…" : online ? "Đang hoạt động" : peer ? `@${peer.username}` : ""}</Text></View></View><View style={styles.callActions}><IconButton name="phone.fill" onPress={() => peer && router.push({ pathname: "/call", params: { peerId: String(peer.id), peerName: peer.displayName, mode: "audio" } })} accessibilityLabel="Gọi thoại" color="#1577E8" /><IconButton name="video.fill" onPress={() => peer && router.push({ pathname: "/call", params: { peerId: String(peer.id), peerName: peer.displayName, mode: "video" } })} accessibilityLabel="Gọi video" color="#1577E8" /></View></View>
    {loading ? <View style={styles.loading}><ActivityIndicator color="#1577E8" /></View> : <FlatList data={messages} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.messageList} renderItem={({ item }) => <MessageBubble message={item} isMine={item.senderId === user?.id} />} ListEmptyComponent={<Text style={styles.empty}>Chưa có tin nhắn. Hãy gửi lời chào.</Text>} />}
    {peerTyping ? <View style={styles.typingBar}><Text style={styles.typingText}>{peer?.displayName ?? "Người kia"} đang gõ…</Text><View style={styles.typingDots}><View style={styles.dot} /><View style={[styles.dot, styles.dotMiddle]} /><View style={styles.dot} /></View></View> : null}
    {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => setError("")}><Text style={styles.dismiss}>Bỏ</Text></Pressable></View> : null}
    <View style={styles.composer}><TextInput value={draft} onChangeText={handleDraft} onSubmitEditing={() => void send()} placeholder="Nhập tin nhắn" placeholderTextColor="#8493A5" style={styles.input} returnKeyType="send" multiline /><Pressable onPress={() => void send()} style={({ pressed }) => [styles.send, (!draft.trim() || !peer) && styles.sendDisabled, pressed && styles.pressed]}><IconSymbol name="paperplane.fill" size={19} color="#FFFFFF" /></Pressable></View>
  </KeyboardAvoidingView></ScreenContainer>;
}

function MessageBubble({ message, isMine }: { message: MobileMessage; isMine: boolean }) {
  const label = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(`${message.createdAt}Z`));
  const readTime = message.readAt ? new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(message.readAt)) : null;
  const deliveryStatus = readTime ? `Đã xem · ${readTime}` : message.deliveredAt ? "Đã nhận" : "Đã gửi";
  return <View style={[styles.messageRow, isMine && styles.mineRow]}><View><View style={[styles.bubble, isMine ? styles.mineBubble : styles.peerBubble]}><Text style={[styles.messageText, isMine && styles.mineText]}>{message.body}</Text><Text style={[styles.time, isMine && styles.mineTime]}>{label}</Text></View>{isMine ? <Text style={styles.readReceipt}>{deliveryStatus}</Text> : null}</View></View>;
}

const styles = StyleSheet.create({ flex: { flex: 1 }, header: { height: 64, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#E4ECF4", shadowColor: "#153150", shadowOpacity: 0.03, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 1 }, peerHeader: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 9 }, peerCopy: { minWidth: 0, flex: 1 }, peerName: { color: "#153150", fontWeight: "900", fontSize: 15 }, peerStatus: { marginTop: 1, color: "#8392A4", fontSize: 10 }, online: { color: "#198A68", fontWeight: "700" }, callActions: { flexDirection: "row" }, loading: { flex: 1, alignItems: "center", justifyContent: "center" }, messageList: { flexGrow: 1, paddingHorizontal: 15, paddingTop: 16, paddingBottom: 24, gap: 8 }, messageRow: { flexDirection: "row", justifyContent: "flex-start" }, mineRow: { justifyContent: "flex-end" }, bubble: { maxWidth: "80%", borderRadius: 18, paddingHorizontal: 12, paddingVertical: 9 }, peerBubble: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 5 }, mineBubble: { backgroundColor: "#D9ECFF", borderTopRightRadius: 5 }, messageText: { color: "#25415D", fontSize: 14, lineHeight: 20 }, mineText: { color: "#0A4A87" }, time: { textAlign: "right", marginTop: 3, color: "#9AA8B8", fontSize: 9 }, mineTime: { color: "#6F98C0" }, readReceipt: { marginTop: 3, color: "#6F98C0", fontSize: 10, fontWeight: "700", textAlign: "right" }, empty: { marginTop: 38, color: "#8A98AA", fontSize: 13, textAlign: "center" }, typingBar: { marginHorizontal: 12, marginBottom: 6, paddingHorizontal: 11, paddingVertical: 7, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 12, backgroundColor: "#EAF4FF" }, typingText: { color: "#3672A7", fontSize: 11, fontWeight: "700" }, typingDots: { flexDirection: "row", alignItems: "center", gap: 3 }, dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#4A91CE" }, dotMiddle: { opacity: 0.65 }, error: { marginHorizontal: 12, marginBottom: 7, padding: 9, borderRadius: 11, flexDirection: "row", alignItems: "center", backgroundColor: "#FFF0F0" }, errorText: { flex: 1, color: "#BF3840", fontSize: 11 }, dismiss: { color: "#1577E8", fontSize: 11, fontWeight: "800" }, composer: { minHeight: 68, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 12, gap: 8, flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#E4ECF4", shadowColor: "#153150", shadowOpacity: 0.06, shadowRadius: 9, shadowOffset: { width: 0, height: -3 }, elevation: 4 }, input: { flex: 1, minHeight: 42, maxHeight: 96, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 14, backgroundColor: "#F1F5F9", color: "#153150", fontSize: 14 }, send: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#1577E8" }, sendDisabled: { backgroundColor: "#A4C8ED" }, pressed: { opacity: 0.65 } });
