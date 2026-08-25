import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const contactsSource = readFileSync(resolve(process.cwd(), "app/(tabs)/contacts.tsx"), "utf8");
const tabSource = readFileSync(resolve(process.cwd(), "app/(tabs)/_layout.tsx"), "utf8");
const socketSource = readFileSync(resolve(process.cwd(), "lib/socket-context.tsx"), "utf8");

describe("friend discovery feedback", () => {
  it("shows a loading response while searching for users", () => {
    expect(contactsSource).toContain("Đang tìm người dùng…");
    expect(contactsSource).toContain("setSearching(true)");
  });

  it("tracks and displays pending friend invitations in the Contacts tab", () => {
    expect(socketSource).toContain("friend:request");
    expect(socketSource).toContain("pendingFriendRequestCount");
    expect(tabSource).toContain("pendingFriendRequestCount > 0");
  });
});
