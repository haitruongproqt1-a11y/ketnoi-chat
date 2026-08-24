import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { SOCKET_URL, type ChatMedia, type MobileMessage } from "./mobile-api";
import { useMobileAuth } from "./auth-context";

type SignalEvent = "call:offer" | "call:answer" | "call:ice-candidate" | "call:hangup";
type CallSignal = { fromUserId?: number; toUserId?: number; callId: string; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit; withVideo?: boolean; callerName?: string; reason?: "ended" | "missed" | "declined"; quickReply?: string };
type ChatTyping = { fromUserId: number; isTyping: boolean };
type ChatReadReceipt = { readerId: number; peerId: number; messageIds: number[]; readAt: string };
type ChatDeliveryReceipt = { recipientId: number; messageIds: number[]; deliveredAt: string };
type ChatMediaRecall = { messageId: number; revokedAt: string };
type SocketContextValue = {
  socket: Socket | null;
  onlineIds: number[];
  lastMessage: MobileMessage | null;
  lastTyping: ChatTyping | null;
  lastReadReceipt: ChatReadReceipt | null;
  lastDeliveryReceipt: ChatDeliveryReceipt | null;
  lastMediaRecall: ChatMediaRecall | null;
  incomingOffer: CallSignal | null;
  latestSignal: { event: SignalEvent; payload: CallSignal } | null;
  sendMessage: (recipientId: number, body: string, media?: ChatMedia, mediaItems?: ChatMedia[]) => Promise<MobileMessage>;
  sendTyping: (recipientId: number, isTyping: boolean) => void;
  sendSignal: (event: SignalEvent, payload: CallSignal) => void;
  clearSignal: () => void;
  clearIncomingOffer: () => void;
};

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token } = useMobileAuth();
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [onlineIds, setOnlineIds] = useState<number[]>([]);
  const [lastMessage, setLastMessage] = useState<MobileMessage | null>(null);
  const [lastTyping, setLastTyping] = useState<ChatTyping | null>(null);
  const [lastReadReceipt, setLastReadReceipt] = useState<ChatReadReceipt | null>(null);
  const [lastDeliveryReceipt, setLastDeliveryReceipt] = useState<ChatDeliveryReceipt | null>(null);
  const [lastMediaRecall, setLastMediaRecall] = useState<ChatMediaRecall | null>(null);
  const [incomingOffer, setIncomingOffer] = useState<CallSignal | null>(null);
  const [latestSignal, setLatestSignal] = useState<SocketContextValue["latestSignal"]>(null);

  useEffect(() => {
    if (!token) { socketRef.current?.disconnect(); socketRef.current = null; setSocket(null); setOnlineIds([]); setLastTyping(null); setLastReadReceipt(null); setLastDeliveryReceipt(null); setLastMediaRecall(null); return; }
    const instance = io(SOCKET_URL, { auth: { token }, transports: ["websocket", "polling"] });
    socketRef.current = instance;
    setSocket(instance);
    instance.on("presence:list", (ids: number[]) => setOnlineIds(ids));
    instance.on("presence:changed", ({ userId, online }: { userId: number; online: boolean }) => setOnlineIds((current) => online ? [...new Set([...current, userId])] : current.filter((id) => id !== userId)));
    instance.on("chat:new", (message: MobileMessage) => setLastMessage(message));
    instance.on("chat:typing", (payload: ChatTyping) => setLastTyping(payload));
    instance.on("chat:read", (payload: ChatReadReceipt) => setLastReadReceipt(payload));
    instance.on("chat:delivered", (payload: ChatDeliveryReceipt) => setLastDeliveryReceipt(payload));
    instance.on("chat:media-recalled", (payload: ChatMediaRecall) => setLastMediaRecall(payload));
    const signalEvents: SignalEvent[] = ["call:offer", "call:answer", "call:ice-candidate", "call:hangup"];
    signalEvents.forEach((event) => instance.on(event, (payload: CallSignal) => {
      if (event === "call:offer") setIncomingOffer(payload);
      setLatestSignal({ event, payload });
    }));
    return () => { instance.disconnect(); if (socketRef.current === instance) socketRef.current = null; };
  }, [token]);

  const value = useMemo<SocketContextValue>(() => ({
    socket,
    onlineIds,
    lastMessage,
    lastTyping,
    lastReadReceipt,
    lastDeliveryReceipt,
    lastMediaRecall,
    incomingOffer,
    latestSignal,
    sendMessage: (recipientId, body, media, mediaItems) => new Promise<MobileMessage>((resolve, reject) => {
      const instance = socketRef.current;
      if (!instance) { reject(new Error("Socket chưa sẵn sàng")); return; }
      instance.emit("chat:send", { recipientId, body, media, mediaItems }, (reply: { ok: boolean; message?: MobileMessage; error?: string }) => {
        if (reply.ok && reply.message) resolve(reply.message);
        else reject(new Error(reply.error ?? "Không gửi được tin nhắn"));
      });
    }),
    sendTyping: (recipientId, isTyping) => socketRef.current?.emit("chat:typing", { recipientId, isTyping }),
    sendSignal: (event, payload) => socketRef.current?.emit(event, payload),
    clearSignal: () => setLatestSignal(null),
    clearIncomingOffer: () => setIncomingOffer(null),
  }), [incomingOffer, lastDeliveryReceipt, lastMediaRecall, lastMessage, lastReadReceipt, lastTyping, latestSignal, onlineIds, socket]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useMobileSocket() {
  const context = useContext(SocketContext);
  if (!context) throw new Error("useMobileSocket must be used inside SocketProvider");
  return context;
}
