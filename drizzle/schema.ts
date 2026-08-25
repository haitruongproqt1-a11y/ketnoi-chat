import { index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Người dùng của luồng chat/call di động. Bảng này tách khỏi tài khoản OAuth
 * để giữ cho đăng nhập ứng dụng di động hiện hữu hoạt động độc lập.
 */
export const mobileUsers = mysqlTable("mobile_users", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull(),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  secretQuestion: varchar("secret_question", { length: 64 }).notNull(),
  secretAnswerHash: varchar("secret_answer_hash", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("mobile_users_username_unique").on(table.username),
  uniqueIndex("mobile_users_email_unique").on(table.email),
  index("mobile_users_display_name_index").on(table.displayName),
]);

export const friendRequests = mysqlTable("friend_requests", {
  id: int("id").autoincrement().primaryKey(),
  senderId: int("sender_id").notNull(),
  recipientId: int("recipient_id").notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "declined"]).default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  respondedAt: timestamp("responded_at"),
}, (table) => [
  uniqueIndex("friend_requests_sender_recipient_unique").on(table.senderId, table.recipientId),
  index("friend_requests_recipient_status_index").on(table.recipientId, table.status),
  index("friend_requests_sender_status_index").on(table.senderId, table.status),
]);

export const callRecords = mysqlTable("call_records", {
  id: varchar("id", { length: 96 }).primaryKey(),
  callerId: int("caller_id").notNull(),
  calleeId: int("callee_id").notNull(),
  kind: mysqlEnum("kind", ["audio", "video"]).notNull(),
  status: mysqlEnum("status", ["ringing", "answered", "missed", "declined", "ended"]).default("ringing").notNull(),
  offerData: text("offer_data"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  answeredAt: timestamp("answered_at"),
  endedAt: timestamp("ended_at"),
  durationSeconds: int("duration_seconds").default(0).notNull(),
}, (table) => [
  index("call_records_caller_started_index").on(table.callerId, table.startedAt),
  index("call_records_callee_started_index").on(table.calleeId, table.startedAt),
]);

export const mobilePushTokens = mysqlTable("mobile_push_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  token: varchar("token", { length: 255 }).notNull(),
  platform: mysqlEnum("platform", ["ios", "android"]).notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("mobile_push_tokens_token_unique").on(table.token),
  index("mobile_push_tokens_user_active_index").on(table.userId, table.active),
]);

export type MobileUserRecord = typeof mobileUsers.$inferSelect;
export type FriendRequestRecord = typeof friendRequests.$inferSelect;
export type CallRecord = typeof callRecords.$inferSelect;
export type MobilePushTokenRecord = typeof mobilePushTokens.$inferSelect;
