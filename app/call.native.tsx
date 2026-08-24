import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { mediaDevices, RTCIceCandidate, RTCPeerConnection, RTCSessionDescription, RTCView } from "react-native-webrtc";

import { IconButton } from "@/components/icon-button";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useMobileAuth } from "@/lib/auth-context";
import { mobileApi } from "@/lib/mobile-api";
import { useMobileSocket } from "@/lib/socket-context";
import { createMobilePeerConfiguration } from "@/lib/mobile-call-config";

type CallState = "incoming" | "connecting" | "connected" | "ended" | "error";

function toNativeDescription(description: { type?: string; sdp?: string }) {
  if (!description.type || !description.sdp) throw new Error("Signaling SDP không hợp lệ.");
  return new RTCSessionDescription({ type: description.type as any, sdp: description.sdp });
}

export default function CallScreen() {
  const { peerId: peerIdParam, direction, mode } = useLocalSearchParams<{ peerId: string; direction?: "incoming"; mode?: "audio" | "video" }>();
  const peerId = Number(peerIdParam);
  const withVideo = mode !== "audio";
  const { token } = useMobileAuth();
  const { incomingOffer, latestSignal, sendSignal, clearIncomingOffer, clearSignal } = useMobileSocket();
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<any>(null);
  const pendingCandidates = useRef<any[]>([]);
  const callId = useRef(incomingOffer?.callId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [state, setState] = useState<CallState>(direction === "incoming" ? "incoming" : "connecting");
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(withVideo);
  const [error, setError] = useState("");

  const stop = (notify = true) => {
    if (notify && peerId) sendSignal("call:hangup", { toUserId: peerId, callId: callId.current });
    peerConnection.current?.close();
    peerConnection.current = null;
    localStreamRef.current?.getTracks().forEach((track: any) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null); setRemoteStream(null); setState("ended"); clearIncomingOffer(); clearSignal();
  };

  const flushCandidates = async () => {
    const peer = peerConnection.current;
    if (!peer) return;
    for (const candidate of pendingCandidates.current.splice(0)) await peer.addIceCandidate(new RTCIceCandidate(candidate));
  };

  const createPeer = async () => {
    if (!token) throw new Error("Phiên đăng nhập đã hết hạn.");
    const ice = await mobileApi.iceConfig(token);
    const peer = new RTCPeerConnection(createMobilePeerConfiguration(ice) as any);
    peer.onicecandidate = ({ candidate }: any) => { if (candidate) sendSignal("call:ice-candidate", { toUserId: peerId, callId: callId.current, candidate: candidate.toJSON() }); };
    peer.ontrack = (event: any) => { if (event.streams?.[0]) setRemoteStream(event.streams[0]); };
    peer.onconnectionstatechange = () => { if (peer.connectionState === "connected") setState("connected"); if (["failed", "disconnected"].includes(peer.connectionState)) setError("Kết nối cuộc gọi đã bị ngắt."); };
    peerConnection.current = peer;
    return peer;
  };

  const getLocalMedia = async () => {
    const stream = await mediaDevices.getUserMedia({ audio: true, video: withVideo ? { facingMode: "user", frameRate: 30 } : false });
    localStreamRef.current = stream; setLocalStream(stream); return stream;
  };

  const beginOutgoing = async () => {
    try {
      const stream = await getLocalMedia(); const peer = await createPeer();
      stream.getTracks().forEach((track: any) => peer.addTrack(track, stream));
      const offer = await peer.createOffer(); await peer.setLocalDescription(offer);
      sendSignal("call:offer", { toUserId: peerId, callId: callId.current, description: offer, withVideo });
      setState("connecting");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể truy cập camera hoặc microphone."); setState("error"); }
  };

  const acceptIncoming = async () => {
    if (!incomingOffer?.description) return;
    callId.current = incomingOffer.callId;
    try {
      const stream = await getLocalMedia(); const peer = await createPeer();
      stream.getTracks().forEach((track: any) => peer.addTrack(track, stream));
      await peer.setRemoteDescription(toNativeDescription(incomingOffer.description)); await flushCandidates();
      const answer = await peer.createAnswer(); await peer.setLocalDescription(answer);
      sendSignal("call:answer", { toUserId: peerId, callId: callId.current, description: answer });
      clearIncomingOffer(); setState("connecting");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể nhận cuộc gọi."); setState("error"); }
  };

  useEffect(() => { if (direction !== "incoming") void beginOutgoing(); return () => stop(false); }, []);
  useEffect(() => {
    if (!latestSignal || latestSignal.payload.callId !== callId.current) return;
    const { event, payload } = latestSignal;
    if (event === "call:answer" && payload.description && peerConnection.current) void peerConnection.current.setRemoteDescription(toNativeDescription(payload.description)).then(flushCandidates);
    if (event === "call:ice-candidate" && payload.candidate) {
      if (peerConnection.current?.remoteDescription) void peerConnection.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
      else pendingCandidates.current.push(payload.candidate);
    }
    if (event === "call:hangup") stop(false);
  }, [latestSignal]);

  const toggleMute = () => { localStreamRef.current?.getAudioTracks().forEach((track: any) => { track.enabled = muted; }); setMuted((value) => !value); };
  const toggleCamera = () => { localStreamRef.current?.getVideoTracks().forEach((track: any) => { track.enabled = !cameraOn; }); setCameraOn((value) => !value); };
  const reject = () => { stop(true); router.back(); };

  return <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-[#081E37]" className="flex-1"><Stack.Screen options={{ headerShown: false }} /><View style={styles.page}><View style={styles.top}><IconButton name="chevron.left" onPress={reject} accessibilityLabel="Quay lại" color="#FFFFFF" background="#173451" /><View style={styles.badge}><IconSymbol name="lock.fill" size={12} color="#A8D3FF" /><Text style={styles.badgeText}>WebRTC P2P</Text></View><View style={styles.placeholderTop} /></View><View style={styles.stage}>{remoteStream && withVideo ? <RTCView streamURL={remoteStream.toURL()} style={styles.remoteVideo} objectFit="cover" /> : <View style={styles.remoteFallback}><Text style={styles.initials}>KN</Text><Text style={styles.waiting}>{state === "incoming" ? "Cuộc gọi đến" : state === "error" ? "Không thể kết nối" : "Đang chờ người bên kia…"}</Text></View>}{withVideo && localStream ? <RTCView streamURL={localStream.toURL()} style={styles.localVideo} objectFit="cover" mirror /> : null}</View><View style={styles.nameBox}><Text style={styles.peerTitle}>Cuộc gọi với người dùng #{peerId}</Text><Text style={styles.callState}>{state === "connected" ? "Đã kết nối" : state === "incoming" ? "Đang chờ bạn xác nhận" : state === "error" ? error : "Đang thiết lập kết nối…"}</Text></View>{state === "incoming" ? <View style={styles.incomingControls}><Pressable onPress={reject} style={({ pressed }) => [styles.reject, pressed && styles.pressed]}><Text style={styles.controlText}>Từ chối</Text></Pressable><Pressable onPress={() => void acceptIncoming()} style={({ pressed }) => [styles.accept, pressed && styles.pressed]}><Text style={styles.controlText}>Nhận cuộc gọi</Text></Pressable></View> : <View style={styles.controls}><CallControl icon={muted ? "mic.slash.fill" : "mic.fill"} label={muted ? "Bật tiếng" : "Tắt tiếng"} active={muted} onPress={toggleMute} />{withVideo ? <CallControl icon={cameraOn ? "video.fill" : "video.slash.fill"} label="Video" active={!cameraOn} onPress={toggleCamera} /> : null}<Pressable onPress={reject} style={({ pressed }) => [styles.end, pressed && styles.pressed]}><IconSymbol name="phone.down.fill" size={25} color="#FFFFFF" /></Pressable></View>}</View></ScreenContainer>;
}

function CallControl({ icon, label, active, onPress }: { icon: "mic.fill" | "mic.slash.fill" | "video.fill" | "video.slash.fill"; label: string; active: boolean; onPress: () => void }) { return <View style={styles.control}><IconButton name={icon} onPress={onPress} accessibilityLabel={label} color="#FFFFFF" background={active ? "#2F6B9D" : "#173451"} /><Text style={styles.controlLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: "#081E37" }, top: { paddingTop: 8, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, badge: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: "#173451", borderRadius: 15 }, badgeText: { color: "#B7D9F9", fontSize: 11, fontWeight: "800" }, placeholderTop: { width: 42 }, stage: { flex: 1, overflow: "hidden", marginHorizontal: 15, marginTop: 16, borderRadius: 26, backgroundColor: "#102E50" }, remoteVideo: { flex: 1 }, remoteFallback: { flex: 1, alignItems: "center", justifyContent: "center" }, initials: { color: "#B8DBFF", fontSize: 74, fontWeight: "900", letterSpacing: -6 }, waiting: { color: "#B4C8DD", marginTop: 12, fontSize: 13 }, localVideo: { position: "absolute", right: 16, top: 16, width: 96, height: 132, borderRadius: 16, overflow: "hidden", borderWidth: 2, borderColor: "#FFFFFF" }, nameBox: { alignItems: "center", paddingVertical: 14 }, peerTitle: { color: "#FFFFFF", fontWeight: "900", fontSize: 18 }, callState: { color: "#AAC6E4", marginTop: 4, fontSize: 12 }, controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 25, paddingBottom: 17 }, control: { alignItems: "center", gap: 4 }, controlLabel: { color: "#CBDCEA", fontSize: 10, fontWeight: "700" }, end: { width: 58, height: 50, alignItems: "center", justifyContent: "center", borderRadius: 19, backgroundColor: "#E5484D" }, incomingControls: { flexDirection: "row", justifyContent: "center", gap: 12, paddingBottom: 20 }, reject: { paddingVertical: 14, paddingHorizontal: 22, borderRadius: 15, backgroundColor: "#E5484D" }, accept: { paddingVertical: 14, paddingHorizontal: 22, borderRadius: 15, backgroundColor: "#19A974" }, controlText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" }, pressed: { opacity: 0.62 } });
