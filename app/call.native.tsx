import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import InCallManager from "react-native-incall-manager";
import { mediaDevices, RTCIceCandidate, RTCPeerConnection, RTCSessionDescription, RTCView } from "react-native-webrtc";

import { IconButton } from "@/components/icon-button";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useMobileAuth } from "@/lib/auth-context";
import { mobileApi } from "@/lib/mobile-api";
import { useMobileSocket } from "@/lib/socket-context";
import { createMobilePeerConfiguration } from "@/lib/mobile-call-config";
import { createMobileMediaConstraints } from "@/lib/call-media-config";
import { createAndroidScreenShareConstraints } from "@/lib/android-screen-share-config";
import { createCallId } from "@/lib/call-id";
import { ICE_RESTART_DELAY_MS, MAX_ICE_RESTART_ATTEMPTS, shouldStartIceRestart } from "@/lib/call-ice-recovery";
import { startCallWaitingTone, startIncomingRingtone, stopCallWaitingTone, stopIncomingRingtone } from "@/lib/sound-feedback";
import type { CallSignalEnvelope } from "@/lib/call-signal-mailbox";

type CallState = "incoming" | "connecting" | "connected" | "ended" | "error";
type PreviewCorner = "left" | "right";
type CallControlIcon = "mic.fill" | "mic.slash.fill" | "speaker.wave.2.fill" | "speaker.slash.fill" | "video.fill" | "video.slash.fill" | "camera.rotate.fill" | "rectangle.on.rectangle";
const QUICK_REPLIES = ["Tôi đang bận, sẽ gọi lại sau.", "Tôi sẽ gọi lại trong ít phút.", "Vui lòng nhắn tin cho tôi nhé."];

