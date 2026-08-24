import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import { VideoView, useVideoPlayer } from "expo-video";

import { Avatar } from "@/components/avatar";
import { IconButton } from "@/components/icon-button";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useMobileAuth } from "@/lib/auth-context";
import { optimizeMedia } from "@/lib/media-optimizer";
import { mobileApi, type MobileMessage, type MobileUser } from "@/lib/mobile-api";
import { useMobileSocket } from "@/lib/socket-context";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const peerId = Number(id);
  const { token, user } = useMobileAuth();
  const { onlineIds, lastMessage, lastTyping, lastReadReceipt, lastDeliveryReceipt, lastMediaRecall, sendMessage, sendTyping } = useMobileSocket();
  const [peer, setPeer] = useState<MobileUser | null>(null);
  const [messages, setMessages] = useState<MobileMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [peerTyping, setPeerTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadCancellation = useRef<(() => void) | null>(null);
  const uploadWasCanceled = useRef(false);

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
  useEffect(() => {
    if (!lastMediaRecall) return;
    setMessages((current) => current.map((message) => message.id === lastMediaRecall.messageId ? { ...message, media: null, mediaRevokedAt: lastMediaRecall.revokedAt } : message));
  }, [lastMediaRecall]);
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
  const pickMedia = async () => {
    if (!peer || !token || uploading) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.8, videoMaxDuration: 90, allowsMultipleSelection: true, selectionLimit: 8 });
      if (result.canceled || !result.assets[0]) return;
      setUploading(true); setUploadProgress(0.02); setError(""); uploadWasCanceled.current = false;
      const uploaded = [] as NonNullable<MobileMessage["media"]>[];
      for (const [index, asset] of result.assets.slice(0, 8).entries()) {
        const size = asset.fileSize ?? 0;
        if (size > 12 * 1024 * 1024) throw new Error("Mỗi ảnh hoặc video cần nhỏ hơn 12 MB.");
        const mimeType = asset.mimeType ?? (asset.type === "video" ? "video/mp4" : "image/jpeg");
        const kind = mimeType.startsWith("video/") ? "video" : "image";
        const start = index / result.assets.length;
        const optimized = await optimizeMedia({ uri: asset.uri, name: asset.fileName ?? `${kind}-${Date.now()}-${index}.${kind === "video" ? "mp4" : "jpg"}`, mimeType, size, kind, width: asset.width, height: asset.height }, (progress) => setUploadProgress(start + progress * 0.55 / result.assets.length), (cancel) => { uploadCancellation.current = cancel; });
        if (uploadWasCanceled.current) throw new Error("UPLOAD_CANCELLED");
        let thumbnailUrl: string | null = null;
        if (kind === "video" && Platform.OS !== "web") { try { const thumbnail = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 800, quality: 0.7 }); const uploadedThumb = await mobileApi.uploadMedia(token, { uri: thumbnail.uri, name: `thumbnail-${Date.now()}.jpg`, mimeType: "image/jpeg", size: 1 }, undefined, (cancel) => { uploadCancellation.current = cancel; }); thumbnailUrl = uploadedThumb.url; } catch { thumbnailUrl = null; } }
        const media = await mobileApi.uploadMedia(token, optimized, (progress) => setUploadProgress(start + 0.55 / result.assets.length + progress * 0.45 / result.assets.length), (cancel) => { uploadCancellation.current = cancel; });
        uploaded.push({ ...media, thumbnailUrl });
      }
      const message = await sendMessage(peer.id, "", uploaded[0], uploaded);
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    } catch (reason) { setError(uploadWasCanceled.current ? "Đã hủy tải ảnh hoặc video." : reason instanceof Error ? reason.message : "Không thể gửi ảnh hoặc video."); }
    finally { setUploading(false); setUploadProgress(0); uploadCancellation.current = null; uploadWasCanceled.current = false; }
  };
  const cancelMediaUpload = () => { uploadWasCanceled.current = true; uploadCancellation.current?.(); };
  const downloadMedia = async (message: MobileMessage) => { if (!message.media) return; try { await mobileApi.downloadMedia(message.media); } catch { setError("Không thể tải xuống tệp này."); } };
  const revokeMedia = async (message: MobileMessage) => { if (!token || !message.media || message.senderId !== user?.id) return; try { const recalled = await mobileApi.revokeMedia(token, message.id); setMessages((current) => current.map((item) => item.id === recalled.id ? recalled : item)); } catch { setError("Không thể thu hồi tệp. Vui lòng thử lại."); } };

  const online = peer ? onlineIds.includes(peer.id) : false;
  const avatar = peer ? { id: String(peer.id), name: peer.displayName, initials: peer.displayName.split(" ").map((word) => word[0]).slice(0, 2).join(""), avatarColor: ["#8A63D2", "#D35D77", "#2F9E8F", "#3269C6"][peer.id % 4], presence: online ? "online" as const : "offline" as const } : null;

  return <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-[#F4F7FB]" className="flex-1"><Stack.Screen options={{ headerShown: false }} /><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}><View style={styles.header}><IconButton name="chevron.left" onPress={() => router.back()} accessibilityLabel="Quay lại" /><View style={styles.peerHeader}>{avatar ? <Avatar participant={avatar} size={38} /> : null}<View style={styles.peerCopy}><Text numberOfLines={1} style={styles.peerName}>{peer?.displayName ?? "Cuộc trò chuyện"}</Text><Text style={[styles.peerStatus, (online || peerTyping) && styles.online]}>{peerTyping ? "Đang gõ…" : online ? "Đang hoạt động" : peer ? `@${peer.username}` : ""}</Text></View></View><View style={styles.callActions}><IconButton name="phone.fill" onPress={() => peer && router.push({ pathname: "/call", params: { peerId: String(peer.id), peerName: peer.displayName, mode: "audio" } })} accessibilityLabel="Gọi thoại" color="#1577E8" /><IconButton name="video.fill" onPress={() => peer && router.push({ pathname: "/call", params: { peerId: String(peer.id), peerName: peer.displayName, mode: "video" } })} accessibilityLabel="Gọi video" color="#1577E8" /></View></View>
    {loading ? <View style={styles.loading}><ActivityIndicator color="#1577E8" /></View> : <FlatList data={messages} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.messageList} renderItem={({ item }) => <MessageBubble message={item} isMine={item.senderId === user?.id} onDownload={() => void downloadMedia(item)} onRevoke={() => void revokeMedia(item)} />} ListEmptyComponent={<Text style={styles.empty}>Chưa có tin nhắn. Hãy gửi lời chào.</Text>} />}
    {peerTyping ? <View style={styles.typingBar}><Text style={styles.typingText}>{peer?.displayName ?? "Người kia"} đang gõ…</Text><View style={styles.typingDots}><View style={styles.dot} /><View style={[styles.dot, styles.dotMiddle]} /><View style={styles.dot} /></View></View> : null}
    {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => setError("")}><Text style={styles.dismiss}>Bỏ</Text></Pressable></View> : null}
    {uploading ? <View style={mediaStyles.uploadTrack}><View style={[mediaStyles.uploadFill, { width: `${Math.max(5, Math.round(uploadProgress * 100))}%` }]} /><Text style={mediaStyles.uploadLabel}>Đang tải {Math.round(uploadProgress * 100)}%</Text><Pressable onPress={cancelMediaUpload} style={mediaStyles.cancelUpload}><Text style={mediaStyles.cancelUploadText}>Hủy</Text></Pressable></View> : null}
    <View style={styles.composer}><Pressable onPress={() => void pickMedia()} disabled={!peer || uploading} accessibilityLabel="Chọn ảnh hoặc video" style={({ pressed }) => [styles.attach, (!peer || uploading) && styles.attachDisabled, pressed && styles.pressed]}>{uploading ? <ActivityIndicator size="small" color="#1577E8" /> : <Text style={styles.attachText}>＋</Text>}</Pressable><TextInput value={draft} onChangeText={handleDraft} onSubmitEditing={() => void send()} placeholder={uploading ? "Đang tải media…" : "Nhập tin nhắn"} placeholderTextColor="#8493A5" style={styles.input} returnKeyType="send" multiline editable={!uploading} /><Pressable onPress={() => void send()} style={({ pressed }) => [styles.send, (!draft.trim() || !peer || uploading) && styles.sendDisabled, pressed && styles.pressed]}><IconSymbol name="paperplane.fill" size={19} color="#FFFFFF" /></Pressable></View>
  </KeyboardAvoidingView></ScreenContainer>;
}

