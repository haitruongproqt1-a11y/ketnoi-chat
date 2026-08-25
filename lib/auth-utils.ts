export type AuthMode = "login" | "register" | "recovery";

export const SECRET_QUESTIONS = [
  { id: "favorite_color", label: "Bạn thích màu gì?" },
  { id: "favorite_food", label: "Bạn thích món nào nhất?" },
  { id: "primary_school", label: "Trường tiểu học của bạn tên là gì?" },
  { id: "birthplace", label: "Bạn sinh ra ở tỉnh hoặc thành phố nào?" },
  { id: "first_pet", label: "Tên thú cưng đầu tiên của bạn là gì?" },
  { id: "childhood_friend", label: "Tên người bạn thời thơ ấu của bạn là gì?" },
  { id: "favorite_teacher", label: "Tên giáo viên bạn nhớ nhất là gì?" },
  { id: "favorite_book", label: "Cuốn sách bạn yêu thích là gì?" },
  { id: "dream_job", label: "Công việc mơ ước của bạn là gì?" },
] as const;

export type SecretQuestionId = (typeof SECRET_QUESTIONS)[number]["id"];

export function normalizeAuthUsername(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeSecretAnswer(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function isSecretQuestionId(value: string): value is SecretQuestionId {
  return SECRET_QUESTIONS.some((question) => question.id === value);
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
  if (normalized.includes("câu trả lời bí mật") || normalized.includes("secret_answer")) {
    return "Câu trả lời bí mật chưa đúng. Hãy thử lại.";
  }
  if (normalized.includes("câu hỏi bí mật") || normalized.includes("không tìm thấy tài khoản")) {
    return "Không tìm thấy tài khoản có thông tin khôi phục phù hợp.";
  }
  if (normalized.includes("network request failed") || normalized.includes("không thể kết nối")) {
    return "Chưa thể kết nối máy chủ. Hãy kiểm tra mạng rồi thử lại.";
  }
  if (mode === "recovery") return "Chưa thể đặt lại mật khẩu lúc này. Vui lòng thử lại sau ít phút.";
  return mode === "login"
    ? "Chưa thể đăng nhập lúc này. Vui lòng thử lại sau ít phút."
    : "Chưa thể tạo tài khoản lúc này. Vui lòng thử lại sau ít phút.";
}