function formatDuration(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function asDescription(description: { type?: string; sdp?: string }) {
  if (!description.type || !description.sdp) throw new Error("Signaling SDP không hợp lệ.");
  return new RTCSessionDescription({ type: description.type as any, sdp: description.sdp });
}

export default function CallScreen() {
  const { peerId: peerIdParam, peerName: peerNameParam, direction, mode, callId: callIdParam, autoAnswer, startScreenShare } = useLocalSearchParams<{ peerId: string; peerName?: string; direction?: "incoming"; mode?: "audio" | "video"; callId?: string; autoAnswer?: "1"; startScreenShare?: "1" }>();
  const peerId = Number(peerIdParam);
  const withVideo = mode !== "audio";
  const { token } = useMobileAuth();
  const { incomingOffer, sendSignal, waitForSocket, clearIncomingOffer, consumeCallSignals, subscribeCallSignals, clearCallSignals } = useMobileSocket();
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<any>(null);
  const screenRef = useRef<any>(null);
  const candidatesRef = useRef<any[]>([]);
  const callId = useRef(incomingOffer?.callId ?? callIdParam ?? createCallId());
  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [callState, setCallState] = useState<CallState>(direction === "incoming" ? "incoming" : "connecting");
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(withVideo);
  const [cameraOn, setCameraOn] = useState(withVideo);
  const [previewCorner, setPreviewCorner] = useState<PreviewCorner>("right");
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteIsScreenSharing, setRemoteIsScreenSharing] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [peerName, setPeerName] = useState(peerNameParam?.trim() || `Người dùng #${peerId}`);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signalQueueRef = useRef<Promise<void>>(Promise.resolve());
  const iceRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iceRestartAttemptsRef = useRef(0);
  const autoShareStartedRef = useRef(false);

  const stopCall = (notify = true) => {
    if (iceRestartTimerRef.current) clearTimeout(iceRestartTimerRef.current);
    iceRestartTimerRef.current = null;
    if (notify && peerId) void sendSignal("call:hangup", { toUserId: peerId, callId: callId.current }).catch(() => undefined);
    peerRef.current?.close();
    peerRef.current = null;
    localRef.current?.getTracks().forEach((track: any) => track.stop());
    localRef.current = null;
    screenRef.current?.getTracks().forEach((track: any) => { track.onended = null; track.stop(); });
    screenRef.current = null;
    InCallManager.stop();
    setLocalStream(null);
    setRemoteStream(null);
    setIsRecovering(false);
    setCallState("ended");
    clearIncomingOffer();
    clearCallSignals(callId.current);
  };

  const flushCandidates = async () => {
    const peer = peerRef.current;
    if (!peer) return;
    for (const candidate of candidatesRef.current.splice(0)) await peer.addIceCandidate(new RTCIceCandidate(candidate));
  };

  const setupPeer = async () => {
    if (!token) throw new Error("Phiên đăng nhập đã hết hạn.");
    const peer = new RTCPeerConnection(createMobilePeerConfiguration() as any);
    peer.onicecandidate = ({ candidate }: any) => {
      if (candidate) void sendSignal("call:ice-candidate", { toUserId: peerId, callId: callId.current, candidate: candidate.toJSON() }).catch(() => undefined);
    };
    peer.ontrack = (event: any) => {
      if (event.streams?.[0]) setRemoteStream(event.streams[0]);
    };
    const observeIceConnection = () => {
      const state = peer.iceConnectionState;
      if (state === "connected" || state === "completed") {
        if (iceRestartTimerRef.current) clearTimeout(iceRestartTimerRef.current);
        iceRestartTimerRef.current = null;
        iceRestartAttemptsRef.current = 0;
        setIsRecovering(false);
        setCallState("connected");
        return;
      }
      if (!["disconnected", "failed"].includes(state)) return;
      setIsRecovering(true);
      setCallState("connecting");
      if (direction === "incoming" || iceRestartTimerRef.current) return;
      if (!shouldStartIceRestart(state, iceRestartAttemptsRef.current, true)) {
        setIsRecovering(false);
        setError("Không thể khôi phục kết nối cuộc gọi. Vui lòng gọi lại.");
        setCallState("error");
        return;
      }
      iceRestartTimerRef.current = setTimeout(() => {
        iceRestartTimerRef.current = null;
        void requestIceRestart(peer);
      }, ICE_RESTART_DELAY_MS);
    };
    peer.oniceconnectionstatechange = observeIceConnection;
    peer.onconnectionstatechange = observeIceConnection;
    peerRef.current = peer;
    return peer;
  };

  const getMedia = async () => {
    InCallManager.start({ media: "audio", auto: true });
    InCallManager.setSpeakerphoneOn(withVideo);
    const stream = await mediaDevices.getUserMedia(createMobileMediaConstraints(withVideo) as any);
    localRef.current = stream;
    setLocalStream(stream);
    return stream;
  };

  const requestIceRestart = async (peer: RTCPeerConnection) => {
    const state = peer.iceConnectionState;
    if (!shouldStartIceRestart(state, iceRestartAttemptsRef.current, direction !== "incoming")) return;
    try {
      iceRestartAttemptsRef.current += 1;
      setIsRecovering(true);
      const offer = await peer.createOffer({ iceRestart: true } as any);
      await peer.setLocalDescription(offer);
      await sendSignal("call:offer", {
        toUserId: peerId,
        callId: callId.current,
        description: offer,
        withVideo,
        iceRestart: true,
      });
    } catch {
      if (iceRestartAttemptsRef.current >= MAX_ICE_RESTART_ATTEMPTS) {
        setIsRecovering(false);
        setError("Không thể khôi phục kết nối cuộc gọi. Vui lòng gọi lại.");
        setCallState("error");
      }
    }
  };

  const makeOutgoingCall = async () => {
    try {
      await waitForSocket();
      const stream = await getMedia();
      const peer = await setupPeer();
      stream.getTracks().forEach((track: any) => peer.addTrack(track, stream));
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendSignal("call:offer", { toUserId: peerId, callId: callId.current, description: offer, withVideo });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể truy cập camera hoặc microphone.");
      setCallState("error");
    }
  };

  const acceptCall = async () => {
    try {
      await waitForSocket();
      const invite = incomingOffer?.description
        ? incomingOffer
        : token && callIdParam
          ? await mobileApi.callInvite(token, callIdParam)
          : null;
      if (!invite?.description) throw new Error("Lời mời cuộc gọi đã hết hạn hoặc không còn khả dụng.");
      callId.current = invite.callId;
      const stream = await getMedia();
      const peer = await setupPeer();
      stream.getTracks().forEach((track: any) => peer.addTrack(track, stream));
      await peer.setRemoteDescription(asDescription(invite.description));
      await flushCandidates();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendSignal("call:answer", { toUserId: invite.fromUserId ?? peerId, callId: callId.current, description: answer });
      clearIncomingOffer();
      setCallState("connecting");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể nhận cuộc gọi.");
      setCallState("error");
    }
  };

  useEffect(() => {
    if (peerNameParam?.trim() || !token || !Number.isInteger(peerId)) return;
    void mobileApi.friends(token)
      .then((friends) => {
        const friend = friends.find((item) => item.id === peerId);
        if (friend?.displayName) setPeerName(friend.displayName);
      })
      .catch(() => undefined);
  }, [peerId, peerNameParam, token]);

  useEffect(() => {
    if (direction !== "incoming") void makeOutgoingCall();
    return () => { if (feedbackTimer.current) clearTimeout(feedbackTimer.current); stopCall(false); };
  }, []);

  useEffect(() => {
    if (autoAnswer !== "1" || direction !== "incoming" || callState !== "incoming") return;
    void acceptCall();
  }, [autoAnswer, callState, direction, incomingOffer, token]);

  useEffect(() => {
    if (callState !== "incoming") return;
    startIncomingRingtone();
    return () => stopIncomingRingtone();
  }, [callState]);

  useEffect(() => {
    if (direction === "incoming" || callState !== "connecting") return;
    startCallWaitingTone();
    return () => stopCallWaitingTone();
  }, [callState, direction]);

  const applySignal = useCallback(async ({ event, payload }: CallSignalEnvelope) => {
    if (payload.callId !== callId.current) return;
    if (event === "call:offer" && payload.iceRestart && payload.description && peerRef.current) {
      await peerRef.current.setRemoteDescription(asDescription(payload.description));
      await flushCandidates();
      const answer = await peerRef.current.createAnswer();
      await peerRef.current.setLocalDescription(answer);
      await sendSignal("call:answer", { toUserId: peerId, callId: callId.current, description: answer, iceRestart: true });
      setIsRecovering(false);
    }
    if (event === "call:answer" && payload.description && peerRef.current) {
      await peerRef.current.setRemoteDescription(asDescription(payload.description));
      await flushCandidates();
    }
    if (event === "call:ice-candidate" && payload.candidate) {
      if (peerRef.current?.remoteDescription) await peerRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
      else candidatesRef.current.push(payload.candidate);
    }
    if (event === "call:screen-share") setRemoteIsScreenSharing(Boolean(payload.isScreenSharing));
    if (event === "call:hangup") stopCall(false);
    if (event === "call:error") {
      peerRef.current?.close();
      peerRef.current = null;
      localRef.current?.getTracks().forEach((track: any) => track.stop());
      localRef.current = null;
      InCallManager.stop();
      setLocalStream(null);
      setRemoteStream(null);
      setIsRecovering(false);
      setError(payload.message ?? "Không thể thiết lập cuộc gọi.");
      setCallState("error");
    }
  }, [clearIncomingOffer, clearCallSignals, sendSignal]);

  const enqueueSignal = useCallback((signal: CallSignalEnvelope) => {
    signalQueueRef.current = signalQueueRef.current
      .then(() => applySignal(signal))
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Không thể xử lý tín hiệu cuộc gọi.");
        setCallState("error");
      });
  }, [applySignal]);

  useEffect(() => {
    const unsubscribe = subscribeCallSignals(callId.current, enqueueSignal);
    consumeCallSignals(callId.current).forEach(enqueueSignal);
    return unsubscribe;
  }, [consumeCallSignals, enqueueSignal, subscribeCallSignals]);

  useEffect(() => {
    if (callState !== "connected") return;
    const interval = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [callState]);

  const showFeedback = (message: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback(message);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 1800);
  };

  const toggleMute = () => {
    const next = !muted;
    localRef.current?.getAudioTracks().forEach((track: any) => { track.enabled = !next; });
    InCallManager.setMicrophoneMute(next);
    setMuted(next);
    showFeedback(next ? "Đã tắt micro" : "Đã bật micro");
  };

  const toggleSpeaker = () => {
    const next = !speakerOn;
    InCallManager.setSpeakerphoneOn(next);
    setSpeakerOn(next);
    showFeedback(next ? "Đã bật loa ngoài" : "Đã chuyển về tai nghe");
  };

  const toggleCamera = () => {
    localRef.current?.getVideoTracks().forEach((track: any) => { track.enabled = !cameraOn; });
    setCameraOn((value) => !value);
    showFeedback(cameraOn ? "Đã tắt camera" : "Đã bật camera");
  };

  const switchCamera = () => {
    if (!withVideo || isScreenSharing) return;
    localRef.current?.getVideoTracks().forEach((track: any) => track._switchCamera?.());
  };

  const replaceOutgoingVideo = async (track: any | null) => {
    const sender = peerRef.current?.getSenders().find((item: any) => item.track?.kind === "video");
    if (!sender) throw new Error("Không tìm thấy luồng video để thay thế.");
    await sender.replaceTrack(track);
  };

  const stopScreenShare = async (notify = true) => {
    const currentScreen = screenRef.current;
    const cameraTrack = localRef.current?.getVideoTracks?.()[0] ?? null;
    if (currentScreen) currentScreen.getTracks().forEach((track: any) => { track.onended = null; track.stop(); });
    screenRef.current = null;
    if (cameraTrack && peerRef.current) await replaceOutgoingVideo(cameraTrack);
    if (notify && peerId) await sendSignal("call:screen-share", { toUserId: peerId, callId: callId.current, isScreenSharing: false });
    setIsScreenSharing(false);
    if (notify) showFeedback("Đã dừng chia sẻ màn hình");
  };

  const toggleScreenShare = async () => {
    if (!withVideo) return;
    if (!peerRef.current || callState !== "connected") {
      showFeedback("Hãy chờ cuộc gọi video kết nối trước khi chia sẻ màn hình");
      return;
    }
    try {
      if (isScreenSharing) {
        await stopScreenShare();
        return;
      }
      const displayStream = await mediaDevices.getDisplayMedia(createAndroidScreenShareConstraints() as any);
      const displayTrack = displayStream.getVideoTracks()[0];
      if (!displayTrack) throw new Error("Thiết bị không cung cấp luồng chia sẻ màn hình.");
      displayTrack.onended = () => { void stopScreenShare().catch(() => undefined); };
      await replaceOutgoingVideo(displayTrack);
      screenRef.current = displayStream;
      await sendSignal("call:screen-share", { toUserId: peerId, callId: callId.current, isScreenSharing: true });
      setIsScreenSharing(true);
      showFeedback("Đang chia sẻ màn hình");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể bắt đầu chia sẻ màn hình.");
    }
  };

  useEffect(() => {
    if (startScreenShare !== "1" || !withVideo || callState !== "connected" || autoShareStartedRef.current) return;
    autoShareStartedRef.current = true;
    void toggleScreenShare();
  }, [callState, startScreenShare, withVideo]);

  const leave = () => {
    stopCall(true);
    router.back();
  };

  const declineIncomingCall = (quickReply?: string) => {
    if (peerId) void sendSignal("call:hangup", { toUserId: peerId, callId: callId.current, reason: "declined", ...(quickReply ? { quickReply } : {}) }).catch(() => undefined);
    stopCall(false);
    router.back();
  };

  const status = callState === "connected" ? formatDuration(seconds) : callState === "incoming" ? "Cuộc gọi đến" : callState === "error" ? error : isRecovering ? "Đang khôi phục kết nối…" : "Đang kết nối…";
  const previewStream = isScreenSharing ? screenRef.current : localStream;
  const audioLabel = direction === "incoming" ? "Người gọi" : "Đang gọi";
  const initials = peerName.split(" ").filter(Boolean).map((word) => word[0]).slice(0, 2).join("").toUpperCase() || "KN";

  if (callState === "incoming") return <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-[#081E37]" className="flex-1"><Stack.Screen options={{ headerShown: false }} /><View style={styles.incomingPage}><View style={styles.incomingGlow} /><Text style={styles.incomingKicker}>{withVideo ? "CUỘC GỌI VIDEO ĐẾN" : "CUỘC GỌI THOẠI ĐẾN"}</Text><View style={styles.incomingAvatar}><Text style={styles.incomingInitials}>{initials}</Text></View><Text style={styles.incomingName}>{peerName}</Text><Text style={styles.incomingStatus}>Đang gọi cho bạn…</Text>{showQuickReplies ? <View style={styles.quickReplySheet}><Text style={styles.quickReplyTitle}>Từ chối và gửi tin nhắn</Text>{QUICK_REPLIES.map((reply) => <Pressable key={reply} onPress={() => declineIncomingCall(reply)} style={({ pressed }) => [styles.quickReplyOption, pressed && styles.pressed]}><Text style={styles.quickReplyText}>{reply}</Text></Pressable>)}<Pressable onPress={() => setShowQuickReplies(false)}><Text style={styles.quickReplyDismiss}>Quay lại</Text></Pressable></View> : null}<View style={styles.fullscreenIncomingControls}><ActionButton label="Từ chối" color="#E5484D" onPress={() => declineIncomingCall()} /><ActionButton label="Nhắn nhanh" color="#315B82" onPress={() => setShowQuickReplies(true)} /><ActionButton label="Nhận" color="#19A974" onPress={() => void acceptCall()} /></View></View></ScreenContainer>;

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-[#081E37]" className="flex-1">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.page}>
        <View style={styles.top}>
          <IconButton name="chevron.left" onPress={leave} accessibilityLabel="Kết thúc và quay lại" color="#FFFFFF" background="#173451" />
          {withVideo ? <View style={styles.badge}><IconSymbol name="lock.fill" size={12} color="#A8D3FF" /><Text style={styles.badgeText}>VIDEO P2P</Text></View> : <View style={styles.topSpacer} />}
          <View style={styles.topSpacer} />
        </View>

        <View style={[styles.stage, !withVideo && styles.audioStage]}>
          {withVideo && remoteStream ? <RTCView streamURL={remoteStream.toURL()} style={styles.remoteVideo} objectFit="cover" /> : withVideo ? <Fallback state={callState} /> : <AudioIdentity name={peerName} />}
          {withVideo && remoteIsScreenSharing ? <View style={styles.remoteShareBadge}><Text style={styles.remoteShareText}>Người bên kia đang chia sẻ màn hình</Text></View> : null}
          {withVideo && previewStream ? (
            <Pressable onPress={() => setPreviewCorner((corner) => corner === "right" ? "left" : "right")} accessibilityLabel="Đổi vị trí khung xem trước" style={[styles.localPreview, previewCorner === "left" ? styles.localPreviewLeft : styles.localPreviewRight]}>
              <RTCView streamURL={previewStream.toURL()} style={styles.localVideo} objectFit="cover" mirror={!isScreenSharing} />
              <View style={styles.previewLabel}><Text style={styles.previewLabelText}>{isScreenSharing ? "Màn hình của bạn" : "Bạn · chạm để đổi"}</Text></View>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.nameBox, !withVideo && styles.audioNameBox]}>
          <Text numberOfLines={1} style={styles.title}>{withVideo ? peerName : `${audioLabel}: ${peerName}`}</Text>
          <Text style={styles.status}>{status}</Text>
          <View style={[styles.connectionPill, callState === "connected" && styles.connectionPillReady]}><View style={[styles.connectionDot, callState === "connected" && styles.connectionDotReady]} /><Text style={styles.connectionText}>{callState === "connected" ? "Đã kết nối · P2P bảo mật" : "Đang thiết lập kênh bảo mật"}</Text></View>
        </View>

        {withVideo ? (
          <VideoControls muted={muted} speakerOn={speakerOn} cameraOn={cameraOn} isScreenSharing={isScreenSharing} onMute={toggleMute} onSpeaker={toggleSpeaker} onCamera={toggleCamera} onSwitchCamera={switchCamera} onScreenShare={() => void toggleScreenShare()} onLeave={leave} />
        ) : (
          <View style={styles.controls}>
            <Control icon={muted ? "mic.slash.fill" : "mic.fill"} label={muted ? "Bật mic" : "Tắt mic"} active={muted} onPress={toggleMute} />
            <Control icon={speakerOn ? "speaker.wave.2.fill" : "speaker.slash.fill"} label={speakerOn ? "Loa ngoài" : "Tai nghe"} active={speakerOn} onPress={toggleSpeaker} />
            <EndCallButton onPress={leave} />
          </View>
        )}
        {feedback ? <View style={styles.feedbackToast}><Text style={styles.feedbackText}>{feedback}</Text></View> : null}
      </View>
    </ScreenContainer>
  );
}

