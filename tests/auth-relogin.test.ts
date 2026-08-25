import { describe, expect, it } from "vitest";

import { authErrorMessage, normalizeAuthUsername, normalizeSecretAnswer, SECRET_QUESTIONS } from "../lib/auth-utils";

describe("authentication retry safeguards", () => {
  it("uses the same normalized username for registration and a later login", () => {
    expect(normalizeAuthUsername("  HaiTruong  ")).toBe("haitruong");
  });

  it("shows the credential error returned by the mobile login endpoint", () => {
    expect(authErrorMessage(new Error("Username hoặc mật khẩu không đúng."), "login"))
      .toBe("Tên người dùng hoặc mật khẩu chưa đúng. Hãy kiểm tra và thử lại.");
  });

  it("normalizes Vietnamese secret answers without weakening the selected question", () => {
    expect(SECRET_QUESTIONS).toHaveLength(3);
    expect(normalizeSecretAnswer("  Bánh   Mì  ")).toBe("banh mi");
  });
});
