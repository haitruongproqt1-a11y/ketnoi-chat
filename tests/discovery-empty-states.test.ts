import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const conversationsSource = readFileSync(resolve(process.cwd(), "app/(tabs)/index.tsx"), "utf8");
const contactsSource = readFileSync(resolve(process.cwd(), "app/(tabs)/contacts.tsx"), "utf8");

describe("empty conversation and friend discovery states", () => {
  it("keeps an empty conversation list quiet when it cannot be loaded", () => {
    expect(conversationsSource).not.toContain("Không tải được danh sách trò chuyện.");
    expect(conversationsSource).toContain("catch { setItems([]); }");
  });

  it("makes finding users and sending a friend request explicit in Contacts", () => {
    expect(contactsSource).toContain("Tìm người dùng để kết bạn");
    expect(contactsSource).toContain("Nhập tên đăng nhập, tên hoặc email; sau đó chạm “Kết bạn”.");
    expect(contactsSource).toContain("Dùng ô tìm người dùng ở trên để gửi lời mời kết bạn.");
  });
});
