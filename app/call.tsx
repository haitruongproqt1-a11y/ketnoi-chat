import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useMobileAuth } from "@/lib/auth-context";
import { mobileApi } from "@/lib/mobile-api";
import { useMobileSocket } from "@/lib/socket-context";
import { createMobilePeerConfiguration } from "@/lib/mobile-call-config";

type CallState = "incoming" | "connecting" | "connected" | "ended" | "error";
const HtmlVideo = "video" as any;

function formatDuration(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function asDescription(description: { type?: string; sdp?: string }) {
  if (!description.type || !description.sdp) throw new Error("Signaling SDP không hợp lệ.");
  return new RTCSessionDescription({ type: description.type as RTCSdpType, sdp: description.sdp });
}

function VideoSurface({ stream, muted, style }: { stream: any; muted: boolean; style: any }) {
  const ref = useRef<any>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream ?? null;
  }, [stream]);
  return <HtmlVideo ref={ref} autoPlay playsInline muted={muted} style={style} />;
}

export default function WebCallScreen() {
  const { peerId: peerIdParam, peerName: peerNameParam, direction, mode } = useLocalSearchParams<{ peerId: string; peerName?: string; direction?: "incoming"; mode?: "audio" | "video" }>();
  const peerId = Number(peerIdParam);
  const withVideo = mode !== "audio";
  const { token } = useMobileAuth();
  const { incomingOffer, latestSignal, sendSignal, clearIncomingOffer, clearSignal } = useMobileSocket();
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<any>(null);
  const screenRef = useRef<any>(null);
  const candidatesRef = useRef<any[]>([]);
  const callId = useRef(incomingOffer?.callId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [callState, setCallState] = useState<CallState>(direction === "incoming" ? "incoming" : "connecting");
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(withVideo);
  const [frontCamera, setFrontCamera] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteIsScreenSharing, setRemoteIsScreenSharing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const peerName = peerNameParam?.trim() || `Người dùng #${peerId}`;

  const stopCall = (notify = true) => {
    if (notify && peerId) sendSignal("call:hangup", { toUserId: peerId, callId: callId.current, reason: "ended" });
    peerRef.current?.close();
    peerRef.current = null;
    localRef.current?.getTracks().forEach((track: any) => track.stop());
    screenRef.current?.getTracks().forEach((track: any) => track.stop());
    localRef.current = null;
    screenRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setIsScreenSharing(false);
    setRemoteIsScreenSharing(false);
    clearIncomingOffer();
    clearSignal();
    setCallState("ended");
  };

  const flushCandidates = async () => {
    const peer = peerRef.current;
    if (!peer) return;
    for (const candidate of candidatesRef.current.splice(0)) await peer.addIceCandidate(new RTCIceCandidate(candidate));
  };

  const setupPeer = async () => {
    if (!token) throw new Error("Phiên đăng nhập đã hết hạn.");
    const peer = new RTCPeerConnection(createMobilePeerConfiguration(await mobileApi.iceConfig(token)) as RTCConfiguration);
    peer.onicecandidate = ({ candidate }) => {
      if (candidate) sendSignal("call:ice-candidate", { toUserId: peerId, callId: callId.current, candidate: candidate.toJSON() });
    };
    peer.ontrack = (event) => setRemoteStream(event.streams?.[0] ?? new MediaStream([event.track]));
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") setCallState("connected");
      if (peer.connectionState === "failed") {
        setError("Kết nối cuộc gọi không thành công.");
        setCallState("error");
      }
    };
    peerRef.current = peer;
    return peer;
  };

  const getMedia = async () => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Trình duyệt không hỗ trợ camera hoặc microphone.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo ? { facingMode: "user", frameRate: { ideal: 30 } } : false });
    localRef.current = stream;
    setLocalStream(stream);
    return stream;
  };

  const makeOutgoingCall = async () => {
    try {
      const stream = await getMedia();
      const peer = await setupPeer();
      stream.getTracks().forEach((track: any) => peer.addTrack(track, stream));
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      sendSignal("call:offer", { toUserId: peerId, callId: callId.current, description: offer, withVideo });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể truy cập camera hoặc microphone.");
      setCallState("error");
    }
  };

  const acceptCall = async () => {
    if (!incomingOffer?.description) return;
    callId.current = incomingOffer.callId;
    try {
      const stream = await getMedia();
      const peer = await setupPeer();
      stream.getTracks().forEach((track: any) => peer.addTrack(track, stream));
      await peer.setRemoteDescription(asDescription(incomingOffer.description));
      await flushCandidates();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      sendSignal("call:answer", { toUserId: peerId, callId: callId.current, description: answer });
      clearIncomingOffer();
      setCallState("connecting");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể nhận cuộc gọi.");
      setCallState("error");
    }
  };

  useEffect(() => {
    if (direction !== "incoming") void makeOutgoingCall();
    return () => stopCall(false);
  }, []);

  useEffect(() => {
    if (!latestSignal || latestSignal.payload.callId !== callId.current) return;
    const { event, payload } = latestSignal;
    if (event === "call:answer" && payload.description && peerRef.current) void peerRef.current.setRemoteDescription(asDescription(payload.description)).then(flushCandidates);
    if (event === "call:ice-candidate" && payload.candidate) {
      if (peerRef.current?.remoteDescription) void peerRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
      else candidatesRef.current.push(payload.candidate);
    }
    if (event === "call:screen-share") setRemoteIsScreenSharing(Boolean(payload.isScreenSharing));
    if (event === "call:hangup") stopCall(false);
  }, [latestSignal]);

  useEffect(() => {
    if (callState !== "connected") return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [callState]);

  const toggleMute = () => {
    const next = !muted;
    localRef.current?.getAudioTracks().forEach((track: any) => { track.enabled = !next; });
    setMuted(next);
  };

  const toggleCamera = () => {
    const next = !cameraOn;
    localRef.current?.getVideoTracks().forEach((track: any) => { track.enabled = next; });
    setCameraOn(next);
  };

  const switchCamera = async () => {
    if (!withVideo || isScreenSharing || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const nextFront = !frontCamera;
      const replacement = await navigator.mediaDevices.getUserMedia({ video: { facingMode: nextFront ? "user" : "environment", frameRate: { ideal: 30 } }, audio: false });
      const nextTrack = replacement.getVideoTracks()[0];
      if (!nextTrack) throw new Error("Không tìm thấy camera phù hợp.");
      await replaceOutgoingVideo(nextTrack);
      const currentTrack = localRef.current?.getVideoTracks?.()[0];
      if (currentTrack && localRef.current) localRef.current.removeTrack(currentTrack);
      currentTrack?.stop();
      localRef.current?.addTrack(nextTrack);
      setLocalStream(localRef.current);
      setFrontCamera(nextFront);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể chuyển camera trên trình duyệt này.");
    }
  };

  const replaceOutgoingVideo = async (track: any | null) => {
    const sender = peerRef.current?.getSenders().find((item) => item.track?.kind === "video");
    if (!sender) throw new Error("Không tìm thấy luồng video để thay thế.");
    await sender.replaceTrack(track);
  };

  const stopScreenShare = async (notify = true) => {
    const screen = screenRef.current;
    const cameraTrack = localRef.current?.getVideoTracks?.()[0] ?? null;
    if (screen) screen.getTracks().forEach((track: any) => { track.onended = null; track.stop(); });
    screenRef.current = null;
    if (cameraTrack) await replaceOutgoingVideo(cameraTrack);
    if (notify && peerId) sendSignal("call:screen-share", { toUserId: peerId, callId: callId.current, isScreenSharing: false });
    setIsScreenSharing(false);
  };

  const toggleScreenShare = async () => {
    if (!withVideo || !peerRef.current) return;
    try {
      if (isScreenSharing) {
        await stopScreenShare();
        return;
      }
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Trình duyệt này không hỗ trợ chia sẻ màn hình.");
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const displayTrack = displayStream.getVideoTracks()[0];
      if (!displayTrack) throw new Error("Không có màn hình hoặc cửa sổ nào được chọn.");
      displayTrack.onended = () => { void stopScreenShare(); };
      await replaceOutgoingVideo(displayTrack);
      screenRef.current = displayStream;
      sendSignal("call:screen-share", { toUserId: peerId, callId: callId.current, isScreenSharing: true });
      setIsScreenSharing(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể bắt đầu chia sẻ màn hình.");
    }
  };

  const leave = () => {
    stopCall(true);
    router.back();
  };

  const decline = () => {
    if (peerId) sendSignal("call:hangup", { toUserId: peerId, callId: callId.current, reason: "declined" });
    stopCall(false);
    router.back();
  };

  const status = callState === "connected" ? formatDuration(seconds) : callState === "incoming" ? "Cuộc gọi đến" : callState === "error" ? error : callState === "ended" ? "Cuộc gọi đã kết thúc" : "Đang kết nối…";
  const previewStream = isScreenSharing ? screenRef.current : localStream;

  if (callState === "incoming") {
    return <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-[#071A31]" className="flex-1"><Stack.Screen options={{ headerShown: false }} /><View style={styles.incomingPage}><Text style={styles.kicker}>{withVideo ? "CUỘC GỌI VIDEO ĐẾN" : "CUỘC GỌI THOẠI ĐẾN"}</Text><View style={styles.avatar}><Text style={styles.initials}>{peerName.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase()}</Text></View><Text style={styles.name}>{peerName}</Text><Text style={styles.incomingCopy}>Đang gọi cho bạn…</Text><View style={styles.incomingControls}><Control label="Từ chối" tone="danger" onPress={decline} /><Control label="Nhận cuộc gọi" tone="success" onPress={() => void acceptCall()} /></View></View></ScreenContainer>;
  }

  return <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-[#071A31]" className="flex-1"><Stack.Screen options={{ headerShown: false }} /><View style={styles.page}><View style={styles.top}><View><Text style={styles.kicker}>{withVideo ? "VIDEO WEBRTC P2P" : "THOẠI WEBRTC P2P"}</Text><Text style={styles.name}>{peerName}</Text></View><Text style={styles.timer}>{status}</Text></View><View style={[styles.stage, !withVideo && styles.audioStage]}>{withVideo && remoteStream ? <VideoSurface stream={remoteStream} muted={false} style={styles.remoteVideo} /> : <View style={styles.person}><View style={styles.avatar}><Text style={styles.initials}>{peerName.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase()}</Text></View><Text style={styles.waiting}>{callState === "error" ? "Không thể kết nối" : "Đang chờ luồng media từ người bên kia…"}</Text></View>}{remoteIsScreenSharing ? <View style={styles.remoteShareBadge}><Text style={styles.remoteShareText}>Người bên kia đang chia sẻ màn hình</Text></View> : null}{withVideo && previewStream ? <View style={styles.preview}><VideoSurface stream={previewStream} muted style={styles.previewVideo} /><Text style={styles.previewLabel}>{isScreenSharing ? "Màn hình của bạn" : "Camera của bạn"}</Text></View> : null}</View><View style={styles.controls}><Control label={muted ? "Bật mic" : "Tắt mic"} active={muted} onPress={toggleMute} /><Control label={cameraOn ? "Tắt camera" : "Bật camera"} active={!cameraOn} disabled={!withVideo} onPress={toggleCamera} />{withVideo ? <Control label="Đổi camera" disabled={isScreenSharing} onPress={() => void switchCamera()} /> : null}{withVideo ? <Control label={isScreenSharing ? "Dừng chia sẻ" : "Chia sẻ"} active={isScreenSharing} onPress={() => void toggleScreenShare()} /> : null}<Control label="Kết thúc" tone="danger" onPress={leave} /></View>{error ? <Text style={styles.error}>{error}</Text> : null}</View></ScreenContainer>;
}

function Control({ label, active = false, disabled = false, tone = "default", onPress }: { label: string; active?: boolean; disabled?: boolean; tone?: "default" | "danger" | "success"; onPress: () => void }) {
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.control, active && styles.controlActive, tone === "danger" && styles.controlDanger, tone === "success" && styles.controlSuccess, disabled && styles.controlDisabled, pressed && styles.pressed]}><Text style={[styles.controlText, (active || tone !== "default") && styles.controlTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 18 }, top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, kicker: { color: "#76B8FF", fontSize: 10, letterSpacing: 0.8, fontWeight: "900" }, name: { marginTop: 5, color: "#FFFFFF", fontSize: 20, fontWeight: "900" }, timer: { maxWidth: "46%", color: "#DDEBFA", fontWeight: "800", fontSize: 12, textAlign: "right" }, stage: { flex: 1, marginTop: 18, overflow: "hidden", borderRadius: 26, backgroundColor: "#0E2A49", borderWidth: 1, borderColor: "#294A6D" }, audioStage: { justifyContent: "center" }, remoteVideo: { width: "100%", height: "100%", objectFit: "cover", backgroundColor: "#08182A" }, person: { flex: 1, alignItems: "center", justifyContent: "center" }, avatar: { width: 104, height: 104, borderRadius: 52, backgroundColor: "#267BE0", alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: "#7DC0FF" }, initials: { color: "#FFFFFF", fontWeight: "900", fontSize: 32 }, waiting: { marginTop: 16, color: "#B8CEE5", fontSize: 12, textAlign: "center" }, preview: { position: "absolute", right: 14, top: 14, width: 112, height: 158, overflow: "hidden", borderRadius: 16, backgroundColor: "#254B6D", borderWidth: 2, borderColor: "#76B8FF" }, previewVideo: { width: "100%", height: "100%", objectFit: "cover", backgroundColor: "#254B6D" }, previewLabel: { position: "absolute", left: 0, right: 0, bottom: 0, paddingVertical: 5, color: "#FFFFFF", backgroundColor: "rgba(7,26,49,0.78)", fontSize: 9, fontWeight: "800", textAlign: "center" }, remoteShareBadge: { position: "absolute", left: 14, right: 14, top: 14, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 11, backgroundColor: "rgba(11,60,99,0.9)" }, remoteShareText: { color: "#D9EDFF", fontSize: 10, fontWeight: "900", textAlign: "center" }, controls: { marginTop: 16, gap: 9, flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }, control: { minWidth: 96, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 13, backgroundColor: "#153653", borderWidth: 1, borderColor: "#31587A" }, controlActive: { backgroundColor: "#D9EDFF", borderColor: "#D9EDFF" }, controlDanger: { backgroundColor: "#DD4A54", borderColor: "#DD4A54" }, controlSuccess: { backgroundColor: "#15996B", borderColor: "#15996B" }, controlDisabled: { opacity: 0.38 }, controlText: { color: "#DCEBFA", fontSize: 11, fontWeight: "900", textAlign: "center" }, controlTextActive: { color: "#FFFFFF" }, error: { color: "#FFB7BB", fontSize: 11, textAlign: "center", marginTop: 9 }, pressed: { opacity: 0.65 }, incomingPage: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }, incomingCopy: { color: "#B8CEE5", marginTop: 8, fontSize: 13 }, incomingControls: { position: "absolute", left: 20, right: 20, bottom: 36, flexDirection: "row", justifyContent: "space-between", gap: 10 },
});