function MessageBubble({ message, isMine, onDownload, onRevoke }: { message: MobileMessage; isMine: boolean; onDownload: () => void; onRevoke: () => void }) {
  const label = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(`${message.createdAt}Z`));
  const readTime = message.readAt ? new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(message.readAt)) : null;
  const deliveryStatus = readTime ? `Đã xem · ${readTime}` : message.deliveredAt ? "Đã nhận" : "Đã gửi";
  const canRecall = isMine && Boolean(message.media) && Date.now() - new Date(`${message.createdAt}Z`).getTime() <= 15 * 60 * 1000;
  if (message.callEvent) { const callText = message.callEvent.status === "missed" ? "Cuộc gọi nhỡ" : message.callEvent.status === "declined" ? "Cuộc gọi bị từ chối" : isMine ? "Cuộc gọi đã được nhận" : "Cuộc gọi đã nghe"; return <View style={[styles.messageRow, isMine && styles.mineRow]}><View style={mediaStyles.callEvent}><Text style={mediaStyles.callIcon}>{message.callEvent.kind === "video" ? "▣" : "⌕"}</Text><View><Text style={mediaStyles.callTitle}>{callText}</Text><Text style={mediaStyles.callDetail}>{message.callEvent.kind === "video" ? "Gọi video" : "Gọi thoại"} · {label}</Text></View></View></View>; }
  const mediaItems = message.mediaItems?.length ? message.mediaItems : message.media ? [message.media] : [];
  return <View style={[styles.messageRow, isMine && styles.mineRow]}><View><View style={[styles.bubble, isMine ? styles.mineBubble : styles.peerBubble]}>{mediaItems.length ? <View style={mediaItems.length > 1 ? mediaStyles.multiMedia : undefined}>{mediaItems.map((media) => <MediaAttachment key={media.url} media={media} compact={mediaItems.length > 1} />)}</View> : message.mediaRevokedAt ? <Text style={mediaStyles.revoked}>Tệp đa phương tiện đã được thu hồi</Text> : null}{message.body ? <Text style={[styles.messageText, isMine && styles.mineText]}>{message.body}</Text> : null}<Text style={[styles.time, isMine && styles.mineTime]}>{label}</Text></View>{mediaItems.length ? <View style={[mediaStyles.mediaActions, isMine && mediaStyles.mineMediaActions]}><Pressable onPress={onDownload}><Text style={mediaStyles.mediaActionText}>Tải xuống</Text></Pressable>{canRecall ? <Pressable onPress={onRevoke}><Text style={mediaStyles.recallText}>Thu hồi</Text></Pressable> : null}</View> : null}{isMine ? <Text style={styles.readReceipt}>{deliveryStatus}</Text> : null}</View></View>;
}
function MediaAttachment({ media, compact = false }: { media: NonNullable<MobileMessage["media"]>; compact?: boolean }) { const url = mobileApi.mediaUrl(media.url); if (media.kind === "image") return <Image source={{ uri: url }} accessibilityLabel={media.name} style={compact ? mediaStyles.compactMedia : styles.imageMedia} resizeMode="cover" />; return <VideoAttachment url={url} compact={compact} />; }
function VideoAttachment({ url, compact = false }: { url: string; compact?: boolean }) { const [play, setPlay] = useState(false); const player = useVideoPlayer(play ? { uri: url, useCaching: true } : null); return play ? <VideoView player={player} style={compact ? mediaStyles.compactMedia : styles.videoMedia} nativeControls allowsFullscreen contentFit="cover" surfaceType="textureView" /> : <Pressable onPress={() => setPlay(true)} style={compact ? mediaStyles.compactMedia : mediaStyles.videoPreview}><Image source={{ uri: url }} style={mediaStyles.videoPreviewImage} /><View style={mediaStyles.playBadge}><Text style={mediaStyles.playText}>▶</Text></View></Pressable>; }

