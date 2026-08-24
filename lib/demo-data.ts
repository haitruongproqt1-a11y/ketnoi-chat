import type { CallLogEntry, ChatMessage, ChatParticipant, ConversationSummary } from "@/shared/chat-types";

export const CURRENT_USER: ChatParticipant = {
  id: "me",
  name: "Bạn",
  initials: "B",
  avatarColor: "#0A284A",
  presence: "online",
};

export const PARTICIPANTS: ChatParticipant[] = [
  { id: "linh", name: "Linh Trần", initials: "LT", avatarColor: "#8A63D2", presence: "online" },
  { id: "minh", name: "Minh Anh", initials: "MA", avatarColor: "#D35D77", presence: "online" },
  { id: "thanh", name: "Thanh Lê", initials: "TL", avatarColor: "#2F9E8F", presence: "away", lastActiveLabel: "Hoạt động 12 phút trước" },
  { id: "nhom", name: "Nhóm Kết Nối", initials: "KN", avatarColor: "#E28B3C", presence: "online" },
  { id: "quynh", name: "Quỳnh Phạm", initials: "QP", avatarColor: "#3269C6", presence: "offline", lastActiveLabel: "Hoạt động hôm qua" },
  { id: "khoa", name: "Khoa Nguyễn", initials: "KN", avatarColor: "#4A9278", presence: "offline", lastActiveLabel: "Hoạt động 2 giờ trước" },
];

export const CONVERSATIONS: ConversationSummary[] = [
  { id: "linh", participant: PARTICIPANTS[0], latestPreview: "Tối nay mình gọi trao đổi nhé.", updatedAtLabel: "09:41", unreadCount: 2, isPinned: true },
  { id: "minh", participant: PARTICIPANTS[1], latestPreview: "Đã xem ảnh bạn gửi", updatedAtLabel: "08:26", unreadCount: 0 },
  { id: "thanh", participant: PARTICIPANTS[2], latestPreview: "Cuộc gọi video · 18:24", updatedAtLabel: "Hôm qua", unreadCount: 0 },
  { id: "nhom", participant: PARTICIPANTS[3], latestPreview: "Hà: Mọi người chốt lịch họp nhé", updatedAtLabel: "Hôm qua", unreadCount: 4 },
  { id: "quynh", participant: PARTICIPANTS[4], latestPreview: "Cảm ơn bạn nhiều!", updatedAtLabel: "Thứ 6", unreadCount: 0 },
];

export const DEMO_MESSAGES: Record<string, ChatMessage[]> = {
  linh: [
    { id: "m-1", conversationId: "linh", senderId: "linh", kind: "text", body: "Chào bạn, phần thiết kế hôm nay ổn chứ?", createdAt: "09:32", isMine: false, delivery: "seen" },
    { id: "m-2", conversationId: "linh", senderId: "me", kind: "text", body: "Ổn rồi, mình vừa cập nhật bản mới.", createdAt: "09:34", isMine: true, delivery: "seen" },
    { id: "m-3", conversationId: "linh", senderId: "linh", kind: "text", body: "Tốt quá. Tối nay mình gọi trao đổi nhé.", createdAt: "09:41", isMine: false, delivery: "delivered" },
  ],
  minh: [
    { id: "m-4", conversationId: "minh", senderId: "me", kind: "image", body: "Đã gửi một ảnh", createdAt: "08:18", isMine: true, delivery: "seen" },
    { id: "m-5", conversationId: "minh", senderId: "minh", kind: "text", body: "Đã xem ảnh bạn gửi", createdAt: "08:26", isMine: false, delivery: "seen" },
  ],
  thanh: [
    { id: "m-6", conversationId: "thanh", senderId: "thanh", kind: "call", body: "Cuộc gọi video · 18:24", createdAt: "Hôm qua", isMine: false, delivery: "seen" },
  ],
  nhom: [
    { id: "m-7", conversationId: "nhom", senderId: "nhom", kind: "text", body: "Hà: Mọi người chốt lịch họp nhé", createdAt: "Hôm qua", isMine: false, delivery: "seen" },
  ],
  quynh: [
    { id: "m-8", conversationId: "quynh", senderId: "quynh", kind: "text", body: "Cảm ơn bạn nhiều!", createdAt: "Thứ 6", isMine: false, delivery: "seen" },
  ],
};

export const CALL_LOGS: CallLogEntry[] = [
  { id: "c-1", participant: PARTICIPANTS[0], kind: "video", direction: "outgoing", occurredAtLabel: "Hôm nay, 09:12", durationLabel: "12:08" },
  { id: "c-2", participant: PARTICIPANTS[2], kind: "audio", direction: "missed", occurredAtLabel: "Hôm qua, 18:24" },
  { id: "c-3", participant: PARTICIPANTS[1], kind: "video", direction: "incoming", occurredAtLabel: "Hôm qua, 14:08", durationLabel: "05:42" },
  { id: "c-4", participant: PARTICIPANTS[4], kind: "audio", direction: "incoming", occurredAtLabel: "Thứ 6, 10:16", durationLabel: "02:19" },
];

export function getParticipant(id?: string): ChatParticipant {
  return PARTICIPANTS.find((participant) => participant.id === id) ?? PARTICIPANTS[0];
}
