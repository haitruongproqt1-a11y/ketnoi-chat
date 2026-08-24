import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { SOCKET_URL, type MobileMessage } from "./mobile-api";
import { useMobileAuth } from "./auth-context";

type SignalEvent = "call:offer" | "call:answer" | "call:ice-candidate" | "call:hangup";
type CallSignal = { fromUserId?: number; toUserId?: number; callId: string; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit; withVideo?: boolean };
type SocketContextValue = {
  socket: Socket | null;
  onlineIds: number[];
  lastMessage: MobileMessage | null;
  incomingOffer: CallSignal | null;
  latestSignal: { event: SignalEvent; payload: CallSignal } | null;
  sendMessage: (recipientId: number, body: string) => Promise<MobileMessage>;
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
  const [incomingOffer, setIncomingOffer] = useState<CallSignal | null>(null);
  const [latestSignal, setLatestSignal] = useState<SocketContextValue["latestSignal"]>(null);

  useEffect(() => {
    if (!token) { socketRef.current?.disconnect(); socketRef.current = null; setSocket(null); setOnlineIds([]); return; }
    const instance = io(SOCKET_URL, { auth: { token }, transports: ["websocket", "polling"] });
    socketRef.current = instance;
    setSocket(instance);
    instance.on("presence:list", (ids: number[]) => setOnlineIds(ids));
    instance.on("presence:changed", ({ userId, online }: { userId: number; online: boolean }) => setOnlineIds((current) => online ? [...new Set([...current, userId])] : current.filter((id) => id !== userId)));
    instance.on("chat:new", (message: MobileMessage) => setLastMessage(message));
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
    incomingOffer,
    latestSignal,
    sendMessage: (recipientId, body) => new Promise<MobileMessage>((resolve, reject) => {
      const instance = socketRef.current;
      if (!instance) { reject(new Error("Socket chưa sẵn sàng")); return; }
      instance.emit("chat:send", { recipientId, body }, (reply: { ok: boolean; message?: MobileMessage; error?: string }) => {
        if (reply.ok && reply.message) resolve(reply.message);
        else reject(new Error(reply.error ?? "Không gửi được tin nhắn"));
      });
    }),
    sendSignal: (event, payload) => socketRef.current?.emit(event, payload),
    clearSignal: () => setLatestSignal(null),
    clearIncomingOffer: () => setIncomingOffer(null),
  }), [incomingOffer, lastMessage, latestSignal, onlineIds, socket]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useMobileSocket() {
  const context = useContext(SocketContext);
  if (!context) throw new Error("useMobileSocket must be used inside SocketProvider");
  return context;
}
