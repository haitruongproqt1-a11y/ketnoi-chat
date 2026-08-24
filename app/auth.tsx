import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useMobileAuth } from "@/lib/auth-context";

export default function AuthScreen() {
  const { signIn, register } = useMobileAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!username.trim() || !password) { setError("Vui lòng nhập tên người dùng và mật khẩu."); return; }
    if (mode === "register" && !displayName.trim()) { setError("Vui lòng nhập tên hiển thị."); return; }
    setLoading(true);
    try {
      if (mode === "login") await signIn(username, password);
      else await register(username, displayName, password, email);
      router.replace("/(tabs)");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể xác thực tài khoản.");
    } finally { setLoading(false); }
  };

  return <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-[#F4F7FB]" className="flex-1">
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.hero}><View style={styles.mark}><View style={styles.bubble} /><View style={styles.spark} /></View><Text style={styles.title}>Kết Nối</Text><Text style={styles.subtitle}>Nhắn tin và gọi trực tiếp, gần gũi mỗi ngày.</Text></View>
      <View style={styles.card}><View style={styles.modeToggle}><Pressable onPress={() => { setMode("login"); setError(""); }} style={({ pressed }) => [styles.modeButton, mode === "login" && styles.modeSelected, pressed && styles.pressed]}><Text style={[styles.modeText, mode === "login" && styles.modeTextSelected]}>Đăng nhập</Text></Pressable><Pressable onPress={() => { setMode("register"); setError(""); }} style={({ pressed }) => [styles.modeButton, mode === "register" && styles.modeSelected, pressed && styles.pressed]}><Text style={[styles.modeText, mode === "register" && styles.modeTextSelected]}>Đăng ký</Text></Pressable></View>
        {mode === "register" ? <Field label="Tên hiển thị" value={displayName} onChangeText={setDisplayName} placeholder="Ví dụ: Minh Anh" autoCapitalize="words" /> : null}
        {mode === "register" ? <Field label="Email" value={email} onChangeText={setEmail} placeholder="minhanh@example.com" autoCapitalize="none" keyboardType="email-address" /> : null}
        <Field label="Tên người dùng" value={username} onChangeText={setUsername} placeholder="minhanh_01" autoCapitalize="none" />
        <Field label="Mật khẩu" value={password} onChangeText={setPassword} placeholder="Tối thiểu 8 ký tự" secureTextEntry />
        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
        <Pressable disabled={loading} onPress={submit} style={({ pressed }) => [styles.submit, (pressed || loading) && styles.pressed]}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>{mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</Text>}</Pressable>
        <Text style={styles.hint}>Đặt `EXPO_PUBLIC_API_URL` để kết nối backend Node.js/Socket.io của bạn.</Text>
      </View>
    </KeyboardAvoidingView>
  </ScreenContainer>;
}

function Field({ label, ...props }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; secureTextEntry?: boolean; autoCapitalize?: "none" | "words"; keyboardType?: "default" | "email-address" }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...props} style={styles.input} placeholderTextColor="#8A99AB" returnKeyType="next" /></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: "center", padding: 22 }, hero: { alignItems: "center", marginBottom: 28 }, mark: { width: 64, height: 64, borderRadius: 22, backgroundColor: "#0A284A", alignItems: "center", justifyContent: "center", marginBottom: 14 }, bubble: { width: 35, height: 27, borderWidth: 6, borderColor: "#38A5FF", borderRadius: 16 }, spark: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FFFFFF", position: "absolute", right: 12, top: 11 }, title: { color: "#0A284A", fontSize: 31, letterSpacing: -1, fontWeight: "900" }, subtitle: { marginTop: 5, color: "#6E8097", textAlign: "center", fontSize: 13 }, card: { borderRadius: 24, padding: 19, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E3EBF4" }, modeToggle: { flexDirection: "row", backgroundColor: "#F0F4F8", padding: 4, borderRadius: 13, marginBottom: 20 }, modeButton: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" }, modeSelected: { backgroundColor: "#FFFFFF", shadowColor: "#153150", shadowOpacity: 0.09, shadowRadius: 4, elevation: 1 }, modeText: { color: "#72839A", fontSize: 13, fontWeight: "800" }, modeTextSelected: { color: "#1577E8" }, field: { marginBottom: 14 }, label: { color: "#274563", marginBottom: 7, fontSize: 12, fontWeight: "800" }, input: { minHeight: 48, borderRadius: 13, paddingHorizontal: 13, backgroundColor: "#F4F7FB", color: "#102E4D", fontSize: 14, borderWidth: 1, borderColor: "#E3EBF4" }, errorBox: { borderRadius: 12, padding: 11, marginBottom: 13, backgroundColor: "#FFF0F0" }, errorText: { color: "#C8383D", fontSize: 12, lineHeight: 17 }, submit: { minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#1577E8" }, submitText: { color: "#FFFFFF", fontWeight: "900", fontSize: 15 }, hint: { textAlign: "center", marginTop: 16, color: "#8796A9", fontSize: 10, lineHeight: 15 }, pressed: { opacity: 0.62 },
});
