export type AuthMode = "login" | "register";

export function normalizeAuthUsername(value: string) {
  return value.trim().toLowerCase();
}

export function authErrorMessage(reason: unknown, mode: AuthMode) {
  const message = reason instanceof Error ? reason.message : "";
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid_credentials") || normalized.includes("username hoặc mật khẩu không đúng")) {
    return "Tên người dùng hoặc mật khẩu chưa đúng. Hãy kiểm tra và thử lại.";
  }
  if (normalized.includes("account_unavailable") || normalized.includes("username này đã được sử dụng") || normalized.includes("email này đã được sử dụng")) {
    return "Tên người dùng hoặc email này đã được sử dụng. Hãy chọn thông tin khác.";
  }
  if (normalized.includes("invalid_input")) {
    return "Thông tin chưa hợp lệ. Hãy kiểm tra lại các trường đã nhập.";
  }
  if (normalized.includes("network request failed") || normalized.includes("không thể kết nối")) {
    return "Chưa thể kết nối máy chủ. Hãy kiểm tra mạng rồi thử lại.";
  }
  return mode === "login"
    ? "Chưa thể đăng nhập lúc này. Vui lòng thử lại sau ít phút."
    : "Chưa thể tạo tài khoản lúc này. Vui lòng thử lại sau ít phút.";
}
