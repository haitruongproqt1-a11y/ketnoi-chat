import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useMobileAuth } from "@/lib/auth-context";
import { authErrorMessage, SECRET_QUESTIONS, type SecretQuestionId } from "@/lib/auth-utils";
import { mobileApi } from "@/lib/mobile-api";

type AuthMode = "login" | "register" | "recovery";
type RecoveryStep = "username" | "answer";

export default function AuthScreen() {
  const { signIn, register } = useMobileAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [secretQuestion, setSecretQuestion] = useState<SecretQuestionId>(SECRET_QUESTIONS[0].id);
  const [secretAnswer, setSecretAnswer] = useState("");
  const [registerStep, setRegisterStep] = useState<1 | 2>(1);
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>("username");
  const [recoveryQuestion, setRecoveryQuestion] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const changeMode = (next: "login" | "register") => {
    setMode(next);
    setRegisterStep(1);
    setRecoveryStep("username");
    setError("");
    setNotice("");
  };

  const validateCredentials = () => {
    if (!username.trim() || !password) { setError("Hãy nhập đầy đủ tên đăng nhập và mật khẩu để tiếp tục."); return false; }
    if (username.trim().length < 3) { setError("Tên đăng nhập cần có ít nhất 3 ký tự."); return false; }
    if (password.length < 8) { setError("Mật khẩu cần có ít nhất 8 ký tự."); return false; }
    return true;
  };

  const submitLogin = async () => {
    setError(""); setNotice("");
    if (!validateCredentials()) return;
    setLoading(true);
    try {
      await signIn(username, password, remember);
      router.replace("/(tabs)");
    } catch (reason) {
      setError(authErrorMessage(reason, "login"));
    } finally { setLoading(false); }
  };

  const continueRegistration = () => {
    setError(""); setNotice("");
    if (!validateCredentials()) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError("Hãy nhập email hợp lệ để khôi phục tài khoản khi cần."); return; }
    setRegisterStep(2);
  };

  const completeRegistration = async () => {
    setError(""); setNotice("");
    if (secretAnswer.trim().length < 2) { setError("Hãy nhập câu trả lời bí mật có ít nhất 2 ký tự."); return; }
    setLoading(true);
    try {
      await register(username, password, email, secretQuestion, secretAnswer, remember);
      router.replace("/(tabs)");
    } catch (reason) {
      setError(authErrorMessage(reason, "register"));
    } finally { setLoading(false); }
  };

  const requestRecoveryQuestion = async () => {
    setError(""); setNotice("");
    if (username.trim().length < 3) { setError("Hãy nhập tên đăng nhập để tiếp tục."); return; }
    setLoading(true);
    try {
      const result = await mobileApi.passwordRecoveryQuestion(username.trim());
      setRecoveryQuestion(result.question);
      setRecoveryStep("answer");
    } catch (reason) {
      setError(authErrorMessage(reason, "recovery"));
    } finally { setLoading(false); }
  };

  const resetPassword = async () => {
    setError(""); setNotice("");
    if (secretAnswer.trim().length < 2) { setError("Hãy nhập câu trả lời bí mật."); return; }
    if (password.length < 8) { setError("Mật khẩu mới cần có ít nhất 8 ký tự."); return; }
    if (password !== confirmPassword) { setError("Xác nhận mật khẩu chưa khớp."); return; }
    setLoading(true);
    try {
      await mobileApi.resetPassword(username.trim(), secretAnswer, password);
      setMode("login");
      setRecoveryStep("username");
      setSecretAnswer("");
      setConfirmPassword("");
      setNotice("Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.");
    } catch (reason) {
      setError(authErrorMessage(reason, "recovery"));
    } finally { setLoading(false); }
  };

  const openRecovery = () => {
    setMode("recovery");
    setRecoveryStep("username");
    setSecretAnswer("");
    setConfirmPassword("");
    setPassword("");
    setError("");
    setNotice("");
  };

  const actionLabel = mode === "login" ? "Đăng nhập" : mode === "register" ? (registerStep === 1 ? "Tiếp tục" : "Tạo tài khoản và đăng nhập") : recoveryStep === "username" ? "Xem câu hỏi bí mật" : "Đặt lại mật khẩu";
  const action = mode === "login" ? submitLogin : mode === "register" ? (registerStep === 1 ? continueRegistration : completeRegistration) : recoveryStep === "username" ? requestRecoveryQuestion : resetPassword;

  return <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-[#F4F7FB]" className="flex-1">
    <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.page}><View style={styles.hero}><View style={styles.mark}><View style={styles.bubble} /><View style={styles.spark} /></View><Text style={styles.title}>Kết Nối</Text><Text style={styles.subtitle}>Nhắn tin và gọi trực tiếp, gần gũi mỗi ngày.</Text></View>
          <View style={styles.card}>
            {mode !== "recovery" ? <View style={styles.modeToggle}><Pressable onPress={() => changeMode("login")} style={({ pressed }) => [styles.modeButton, mode === "login" && styles.modeSelected, pressed && styles.pressed]}><Text style={[styles.modeText, mode === "login" && styles.modeTextSelected]}>Đăng nhập</Text></Pressable><Pressable onPress={() => changeMode("register")} style={({ pressed }) => [styles.modeButton, mode === "register" && styles.modeSelected, pressed && styles.pressed]}><Text style={[styles.modeText, mode === "register" && styles.modeTextSelected]}>Đăng ký</Text></Pressable></View> : <View style={styles.recoveryHeading}><Pressable onPress={() => changeMode("login")} disabled={loading} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}><Text style={styles.backText}>Quay lại</Text></Pressable><View><Text style={styles.recoveryTitle}>Quên mật khẩu</Text><Text style={styles.recoveryHint}>Khôi phục bằng tên đăng nhập và câu hỏi bí mật.</Text></View></View>}

            {mode === "login" ? <>
              <Field label="Tên đăng nhập" value={username} onChangeText={setUsername} placeholder="minhanh_01" autoCapitalize="none" autoCorrect={false} editable={!loading} />
              <Field label="Mật khẩu" value={password} onChangeText={setPassword} placeholder="Tối thiểu 8 ký tự" secureTextEntry editable={!loading} autoCapitalize="none" autoCorrect={false} />
              <Pressable onPress={openRecovery} disabled={loading} style={({ pressed }) => [styles.forgotLink, pressed && styles.pressed]}><Text style={styles.forgotText}>Quên mật khẩu?</Text></Pressable>
            </> : null}

            {mode === "register" && registerStep === 1 ? <>
              <Field label="Tên đăng nhập" value={username} onChangeText={setUsername} placeholder="minhanh_01" autoCapitalize="none" autoCorrect={false} editable={!loading} />
              <Field label="Mật khẩu" value={password} onChangeText={setPassword} placeholder="Tối thiểu 8 ký tự" secureTextEntry editable={!loading} autoCapitalize="none" autoCorrect={false} />
              <Field label="Email" value={email} onChangeText={setEmail} placeholder="minhanh@gmail.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" editable={!loading} />
            </> : null}

            {mode === "register" && registerStep === 2 ? <><Text style={styles.stepTitle}>Thiết lập khôi phục tài khoản</Text><Text style={styles.stepHint}>Chọn một câu hỏi và nhập câu trả lời chỉ bạn biết.</Text><Text style={styles.label}>Câu hỏi bí mật</Text><View style={styles.questionList}>{SECRET_QUESTIONS.map((question) => <Pressable key={question.id} onPress={() => setSecretQuestion(question.id)} disabled={loading} style={({ pressed }) => [styles.questionButton, secretQuestion === question.id && styles.questionButtonSelected, pressed && styles.pressed]}><Text style={[styles.questionText, secretQuestion === question.id && styles.questionTextSelected]}>{question.label}</Text></Pressable>)}</View><Field label="Câu trả lời bí mật" value={secretAnswer} onChangeText={setSecretAnswer} placeholder="Nhập câu trả lời của bạn" autoCapitalize="none" autoCorrect={false} editable={!loading} /><Pressable onPress={() => { setRegisterStep(1); setError(""); }} disabled={loading} style={({ pressed }) => [styles.backRegister, pressed && styles.pressed]}><Text style={styles.backRegisterText}>Sửa thông tin đăng ký</Text></Pressable></> : null}

            {mode === "recovery" && recoveryStep === "username" ? <Field label="Tên đăng nhập" value={username} onChangeText={setUsername} placeholder="minhanh_01" autoCapitalize="none" autoCorrect={false} editable={!loading} /> : null}
            {mode === "recovery" && recoveryStep === "answer" ? <><View style={styles.questionBox}><Text style={styles.questionCaption}>Câu hỏi bí mật của bạn</Text><Text style={styles.questionValue}>{recoveryQuestion}</Text></View><Field label="Câu trả lời" value={secretAnswer} onChangeText={setSecretAnswer} placeholder="Nhập câu trả lời" autoCapitalize="none" autoCorrect={false} editable={!loading} /><Field label="Mật khẩu mới" value={password} onChangeText={setPassword} placeholder="Tối thiểu 8 ký tự" secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!loading} /><Field label="Xác nhận mật khẩu mới" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Nhập lại mật khẩu mới" secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!loading} /></> : null}

            {mode !== "recovery" ? <Pressable disabled={loading} onPress={() => setRemember((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: remember }} style={({ pressed }) => [styles.rememberRow, (pressed || loading) && styles.pressed]}><View style={[styles.checkbox, remember && styles.checkboxChecked]}>{remember ? <Text style={styles.checkmark}>✓</Text> : null}</View><View style={styles.rememberCopy}><Text style={styles.rememberTitle}>Ghi nhớ đăng nhập</Text><Text style={styles.rememberHint}>{remember ? "Giữ phiên trên thiết bị này" : "Chỉ dùng phiên này"}</Text></View></Pressable> : null}
            {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
            {notice ? <View style={styles.noticeBox}><Text style={styles.noticeText}>{notice}</Text></View> : null}
            <Pressable disabled={loading} onPress={action} style={({ pressed }) => [styles.submit, (pressed || loading) && styles.pressed]}>{loading ? <View style={styles.loadingLabel}><ActivityIndicator color="#FFFFFF" size="small" /><Text style={styles.submitText}>Đang xử lý…</Text></View> : <Text style={styles.submitText}>{actionLabel}</Text>}</Pressable>
            {mode === "register" && registerStep === 1 ? <Text style={styles.hint}>Sau bước này, bạn sẽ thiết lập câu hỏi bí mật để khôi phục mật khẩu.</Text> : mode === "login" ? <Text style={styles.hint}>Dùng tên đăng nhập và mật khẩu của bạn để vào tài khoản.</Text> : null}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </ScreenContainer>;
}

function Field({ label, ...props }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; secureTextEntry?: boolean; autoCapitalize?: "none" | "words"; autoCorrect?: boolean; keyboardType?: "default" | "email-address"; editable?: boolean }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...props} style={styles.input} placeholderTextColor="#8A99AB" returnKeyType="next" /></View>;
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 }, scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 20 }, page: { flex: 1, justifyContent: "center", width: "100%" }, hero: { alignItems: "center", marginBottom: 22 }, mark: { width: 64, height: 64, borderRadius: 22, backgroundColor: "#0A284A", alignItems: "center", justifyContent: "center", marginBottom: 14 }, bubble: { width: 35, height: 27, borderWidth: 6, borderColor: "#38A5FF", borderRadius: 16 }, spark: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FFFFFF", position: "absolute", right: 12, top: 11 }, title: { color: "#0A284A", fontSize: 31, letterSpacing: -1, fontWeight: "900" }, subtitle: { marginTop: 5, color: "#6E8097", textAlign: "center", fontSize: 13 }, card: { borderRadius: 24, padding: 19, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E3EBF4", shadowColor: "#163252", shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 }, modeToggle: { flexDirection: "row", backgroundColor: "#F0F4F8", padding: 4, borderRadius: 13, marginBottom: 20 }, modeButton: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" }, modeSelected: { backgroundColor: "#FFFFFF", shadowColor: "#153150", shadowOpacity: 0.09, shadowRadius: 4, elevation: 1 }, modeText: { color: "#72839A", fontSize: 13, fontWeight: "800" }, modeTextSelected: { color: "#1577E8" }, field: { marginBottom: 14 }, label: { color: "#274563", marginBottom: 7, fontSize: 12, fontWeight: "800" }, input: { minHeight: 48, borderRadius: 13, paddingHorizontal: 13, backgroundColor: "#F4F7FB", color: "#102E4D", fontSize: 14, borderWidth: 1, borderColor: "#E3EBF4" }, forgotLink: { alignSelf: "flex-end", marginTop: -3, marginBottom: 12, paddingVertical: 4 }, forgotText: { color: "#1577E8", fontSize: 12, fontWeight: "800" }, rememberRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 1, marginBottom: 15 }, checkbox: { width: 21, height: 21, alignItems: "center", justifyContent: "center", borderRadius: 7, borderWidth: 1.5, borderColor: "#AEBED0", backgroundColor: "#FFFFFF" }, checkboxChecked: { borderColor: "#1577E8", backgroundColor: "#1577E8" }, checkmark: { color: "#FFFFFF", fontSize: 14, fontWeight: "900", marginTop: -1 }, rememberCopy: { flex: 1 }, rememberTitle: { color: "#294761", fontSize: 12, fontWeight: "800" }, rememberHint: { marginTop: 1, color: "#8090A3", fontSize: 10 }, errorBox: { borderRadius: 12, padding: 11, marginBottom: 13, backgroundColor: "#FFF0F0" }, errorText: { color: "#C8383D", fontSize: 12, lineHeight: 17 }, noticeBox: { borderRadius: 12, padding: 11, marginBottom: 13, backgroundColor: "#EAF5FF" }, noticeText: { color: "#23608F", fontSize: 12, lineHeight: 17 }, submit: { minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#1577E8" }, loadingLabel: { flexDirection: "row", alignItems: "center", gap: 8 }, submitText: { color: "#FFFFFF", fontWeight: "900", fontSize: 15 }, hint: { textAlign: "center", marginTop: 16, color: "#8796A9", fontSize: 10, lineHeight: 15 }, recoveryHeading: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 20 }, backButton: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: "#EAF5FF" }, backText: { color: "#1577E8", fontSize: 11, fontWeight: "900" }, recoveryTitle: { color: "#163252", fontSize: 16, fontWeight: "900" }, recoveryHint: { color: "#7B8EA2", marginTop: 2, fontSize: 10 }, stepTitle: { color: "#163252", fontSize: 16, fontWeight: "900" }, stepHint: { color: "#70849A", marginTop: 4, marginBottom: 15, fontSize: 11, lineHeight: 16 }, questionList: { gap: 8, marginBottom: 15 }, questionButton: { paddingHorizontal: 12, paddingVertical: 11, borderRadius: 11, borderWidth: 1, borderColor: "#E2EAF3", backgroundColor: "#F8FAFD" }, questionButtonSelected: { borderColor: "#8DC3FA", backgroundColor: "#EAF5FF" }, questionText: { color: "#536B83", fontSize: 12, lineHeight: 17 }, questionTextSelected: { color: "#1577E8", fontWeight: "800" }, backRegister: { alignSelf: "flex-start", marginTop: -6, marginBottom: 14, paddingVertical: 6 }, backRegisterText: { color: "#1577E8", fontSize: 11, fontWeight: "800" }, questionBox: { padding: 13, borderRadius: 13, backgroundColor: "#EAF5FF", borderWidth: 1, borderColor: "#D5EAFD", marginBottom: 15 }, questionCaption: { color: "#57728C", fontSize: 10, fontWeight: "800" }, questionValue: { color: "#163252", fontSize: 13, marginTop: 4, fontWeight: "800", lineHeight: 19 }, pressed: { opacity: 0.62 },
});