function Fallback({ state }: { state: CallState }) {
  return <View style={styles.fallback}><View style={styles.avatar}><Text style={styles.initials}>KN</Text></View><Text style={styles.waiting}>{state === "incoming" ? "Cuộc gọi đến" : state === "error" ? "Không thể kết nối" : "Đang chờ người bên kia bật video…"}</Text></View>;
}

function AudioIdentity({ name }: { name: string }) {
  const initials = name.split(" ").filter(Boolean).map((word) => word[0]).slice(0, 2).join("").toUpperCase() || "KN";
  return <View style={styles.fallback}><View style={[styles.avatar, styles.audioAvatar]}><Text style={styles.initials}>{initials}</Text></View></View>;
}

function Control({ icon, label, active, onPress }: { icon: CallControlIcon; label: string; active: boolean; onPress: () => void }) {
  return <View style={styles.control}><IconButton name={icon} onPress={onPress} accessibilityLabel={label} color="#FFFFFF" background={active ? "#2F6B9D" : "#173451"} /><Text style={styles.controlLabel}>{label}</Text></View>;
}

function EndCallButton({ onPress }: { onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityLabel="Kết thúc cuộc gọi" style={({ pressed }) => [styles.end, pressed && styles.pressed]}><IconSymbol name="phone.down.fill" size={23} color="#FFFFFF" /></Pressable>;
}

function VideoControls({ muted, speakerOn, cameraOn, isScreenSharing, onMute, onSpeaker, onCamera, onSwitchCamera, onScreenShare, onLeave }: { muted: boolean; speakerOn: boolean; cameraOn: boolean; isScreenSharing: boolean; onMute: () => void; onSpeaker: () => void; onCamera: () => void; onSwitchCamera: () => void; onScreenShare: () => void; onLeave: () => void }) {
  return <View style={styles.videoControls}><View style={styles.videoControlRow}><Control icon={muted ? "mic.slash.fill" : "mic.fill"} label={muted ? "Bật mic" : "Tắt mic"} active={muted} onPress={onMute} /><Control icon={speakerOn ? "speaker.wave.2.fill" : "speaker.slash.fill"} label={speakerOn ? "Loa ngoài" : "Tai nghe"} active={speakerOn} onPress={onSpeaker} /><Control icon={cameraOn ? "video.fill" : "video.slash.fill"} label={cameraOn ? "Tắt camera" : "Bật camera"} active={!cameraOn} onPress={onCamera} /><Control icon="camera.rotate.fill" label="Đổi camera" active={false} onPress={onSwitchCamera} /><Control icon="rectangle.on.rectangle" label={isScreenSharing ? "Dừng chia sẻ" : "Chia sẻ màn hình"} active={isScreenSharing} onPress={onScreenShare} /></View><EndCallButton onPress={onLeave} /></View>;
}

function ActionButton({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.action, { backgroundColor: color }, pressed && styles.pressed]}><Text style={styles.actionText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#081E37" },
  top: { paddingTop: 10, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 15, backgroundColor: "#173451" },
  badgeText: { color: "#B7D9F9", fontSize: 11, fontWeight: "800" },
  topSpacer: { width: 42 },
  stage: { flex: 1, overflow: "hidden", marginHorizontal: 16, marginTop: 16, borderRadius: 26, backgroundColor: "#102E50", borderWidth: 1, borderColor: "#214363" },
  audioStage: { justifyContent: "center" },
  remoteVideo: { flex: 1 },
  remoteShareBadge: { position: "absolute", left: 14, right: 14, top: 14, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 11, backgroundColor: "rgba(11,60,99,0.92)" },
  remoteShareText: { color: "#D9EDFF", fontSize: 10, fontWeight: "900", textAlign: "center" },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  avatar: { width: 142, height: 142, borderRadius: 71, alignItems: "center", justifyContent: "center", backgroundColor: "#1D5283", borderWidth: 3, borderColor: "#80BFFF" },
  audioAvatar: { width: 156, height: 156, borderRadius: 78, backgroundColor: "#195B94", shadowColor: "#43A7FF", shadowOpacity: 0.3, shadowRadius: 22, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  initials: { color: "#E4F2FF", fontSize: 52, fontWeight: "900", letterSpacing: -4 },
  waiting: { color: "#B4C8DD", marginTop: 17, fontSize: 13 },
  localPreview: { position: "absolute", top: 16, width: 110, height: 156, overflow: "hidden", borderRadius: 18, borderWidth: 2, borderColor: "#FFFFFF", backgroundColor: "#254E71", shadowColor: "#000000", shadowOpacity: 0.28, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  localPreviewRight: { right: 16 },
  localPreviewLeft: { left: 16 },
  localVideo: { flex: 1 },
  previewLabel: { position: "absolute", left: 0, right: 0, bottom: 0, paddingVertical: 6, backgroundColor: "rgba(4,22,40,0.72)" },
  previewLabelText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800", textAlign: "center" },
  nameBox: { alignItems: "center", paddingTop: 15, paddingBottom: 12 },
  audioNameBox: { paddingTop: 13 },
  title: { maxWidth: "86%", color: "#FFFFFF", fontWeight: "900", fontSize: 18, textAlign: "center" },
  status: { color: "#AAC6E4", marginTop: 4, fontSize: 12 },
  connectionPill: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: "#183956" },
  connectionPillReady: { backgroundColor: "#103F37" },
  connectionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#F4B740" },
  connectionDotReady: { backgroundColor: "#49D2A5" },
  connectionText: { color: "#CEE0F1", fontSize: 10, fontWeight: "800" },
  controls: { minHeight: 88, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 18 },
  videoControls: { minHeight: 142, alignItems: "center", justifyContent: "center", gap: 11, paddingHorizontal: 10, paddingTop: 2, paddingBottom: 15 },
  videoControlRow: { width: "100%", flexDirection: "row", alignItems: "flex-start", justifyContent: "space-around", gap: 2 },
  control: { width: 54, alignItems: "center", gap: 5 },
  controlLabel: { color: "#CBDCEA", fontSize: 9, fontWeight: "700", lineHeight: 11, textAlign: "center" },
  end: { width: 56, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#E5484D", shadowColor: "#000000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  incomingPage: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden", paddingHorizontal: 28, backgroundColor: "#081E37" },
  incomingGlow: { position: "absolute", width: 420, height: 420, borderRadius: 210, backgroundColor: "#135B96", opacity: 0.26, top: "13%" },
  incomingKicker: { color: "#A8D3FF", fontSize: 12, fontWeight: "900", letterSpacing: 1.5, marginBottom: 28 },
  incomingAvatar: { width: 164, height: 164, borderRadius: 82, alignItems: "center", justifyContent: "center", backgroundColor: "#1D5283", borderWidth: 4, borderColor: "#8FC8FF", shadowColor: "#43A7FF", shadowOpacity: 0.42, shadowRadius: 24, elevation: 8 },
  incomingInitials: { color: "#F0F8FF", fontSize: 58, fontWeight: "900", letterSpacing: -4 },
  incomingName: { maxWidth: "90%", marginTop: 23, color: "#FFFFFF", fontSize: 25, fontWeight: "900", textAlign: "center" },
  incomingStatus: { marginTop: 7, color: "#B8CFE7", fontSize: 14 },
  fullscreenIncomingControls: { position: "absolute", left: 20, right: 20, bottom: 34, flexDirection: "row", justifyContent: "space-between", gap: 8 },
  action: { flex: 1, minHeight: 49, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, borderRadius: 15 },
  actionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  quickReplySheet: { position: "absolute", left: 20, right: 20, bottom: 104, padding: 14, borderRadius: 20, backgroundColor: "#FFFFFF", shadowColor: "#000000", shadowOpacity: 0.26, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 12 },
  quickReplyTitle: { color: "#173451", fontSize: 13, fontWeight: "900", marginBottom: 8 },
  quickReplyOption: { paddingVertical: 11, borderTopWidth: 1, borderTopColor: "#E4ECF4" },
  quickReplyText: { color: "#315B82", fontSize: 13, lineHeight: 18 },
  quickReplyDismiss: { color: "#1577E8", textAlign: "center", fontSize: 12, fontWeight: "900", marginTop: 8 },
  feedbackToast: { position: "absolute", left: 28, right: 28, bottom: 154, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 14, backgroundColor: "rgba(13,48,75,0.96)", borderWidth: 1, borderColor: "#4F93C8", shadowColor: "#000000", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  feedbackText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900", textAlign: "center" },
  pressed: { opacity: 0.62 },
});
