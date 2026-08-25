import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { mobileApi, SOCKET_URL, type ChatMedia, type MobileMessage } from "./mobile-api";
import { useMobileAuth } from "./auth-context";
import { playFriendRequestFeedback, playIncomingMessageTone } from "./sound-feedback";
import {
  CallSignalMailbox,
  type CallSignalEnvelope,
  type CallSignalEvent,
  type CallSignalPayload,
} from "./call-signal-mailbox";

type ChatTyping = { fromUserId: number; isTyping: boolean };
type ChatReadReceipt = { readerId: number; peerId: number; messageIds: number[]; readAt: string };
type ChatDeliveryReceipt = { recipientId: number; messageIds: number[]; deliveredAt: string };
type ChatMediaRecall = { messageId: number; revokedAt: string };
type ChatDeleted = { messageId: number; peerId: number };
type ChatCleared = { peerId: number; clearedAt: string };
type SocketContextValue = {
  socket: Socket | null;
  onlineIds: number[];
  lastMessage: MobileMessage | null;
  lastTyping: ChatTyping | null;
  lastReadReceipt: ChatReadReceipt | null;
  lastDeliveryReceipt: ChatDeliveryReceipt | null;
  lastMediaRecall: ChatMediaRecall | null;
  lastMessageRecall: MobileMessage | null;
  lastDeletedMessage: ChatDeleted | null;
  lastClearedConversation: ChatCleared | null;
  pendingFriendRequestCount: number;
  refreshPendingFriendRequestCount: () => Promise<void>;
  incomingOffer: CallSignalPayload | null;
  latestSignal: CallSignalEnvelope | null;
  sendMessage: (recipientId: number, body: string, media?: ChatMedia, mediaItems?: ChatMedia[]) => Promise<MobileMessage>;
  sendTyping: (recipientId: number, isTyping: boolean) => void;
  waitForSocket: () => Promise<void>;
  sendSignal: (event: CallSignalEvent, payload: CallSignalPayload) => Promise<void>;
  consumeCallSignals: (callId: string) => CallSignalEnvelope[];
  subscribeCallSignals: (callId: string, listener: (signal: CallSignalEnvelope) => void) => () => void;
  clearCallSignals: (callId: string) => void;
  clearSignal: () => void;
  clearIncomingOffer: () => void;
};

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useMobileAuth();
  const socketRef = useRef<Socket | null>(null);
  const callMailboxRef = useRef(new CallSignalMailbox());
  const [socket, setSocket] = useState<Socket | null>(null);
  const [onlineIds, setOnlineIds] = useState<number[]>([]);
  const [lastMessage, setLastMessage] = useState<MobileMessage | null>(null);
  const [lastTyping, setLastTyping] = useState<ChatTyping | null>(null);
  const [lastReadReceipt, setLastReadReceipt] = useState<ChatReadReceipt | null>(null);
  const [lastDeliveryReceipt, setLastDeliveryReceipt] = useState<ChatDeliveryReceipt | null>(null);
  const [lastMediaRecall, setLastMediaRecall] = useState<ChatMediaRecall | null>(null);
  const [lastMessageRecall, setLastMessageRecall] = useState<MobileMessage | null>(null);
  const [lastDeletedMessage, setLastDeletedMessage] = useState<ChatDeleted | null>(null);
  const [lastClearedConversation, setLastClearedConversation] = useState<ChatCleared | null>(null);
  const [pendingFriendRequestCount, setPendingFriendRequestCount] = useState(0);
  const [incomingOffer, setIncomingOffer] = useState<CallSignalPayload | null>(null);
  const [latestSignal, setLatestSignal] = useState<SocketContextValue["latestSignal"]>(null);

  const refreshPendingFriendRequestCount = useCallback(async () => {
    if (!token) { setPendingFriendRequestCount(0); return; }
    try {
      const requests = await mobileApi.friendRequests(token);
      setPendingFriendRequestCount(requests.filter((request) => request.status === "pending").length);
    } catch {
      setPendingFriendRequestCount(0);
    }
  }, [token]);

  useEffect(() => {
    if (!token) { socketRef.current?.disconnect(); socketRef.current = null; callMailboxRef.current.clearAll(); setSocket(null); setOnlineIds([]); setLastTyping(null); setLastReadReceipt(null); setLastDeliveryReceipt(null); setLastMediaRecall(null); setLastMessageRecall(null); setLastDeletedMessage(null); setLastClearedConversation(null); setPendingFriendRequestCount(0); return; }
    void refreshPendingFriendRequestCount();
    const instance = io(SOCKET_URL, { auth: { token }, transports: ["websocket", "polling"] });
    socketRef.current = instance;
    setSocket(instance);
    instance.on("presence:list", (ids: number[]) => setOnlineIds(ids));
    instance.on("presence:changed", ({ userId, online }: { userId: number; online: boolean }) => setOnlineIds((current) => online ? [...new Set([...current, userId])] : current.filter((id) => id !== userId)));
    instance.on("chat:new", (message: MobileMessage) => { if (message.senderId !== user?.id) playIncomingMessageTone(); setLastMessage(message); });
    instance.on("chat:typing", (payload: ChatTyping) => setLastTyping(payload));
    instance.on("chat:read", (payload: ChatReadReceipt) => setLastReadReceipt(payload));
    instance.on("chat:delivered", (payload: ChatDeliveryReceipt) => setLastDeliveryReceipt(payload));
    instance.on("chat:media-recalled", (payload: ChatMediaRecall) => setLastMediaRecall(payload));
    instance.on("chat:recalled", (message: MobileMessage) => setLastMessageRecall(message));
    instance.on("chat:deleted", (payload: ChatDeleted) => setLastDeletedMessage(payload));
    instance.on("chat:cleared", (payload: ChatCleared) => setLastClearedConversation(payload));
    instance.on("friend:request", () => { playFriendRequestFeedback(); setPendingFriendRequestCount((count) => count + 1); });
    const signalEvents: CallSignalEvent[] = ["call:offer", "call:answer", "call:ice-candidate", "call:hangup", "call:screen-share", "call:error"];
    signalEvents.forEach((event) => instance.on(event, (payload: CallSignalPayload) => {
      callMailboxRef.current.push({ event, payload });
      if (event === "call:offer") setIncomingOffer(payload);
      setLatestSignal({ event, payload });
    }));
    return () => { instance.disconnect(); if (socketRef.current === instance) socketRef.current = null; };
  }, [refreshPendingFriendRequestCount, token, user?.id]);

  const value = useMemo<SocketContextValue>(() => ({
    socket,
    onlineIds,
    lastMessage,
    lastTyping,
    lastReadReceipt,
    lastDeliveryReceipt,
    lastMediaRecall,
    lastMessageRecall,
    lastDeletedMessage,
    lastClearedConversation,
    pendingFriendRequestCount,
    refreshPendingFriendRequestCount,
    incomingOffer,
    latestSignal,
    sendMessage: (recipientId, body, media, mediaItems) => new Promise<MobileMessage>((resolve, reject) => {
      const instance = socketRef.current;
      if (!instance?.connected) {
        if (!token) { reject(new Error("Phiên đăng nhập đã hết hạn.")); return; }
        void mobileApi.sendMessage(token, recipientId, body, media, mediaItems).then(resolve, reject);
        return;
      }
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (!token) reject(new Error("Kết nối gửi tin nhắn đã hết hạn."));
        else void mobileApi.sendMessage(token, recipientId, body, media, mediaItems).then(resolve, reject);
      }, 8000);
      instance.emit("chat:send", { recipientId, body, media, mediaItems }, (reply: { ok: boolean; message?: MobileMessage; error?: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (reply.ok && reply.message) resolve(reply.message);
        else reject(new Error(reply.error ?? "Không gửi được tin nhắn"));
      });
    }),
    sendTyping: (recipientId, isTyping) => socketRef.current?.emit("chat:typing", { recipientId, isTyping }),
    waitForSocket: () => new Promise<void>((resolve, reject) => {
      const instance = socketRef.current;
      if (instance?.connected) {
        resolve();
        return;
      }
      if (!instance) {
        reject(new Error("Kết nối signaling chưa sẵn sàng."));
        return;
      }
      const timeout = setTimeout(() => {
        instance.off("connect", connected);
        instance.off("connect_error", failed);
        reject(new Error("Không thể kết nối máy chủ signaling."));
      }, 8_000);
      const connected = () => {
        clearTimeout(timeout);
        instance.off("connect_error", failed);
        resolve();
      };
      const failed = () => {
        clearTimeout(timeout);
        instance.off("connect", connected);
        reject(new Error("Không thể kết nối máy chủ signaling."));
      };
      instance.once("connect", connected);
      instance.once("connect_error", failed);
    }),
    sendSignal: async (event, payload) => {
      const instance = socketRef.current;
      if (!instance) throw new Error("Kết nối signaling chưa sẵn sàng.");
      if (!instance.connected) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            instance.off("connect", connected);
            instance.off("connect_error", failed);
            reject(new Error("Không thể kết nối máy chủ signaling."));
          }, 8_000);
          const connected = () => {
            clearTimeout(timeout);
            instance.off("connect_error", failed);
            resolve();
          };
          const failed = () => {
            clearTimeout(timeout);
            instance.off("connect", connected);
            reject(new Error("Không thể kết nối máy chủ signaling."));
          };
          instance.once("connect", connected);
          instance.once("connect_error", failed);
        });
      }
      instance.emit(event, payload);
    },
    consumeCallSignals: (callId) => callMailboxRef.current.consume(callId),
    subscribeCallSignals: (callId, listener) => callMailboxRef.current.subscribe(callId, listener),
    clearCallSignals: (callId) => callMailboxRef.current.clear(callId),
    clearSignal: () => setLatestSignal(null),
    clearIncomingOffer: () => setIncomingOffer(null),
  }), [incomingOffer, lastClearedConversation, lastDeletedMessage, lastDeliveryReceipt, lastMediaRecall, lastMessage, lastMessageRecall, lastReadReceipt, lastTyping, latestSignal, onlineIds, pendingFriendRequestCount, refreshPendingFriendRequestCount, socket, token]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useMobileSocket() {
  const context = useContext(SocketContext);
  if (!context) throw new Error("useMobileSocket must be used inside SocketProvider");
  return context;
}
