import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";

export default function WebCallNotice() {
  return <ScreenContainer className="items-center justify-center p-6"><View style={styles.card}><Text style={styles.title}>Cuộc gọi cần development build</Text><Text style={styles.copy}>`react-native-webrtc` dùng mô-đun native nên không chạy trong bản web preview hoặc Expo Go. Hãy tạo development build Expo và thử trên thiết bị thật.</Text><Pressable onPress={() => router.back()} style={styles.button}><Text style={styles.buttonText}>Quay lại chat</Text></Pressable></View></ScreenContainer>;
}

const styles = StyleSheet.create({ card: { maxWidth: 430, borderRadius: 22, padding: 24, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E1E9F2" }, title: { color: "#0A284A", fontSize: 20, fontWeight: "900" }, copy: { marginTop: 10, color: "#657C95", fontSize: 13, lineHeight: 20 }, button: { marginTop: 20, alignSelf: "flex-start", borderRadius: 12, backgroundColor: "#1577E8", paddingHorizontal: 15, paddingVertical: 11 }, buttonText: { color: "#FFFFFF", fontWeight: "800" } });
