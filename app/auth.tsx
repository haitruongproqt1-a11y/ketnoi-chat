import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
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
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!username.trim() || !password) { setError("Hãy nhập đầy đủ tên người dùng và mật khẩu để tiếp tục."); return; }
    if (username.trim().length < 3) { setError("Tên người dùng cần có ít nhất 3 ký tự."); return; }
    if (password.length < 8) { setError("Mật khẩu cần có ít nhất 8 ký tự."); return; }
    if (mode === "register" && !displayName.trim()) { setError("Hãy cho mọi người biết tên hiển thị của bạn."); return; }
    setLoading(true);
    try {
      if (mode === "login") await signIn(username, password, remember);
      else await register(username, displayName, password, email, remember);
      router.replace("/(tabs)");
    } catch (reason) {
      setError(authErrorMessage(reason, mode));
    } finally { setLoading(false); }
  };

  return <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-[#F4F7FB]" className="flex-1">
    <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.page}><View style={styles.hero}><View style={styles.mark}><View style={styles.bubble} /><View style={styles.spark} /></View><Text style={styles.title}>Kết Nối</Text><Text style={styles.subtitle}>Nhắn tin và gọi trực tiếp, gần gũi mỗi ngày.</Text></View>
        <View style={styles.card}><View style={styles.modeToggle}><Pressable onPress={() => { setMode("login"); setError(""); }} style={({ pressed }) => [styles.modeButton, mode === "login" && styles.modeSelected, pressed && styles.pressed]}><Text style={[styles.modeText, mode === "login" && styles.modeTextSelected]}>Đăng nhập</Text></Pressable><Pressable onPress={() => { setMode("register"); setError(""); }} style={({ pressed }) => [styles.modeButton, mode === "register" && styles.modeSelected, pressed && styles.pressed]}><Text style={[styles.modeText, mode === "register" && styles.modeTextSelected]}>Đăng ký</Text></Pressable></View>
        {mode === "register" ? <Field label="Tên hiển thị" value={displayName} onChangeText={setDisplayName} placeholder="Ví dụ: Minh Anh" autoCapitalize="words" /> : null}
        {mode === "register" ? <Field label="Email" value={email} onChangeText={setEmail} placeholder="minhanh@example.com" autoCapitalize="none" keyboardType="email-address" /> : null}
        <Field label="Tên người dùng" value={username} onChangeText={setUsername} placeholder="minhanh_01" autoCapitalize="none" />
        <Field label="Mật khẩu" value={password} onChangeText={setPassword} placeholder="Tối thiểu 8 ký tự" secureTextEntry editable={!loading} />
        <Pressable disabled={loading} onPress={() => setRemember((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: remember }} style={({ pressed }) => [styles.rememberRow, (pressed || loading) && styles.pressed]}><View style={[styles.checkbox, remember && styles.checkboxChecked]}>{remember ? <Text style={styles.checkmark}>✓</Text> : null}</View><View style={styles.rememberCopy}><Text style={styles.rememberTitle}>Ghi nhớ đăng nhập</Text><Text style={styles.rememberHint}>{remember ? "Giữ phiên trên thiết bị này" : "Chỉ dùng phiên này"}</Text></View></Pressable>
        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
        <Pressable disabled={loading} onPress={submit} style={({ pressed }) => [styles.submit, (pressed || loading) && styles.pressed]}>{loading ? <View style={styles.loadingLabel}><ActivityIndicator color="#FFFFFF" size="small" /><Text style={styles.submitText}>{mode === "login" ? "Đang đăng nhập…" : "Đang tạo tài khoản…"}</Text></View> : <Text style={styles.submitText}>{mode === "login" ? "Đăng nhập" : "Tạo tài khoản và đăng nhập"}</Text>}</Pressable>
        <Text style={styles.hint}>Tài khoản mới sẽ được đăng nhập ngay sau khi tạo thành công.</Text>
        </View></View>
      </ScrollView>
    </KeyboardAvoidingView>
  </ScreenContainer>;
}