const mediaStyles = StyleSheet.create({ uploadTrack: { height: 26, marginHorizontal: 12, marginBottom: 3, borderRadius: 10, overflow: "hidden", justifyContent: "center", backgroundColor: "#E5F0FA" }, uploadFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 10, backgroundColor: "#B9DBFB" }, uploadLabel: { alignSelf: "center", color: "#236A9F", fontSize: 10, fontWeight: "900" }, cancelUpload: { position: "absolute", right: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, backgroundColor: "#FFFFFF" }, cancelUploadText: { color: "#B74A55", fontSize: 10, fontWeight: "900" }, videoPreview: { width: 220, height: 150, borderRadius: 12, overflow: "hidden", marginBottom: 4, backgroundColor: "#112238", alignItems: "center", justifyContent: "center" }, videoPreviewImage: { width: "100%", height: "100%", opacity: 0.82 }, playBadge: { position: "absolute", width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(8,32,57,0.78)" }, playText: { color: "#FFFFFF", fontSize: 18, marginLeft: 2 }, multiMedia: { width: 220, flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 4 }, compactMedia: { width: 108, height: 92, borderRadius: 10, overflow: "hidden", backgroundColor: "#112238" }, callEvent: { minWidth: 184, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#EAF4FF" }, callIcon: { color: "#1577E8", fontSize: 20, fontWeight: "900" }, callTitle: { color: "#1C527F", fontSize: 13, fontWeight: "900" }, callDetail: { marginTop: 2, color: "#7390AA", fontSize: 10 }, revoked: { color: "#788A9E", fontSize: 12, fontStyle: "italic" }, mediaActions: { marginTop: 4, flexDirection: "row", gap: 12 }, mineMediaActions: { justifyContent: "flex-end" }, mediaActionText: { color: "#44789D", fontSize: 10, fontWeight: "800" }, recallText: { color: "#C25058", fontSize: 10, fontWeight: "800" } });

const styles = StyleSheet.create({ flex: { flex: 1 }, header: { height: 64, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#E4ECF4", shadowColor: "#153150", shadowOpacity: 0.03, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 1 }, peerHeader: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 9 }, peerCopy: { minWidth: 0, flex: 1 }, peerName: { color: "#153150", fontWeight: "900", fontSize: 15 }, peerStatus: { marginTop: 1, color: "#8392A4", fontSize: 10 }, online: { color: "#198A68", fontWeight: "700" }, callActions: { flexDirection: "row" }, loading: { flex: 1, alignItems: "center", justifyContent: "center" }, messageList: { flexGrow: 1, paddingHorizontal: 15, paddingTop: 16, paddingBottom: 24, gap: 8 }, messageRow: { flexDirection: "row", justifyContent: "flex-start" }, mineRow: { justifyContent: "flex-end" }, bubble: { maxWidth: "80%", borderRadius: 18, paddingHorizontal: 12, paddingVertical: 9 }, peerBubble: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 5 }, mineBubble: { backgroundColor: "#D9ECFF", borderTopRightRadius: 5 }, messageText: { color: "#25415D", fontSize: 14, lineHeight: 20 }, mineText: { color: "#0A4A87" }, imageMedia: { width: 220, height: 180, borderRadius: 12, marginBottom: 4, backgroundColor: "#DCE8F4" }, videoMedia: { width: 220, height: 150, borderRadius: 12, overflow: "hidden", marginBottom: 4, backgroundColor: "#112238" }, time: { textAlign: "right", marginTop: 3, color: "#9AA8B8", fontSize: 9 }, mineTime: { color: "#6F98C0" }, readReceipt: { marginTop: 3, color: "#6F98C0", fontSize: 10, fontWeight: "700", textAlign: "right" }, empty: { marginTop: 38, color: "#8A98AA", fontSize: 13, textAlign: "center" }, typingBar: { marginHorizontal: 12, marginBottom: 6, paddingHorizontal: 11, paddingVertical: 7, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 12, backgroundColor: "#EAF4FF" }, typingText: { color: "#3672A7", fontSize: 11, fontWeight: "700" }, typingDots: { flexDirection: "row", alignItems: "center", gap: 3 }, dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#4A91CE" }, dotMiddle: { opacity: 0.65 }, error: { marginHorizontal: 12, marginBottom: 7, padding: 9, borderRadius: 11, flexDirection: "row", alignItems: "center", backgroundColor: "#FFF0F0" }, errorText: { flex: 1, color: "#BF3840", fontSize: 11 }, dismiss: { color: "#1577E8", fontSize: 11, fontWeight: "800" }, composer: { minHeight: 68, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 12, gap: 8, flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#E4ECF4", shadowColor: "#153150", shadowOpacity: 0.06, shadowRadius: 9, shadowOffset: { width: 0, height: -3 }, elevation: 4 }, attach: { width: 36, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#EAF4FF" }, attachDisabled: { opacity: 0.5 }, attachText: { color: "#1577E8", fontSize: 24, fontWeight: "400", lineHeight: 28 }, input: { flex: 1, minHeight: 42, maxHeight: 96, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 14, backgroundColor: "#F1F5F9", color: "#153150", fontSize: 14 }, send: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#1577E8" }, sendDisabled: { backgroundColor: "#A4C8ED" }, pressed: { opacity: 0.65 } });
