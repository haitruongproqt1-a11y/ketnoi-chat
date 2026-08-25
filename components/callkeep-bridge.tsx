import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";

import { clearSystemCall, getSystemCall, initializeCallKeep, presentIncomingSystemCall, RNCallKeep } from "@/lib/callkeep";
import { useMobileAuth } from "@/lib/auth-context";
import { mobileApi } from "@/lib/mobile-api";
import { useMobileSocket } from "@/lib/socket-context";

export function CallKeepBridge() {
  const { token } = useMobileAuth();
  const { incomingOffer, sendSignal, clearIncomingOffer } = useMobileSocket();
  const router = useRouter();
  const displayedCallIds = useRef(new Set<string>());

  useEffect(() => {
    if (!token || Platform.OS === "web") return;
    let disposed = false;
    let answer: { remove: () => void } | undefined;
    let end: { remove: () => void } | undefined;
    void initializeCallKeep().then((ready) => {
      if (!ready || disposed) return;
      answer = RNCallKeep.addEventListener("answerCall", ({ callUUID }) => {
        const call = getSystemCall(callUUID);
        if (!call) return;
        router.push({ pathname: "/call", params: { peerId: String(call.peerId), peerName: call.peerName, direction: "incoming", mode: call.withVideo ? "video" : "audio", callId: call.callId, autoAnswer: "1" } });
      });
      end = RNCallKeep.addEventListener("endCall", ({ callUUID }) => {
        const call = getSystemCall(callUUID);
        if (!call) return;
        sendSignal("call:hangup", { toUserId: call.peerId, callId: call.callId, reason: "declined" });
        void mobileApi.declineCall(token, call.callId).catch(() => undefined);
        clearSystemCall(callUUID);
        clearIncomingOffer();
      });
    }).catch(() => undefined);
    return () => { disposed = true; answer?.remove(); end?.remove(); };
  }, [clearIncomingOffer, router, sendSignal, token]);

  useEffect(() => {
    if (!incomingOffer?.fromUserId || Platform.OS === "web" || displayedCallIds.current.has(incomingOffer.callId)) return;
    void initializeCallKeep()
      .then((ready) => {
        if (!ready || displayedCallIds.current.has(incomingOffer.callId)) return;
        displayedCallIds.current.add(incomingOffer.callId);
        presentIncomingSystemCall({ callId: incomingOffer.callId, peerId: incomingOffer.fromUserId!, peerName: incomingOffer.callerName ?? `Người dùng #${incomingOffer.fromUserId}`, withVideo: Boolean(incomingOffer.withVideo), direction: "incoming" });
      })
      .catch(() => undefined);
  }, [incomingOffer]);

  return null;
}