function authErrorMessage(reason: unknown, mode: "login" | "register") { const message = reason instanceof Error ? reason.message : ""; if (message.includes("INVALID_CREDENTIALS")) return "Tên người dùng hoặc mật khẩu chưa đúng. Hãy kiểm tra và thử lại."; if (message.includes("ACCOUNT_UNAVAILABLE")) return "Tên người dùng hoặc email này đã được sử dụng. Hãy chọn thông tin khác."; if (message.includes("INVALID_INPUT")) return "Thông tin chưa hợp lệ. Hãy kiểm tra lại các trường đã nhập."; if (message.includes("Network request failed") || message.includes("Không thể kết nối")) return "Chưa thể kết nối máy chủ. Hãy kiểm tra mạng rồi thử lại."; return mode === "login" ? "Chưa thể đăng nhập lúc này. Vui lòng thử lại sau ít phút." : "Chưa thể tạo tài khoản lúc này. Vui lòng thử lại sau ít phút."; }

function Field({ label, ...props }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; secureTextEntry?: boolean; autoCapitalize?: "none" | "words"; keyboardType?: "default" | "email-address"; editable?: boolean }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...props} style={styles.input} placeholderTextColor="#8A99AB" returnKeyType="next" /></View>;
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 }, scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 20 }, page: { flex: 1, justifyContent: "center", width: "100%" }, hero: { alignItems: "center", marginBottom: 22 }, mark: { width: 64, height: 64, borderRadius: 22, backgroundColor: "#0A284A", alignItems: "center", justifyContent: "center", marginBottom: 14 }, bubble: { width: 35, height: 27, borderWidth: 6, borderColor: "#38A5FF", borderRadius: 16 }, spark: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FFFFFF", position: "absolute", right: 12, top: 11 }, title: { color: "#0A284A", fontSize: 31, letterSpacing: -1, fontWeight: "900" }, subtitle: { marginTop: 5, color: "#6E8097", textAlign: "center", fontSize: 13 }, card: { borderRadius: 24, padding: 19, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E3EBF4", shadowColor: "#163252", shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 }, modeToggle: { flexDirection: "row", backgroundColor: "#F0F4F8", padding: 4, borderRadius: 13, marginBottom: 20 }, modeButton: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" }, modeSelected: { backgroundColor: "#FFFFFF", shadowColor: "#153150", shadowOpacity: 0.09, shadowRadius: 4, elevation: 1 }, modeText: { color: "#72839A", fontSize: 13, fontWeight: "800" }, modeTextSelected: { color: "#1577E8" }, field: { marginBottom: 14 }, label: { color: "#274563", marginBottom: 7, fontSize: 12, fontWeight: "800" }, input: { minHeight: 48, borderRadius: 13, paddingHorizontal: 13, backgroundColor: "#F4F7FB", color: "#102E4D", fontSize: 14, borderWidth: 1, borderColor: "#E3EBF4" }, rememberRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 1, marginBottom: 15 }, checkbox: { width: 21, height: 21, alignItems: "center", justifyContent: "center", borderRadius: 7, borderWidth: 1.5, borderColor: "#AEBED0", backgroundColor: "#FFFFFF" }, checkboxChecked: { borderColor: "#1577E8", backgroundColor: "#1577E8" }, checkmark: { color: "#FFFFFF", fontSize: 14, fontWeight: "900", marginTop: -1 }, rememberCopy: { flex: 1 }, rememberTitle: { color: "#294761", fontSize: 12, fontWeight: "800" }, rememberHint: { marginTop: 1, color: "#8090A3", fontSize: 10 }, errorBox: { borderRadius: 12, padding: 11, marginBottom: 13, backgroundColor: "#FFF0F0" }, errorText: { color: "#C8383D", fontSize: 12, lineHeight: 17 }, submit: { minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#1577E8" }, loadingLabel: { flexDirection: "row", alignItems: "center", gap: 8 }, submitText: { color: "#FFFFFF", fontWeight: "900", fontSize: 15 }, hint: { textAlign: "center", marginTop: 16, color: "#8796A9", fontSize: 10, lineHeight: 15 }, pressed: { opacity: 0.62 },
});
