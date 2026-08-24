export type Presence = "online" | "away" | "offline";

export type CallKind = "audio" | "video";

export type CallStage = "ringing" | "connecting" | "connected" | "ended";

export type MessageKind = "text" | "image" | "file" | "voice" | "call";

export interface ChatParticipant {
  id: string;
  name: string;
  avatarColor: string;
  initials: string;
  presence: Presence;
  lastActiveLabel?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  kind: MessageKind;
  body: string;
  createdAt: string;
  isMine: boolean;
  delivery: "sent" | "delivered" | "seen";
}

export interface ConversationSummary {
  id: string;
  participant: ChatParticipant;
  latestPreview: string;
  updatedAtLabel: string;
  unreadCount: number;
  isPinned?: boolean;
}

export interface CallLogEntry {
  id: string;
  participant: ChatParticipant;
  kind: CallKind;
  direction: "incoming" | "outgoing" | "missed";
  occurredAtLabel: string;
  durationLabel?: string;
}

export interface CallSession {
  id: string;
  participant: ChatParticipant;
  kind: CallKind;
  stage: CallStage;
  isMuted: boolean;
  isCameraEnabled: boolean;
  isSpeakerEnabled: boolean;
  isScreenSharing: boolean;
  elapsedSeconds: number;
}

export interface IceServerDescriptor {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface IceConfigurationPayload {
  expiresAt: string;
  iceServers: IceServerDescriptor[];
}
