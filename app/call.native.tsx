import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import InCallManager from "react-native-incall-manager";
import { mediaDevices, RTCIceCandidate, RTCPeerConnection, RTCSessionDescription, RTCView } from "react-native-webrtc";

import { IconButton } from "@/components/icon-button";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useMobileAuth } from "@/lib/auth-context";
import { mobileApi } from "@/lib/mobile-api";
import { useMobileSocket } from "@/lib/socket-context";
import { createMobilePeerConfiguration } from "@/lib/mobile-call-config";

type CallState = "incoming" | "connecting" | "connected" | "ended" | "error";
type PreviewCorner = "left" | "right";

function formatDuration(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function asDescription(description: { type?: string; sdp?: string }) {
  if (!description.type || !description.sdp) throw new Error("Signaling SDP không hợp lệ.");
  return new RTCSessionDescription({ type: description.type as any, sdp: description.sdp });
}

export default function CallScreen() {
  const { peerId: peerIdParam, direction, mode } = useLocalSearchParams<{ peerId: string; direction?: "incoming"; mode?: "audio" | "video" }>();
  const peerId = Number(peerIdParam);
  const withVideo = mode !== "audio";
  const { token } = useMobileAuth();
  const { incomingOffer, latestSignal, sendSignal, clearIncomingOffer, clearSignal } = useMobileSocket();
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<any>(null);
  const candidatesRef = useRef<any[]>([]);
  const callId = useRef(incomingOffer?.callId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [callState, setCallState] = useState<CallState>(direction === "incoming" ? "incoming" : "connecting");
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(withVideo);
  const [cameraOn, setCameraOn] = useState(withVideo);
  const [previewCorner, setPreviewCorner] = useState<PreviewCorner>("right");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");

  const stopCall = (notify = true) => {
    if (notify && peerId) sendSignal("call:hangup", { toUserId: peerId, callId: callId.current });
    peerRef.current?.close();
    peerRef.current = null;
    localRef.current?.getTracks().forEach((track: any) => track.stop());
    localRef.current = null;
    InCallManager.stop();
    setLocalStream(null); setRemoteStream(null); setCallState("ended"); clearIncomingOffer(); clearSignal();
  };

  const flushCandidates = async () => {
    const peer = peerRef.current;
    if (!peer) return;
    for (const candidate of candidatesRef.current.splice(0)) await peer.addIceCandidate(new RTCIceCandidate(candidate));
  };

  const setupPeer = async () => {
    if (!token) throw new Error("Phiên đăng nhập đã hết hạn.");
    const peer = new RTCPeerConnection(createMobilePeerConfiguration(await mobileApi.iceConfig(token)) as any);
    peer.onicecandidate = ({ candidate }: any) => { if (candidate) sendSignal("call:ice-candidate", { toUserId: peerId, callId: callId.current, candidate: candidate.toJSON() }); };
    peer.ontrack = (event: any) => { if (event.streams?.[0]) setRemoteStream(event.streams[0]); };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") setCallState("connected");
      if (["failed", "disconnected"].includes(peer.connectionState)) { setError("Kết nối cuộc gọi đã bị ngắt."); setCallState("error"); }
    };
    peerRef.current = peer;
    return peer;
  };

  const getMedia = async () => {
    InCallManager.start({ media: "audio", auto: true });
    InCallManager.setSpeakerphoneOn(withVideo);
    const stream = await mediaDevices.getUserMedia({ audio: true, video: withVideo ? { facingMode: "user", frameRate: 30 } : false });
    localRef.current = stream; setLocalStream(stream);
    return stream;
  };

  const makeOutgoingCall = async () => {
    try {
      const stream = await getMedia(); const peer = await setupPeer();
      stream.getTracks().forEach((track: any) => peer.addTrack(track, stream));
      const offer = await peer.createOffer(); await peer.setLocalDescription(offer);
      sendSignal("call:offer", { toUserId: peerId, callId: callId.current, description: offer, withVideo });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể truy cập camera hoặc microphone."); setCallState("error"); }
  };

  const acceptCall = async () => {
    if (!incomingOffer?.description) return;
    callId.current = incomingOffer.callId;
    try {
      const stream = await getMedia(); const peer = await setupPeer();
      stream.getTracks().forEach((track: any) => peer.addTrack(track, stream));
      await peer.setRemoteDescription(asDescription(incomingOffer.description)); await flushCandidates();
      const answer = await peer.createAnswer(); await peer.setLocalDescription(answer);
      sendSignal("call:answer", { toUserId: peerId, callId: callId.current, description: answer });
      clearIncomingOffer(); setCallState("connecting");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể nhận cuộc gọi."); setCallState("error"); }
  };

  useEffect(() => { if (direction !== "incoming") void makeOutgoingCall(); return () => stopCall(false); }, []);
  useEffect(() => {
    if (!latestSignal || latestSignal.payload.callId !== callId.current) return;
    const { event, payload } = latestSignal;
    if (event === "call:answer" && payload.description && peerRef.current) void peerRef.current.setRemoteDescription(asDescription(payload.description)).then(flushCandidates);
    if (event === "call:ice-candidate" && payload.candidate) {
      if (peerRef.current?.remoteDescription) void peerRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
      else candidatesRef.current.push(payload.candidate);
    }
    if (event === "call:hangup") stopCall(false);
  }, [latestSignal]);
  useEffect(() => {
    if (callState !== "connected") return;
    const interval = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [callState]);

  const toggleMute = () => { const next = !muted; localRef.current?.getAudioTracks().forEach((track: any) => { track.enabled = !next; }); InCallManager.setMicrophoneMute(next); setMuted(next); };
  const toggleSpeaker = () => { const next = !speakerOn; InCallManager.setSpeakerphoneOn(next); setSpeakerOn(next); };
  const toggleCamera = () => { localRef.current?.getVideoTracks().forEach((track: any) => { track.enabled = !cameraOn; }); setCameraOn((value) => !value); };
  const leave = () => { stopCall(true); router.back(); };
  const status = callState === "connected" ? formatDuration(seconds) : callState === "incoming" ? "Cuộc gọi đến" : callState === "error" ? error : "Đang kết nối…";

  return <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-[#081E37]" className="flex-1"><Stack.Screen options={{ headerShown: false }} /><View style={styles.page}><View style={styles.top}><IconButton name="chevron.left" onPress={leave} accessibilityLabel="Quay lại" color="#FFFFFF" background="#173451" /><View style={styles.badge}><IconSymbol name="lock.fill" size={12} color="#A8D3FF" /><Text style={styles.badgeText}>{withVideo ? "VIDEO P2P" : "GỌI THOẠI P2P"}</Text></View><View style={styles.topSpacer} /></View><View style={[styles.stage, !withVideo && styles.audioStage]}>{withVideo && remoteStream ? <RTCView streamURL={remoteStream.toURL()} style={styles.remoteVideo} objectFit="cover" /> : <Fallback audioOnly={!withVideo} state={callState} />}{withVideo && localStream ? <Pressable onPress={() => setPreviewCorner((corner) => corner === "right" ? "left" : "right")} accessibilityLabel="Đổi vị trí video của bạn" style={[styles.localPreview, previewCorner === "left" ? styles.localPreviewLeft : styles.localPreviewRight]}><RTCView streamURL={localStream.toURL()} style={styles.localVideo} objectFit="cover" mirror /><View style={styles.previewLabel}><Text style={styles.previewLabelText}>Bạn · chạm để đổi</Text></View></Pressable> : null}</View><View style={styles.nameBox}><Text style={styles.title}>{withVideo ? "Cuộc gọi video" : "Cuộc gọi thoại"} với người dùng #{peerId}</Text><Text style={styles.status}>{status}</Text></View>{callState === "incoming" ? <View style={styles.incomingControls}><ActionButton label="Từ chối" color="#E5484D" onPress={leave} /><ActionButton label="Nhận cuộc gọi" color="#19A974" onPress={() => void acceptCall()} /></View> : <View style={styles.controls}><Control icon={muted ? "mic.slash.fill" : "mic.fill"} label={muted ? "Bật mic" : "Tắt mic"} active={muted} onPress={toggleMute} /><Control icon={speakerOn ? "speaker.wave.2.fill" : "speaker.slash.fill"} label={speakerOn ? "Loa ngoài" : "Tai nghe"} active={speakerOn} onPress={toggleSpeaker} />{withVideo ? <Control icon={cameraOn ? "video.fill" : "video.slash.fill"} label={cameraOn ? "Tắt camera" : "Bật camera"} active={!cameraOn} onPress={toggleCamera} /> : null}<Pressable onPress={leave} style={({ pressed }) => [styles.end, pressed && styles.pressed]}><IconSymbol name="phone.down.fill" size={25} color="#FFFFFF" /></Pressable></View>}</View></ScreenContainer>;
}

function Fallback({ audioOnly, state }: { audioOnly: boolean; state: CallState }) { return <View style={styles.fallback}><View style={[styles.avatar, audioOnly && styles.audioAvatar]}><Text style={styles.initials}>KN</Text></View>{audioOnly ? <View style={styles.audioBars}><View style={[styles.bar, styles.shortBar]} /><View style={[styles.bar, styles.tallBar]} /><View style={styles.bar} /><View style={[styles.bar, styles.tallBar]} /><View style={[styles.bar, styles.shortBar]} /></View> : null}<Text style={styles.waiting}>{state === "incoming" ? "Cuộc gọi đến" : state === "error" ? "Không thể kết nối" : audioOnly ? "Đang chờ kết nối giọng nói…" : "Đang chờ người bên kia bật video…"}</Text></View>; }
function Control({ icon, label, active, onPress }: { icon: "mic.fill" | "mic.slash.fill" | "speaker.wave.2.fill" | "speaker.slash.fill" | "video.fill" | "video.slash.fill"; label: string; active: boolean; onPress: () => void }) { return <View style={styles.control}><IconButton name={icon} onPress={onPress} accessibilityLabel={label} color="#FFFFFF" background={active ? "#2F6B9D" : "#173451"} /><Text style={styles.controlLabel}>{label}</Text></View>; }
function ActionButton({ label, color, onPress }: { label: string; color: string; onPress: () => void }) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.action, { backgroundColor: color }, pressed && styles.pressed]}><Text style={styles.actionText}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: "#081E37" }, top: { paddingTop: 10, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, badge: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 15, backgroundColor: "#173451" }, badgeText: { color: "#B7D9F9", fontSize: 11, fontWeight: "800" }, topSpacer: { width: 42 }, stage: { flex: 1, overflow: "hidden", marginHorizontal: 16, marginTop: 16, borderRadius: 26, backgroundColor: "#102E50", borderWidth: 1, borderColor: "#214363" }, audioStage: { justifyContent: "center" }, remoteVideo: { flex: 1 }, fallback: { flex: 1, alignItems: "center", justifyContent: "center" }, avatar: { width: 142, height: 142, borderRadius: 71, alignItems: "center", justifyContent: "center", backgroundColor: "#1D5283", borderWidth: 3, borderColor: "#80BFFF" }, audioAvatar: { width: 156, height: 156, borderRadius: 78, backgroundColor: "#195B94", shadowColor: "#43A7FF", shadowOpacity: 0.3, shadowRadius: 22, shadowOffset: { width: 0, height: 0 }, elevation: 4 }, initials: { color: "#E4F2FF", fontSize: 52, fontWeight: "900", letterSpacing: -4 }, waiting: { color: "#B4C8DD", marginTop: 17, fontSize: 13 }, audioBars: { height: 34, marginTop: 23, flexDirection: "row", alignItems: "center", gap: 6 }, bar: { width: 5, height: 22, borderRadius: 3, backgroundColor: "#7FC4FF" }, shortBar: { height: 13 }, tallBar: { height: 32 }, localPreview: { position: "absolute", top: 16, width: 110, height: 156, overflow: "hidden", borderRadius: 18, borderWidth: 2, borderColor: "#FFFFFF", backgroundColor: "#254E71", shadowColor: "#000000", shadowOpacity: 0.28, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 6 }, localPreviewRight: { right: 16 }, localPreviewLeft: { left: 16 }, localVideo: { flex: 1 }, previewLabel: { position: "absolute", left: 0, right: 0, bottom: 0, paddingVertical: 6, backgroundColor: "rgba(4,22,40,0.72)" }, previewLabelText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800", textAlign: "center" }, nameBox: { alignItems: "center", paddingTop: 15, paddingBottom: 12 }, title: { color: "#FFFFFF", fontWeight: "900", fontSize: 18 }, status: { color: "#AAC6E4", marginTop: 4, fontSize: 12 }, controls: { minHeight: 88, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 18 }, control: { alignItems: "center", gap: 5 }, controlLabel: { color: "#CBDCEA", fontSize: 10, fontWeight: "700", maxWidth: 54, textAlign: "center" }, end: { width: 60, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "#E5484D", shadowColor: "#000000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 }, incomingControls: { minHeight: 78, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingBottom: 20 }, action: { paddingVertical: 14, paddingHorizontal: 22, borderRadius: 15 }, actionText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" }, pressed: { opacity: 0.62 } });
