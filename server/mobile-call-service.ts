import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { promisify } from "node:util";

import { and, asc, desc, eq, inArray, like, or } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import multer from "multer";
import { Server as SocketServer, type Socket } from "socket.io";

import {
  callRecords,
  friendRequests,
  mobileConversationPreferences,
  mobileMessages,
  mobilePushTokens,
  mobileUsers,
  type CallRecord,
  type FriendRequestRecord,
  type MobileMessageRecord,
  type MobileUserRecord,
} from "../drizzle/schema";
import { isSecretQuestionId, normalizeSecretAnswer, SECRET_QUESTIONS } from "../lib/auth-utils";
import { getDb } from "./db";
import { ENV } from "./_core/env";
import { storagePut } from "./storage";

const scrypt = promisify(scryptCallback);
const GOOGLE_STUN = "stun:stun.l.google.com:19302";
const OPEN_RELAY_TURN_URLS = ["turn:staticauth.openrelay.metered.ca:80?transport=udp", "turn:staticauth.openrelay.metered.ca:443?transport=tcp", "turns:staticauth.openrelay.metered.ca:443?transport=tcp"];
const OPEN_RELAY_SHARED_SECRET = "openrelayprojectsecret";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type MobileSession = { userId: number; username: string };
type CallKind = "audio" | "video";
type CallReason = "ended" | "missed" | "declined";
type ChatMedia = { url: string; kind: "image" | "video" | "file"; name: string; mimeType: string; size: number; thumbnailUrl: string | null; caption?: string | null };
type ChatCallEvent = { callId: string; kind: CallKind; status: "missed" | "answered" | "declined" | "ended"; durationSeconds: number };
type ChatMediaPayload = { media: ChatMedia | null; mediaItems: ChatMedia[]; callEvent: ChatCallEvent | null };
type CallSignalPayload = {
  toUserId?: number;
  callId?: string;
  withVideo?: boolean;
  description?: unknown;
  candidate?: unknown;
  reason?: CallReason;
  quickReply?: string;
  isScreenSharing?: boolean;
};

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function toMobileUser(user: MobileUserRecord) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}

function toCallHistory(record: CallRecord, currentUserId: number, peer: MobileUserRecord) {
  return {
    id: record.id,
    peer: toMobileUser(peer),
    direction: record.callerId === currentUserId ? "outgoing" : record.status === "missed" ? "missed" : "incoming",
    kind: record.kind,
    status: record.status,
    startedAt: record.startedAt.toISOString(),
    endedAt: toIso(record.endedAt),
    durationSeconds: record.durationSeconds,
  };
}

function emptyMediaPayload(): ChatMediaPayload {
  return { media: null, mediaItems: [], callEvent: null };
}

function isChatCallEvent(value: unknown): value is ChatCallEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<ChatCallEvent>;
  return typeof event.callId === "string" && (event.kind === "audio" || event.kind === "video") && (event.status === "missed" || event.status === "answered" || event.status === "declined" || event.status === "ended") && typeof event.durationSeconds === "number";
}

function isChatMedia(value: unknown): value is ChatMedia {
  if (!value || typeof value !== "object") return false;
  const media = value as Partial<ChatMedia>;
  return typeof media.url === "string" && media.url.startsWith("/manus-storage/") && (media.kind === "image" || media.kind === "video" || media.kind === "file") && typeof media.name === "string" && typeof media.mimeType === "string" && typeof media.size === "number";
}

function parseMediaPayload(value: string | null): ChatMediaPayload {
  if (!value) return emptyMediaPayload();
  try {
    const parsed = JSON.parse(value) as Partial<ChatMediaPayload>;
    const items = Array.isArray(parsed.mediaItems) ? parsed.mediaItems.filter(isChatMedia) : [];
    const media = isChatMedia(parsed.media) ? parsed.media : items[0] ?? null;
    return { media, mediaItems: items, callEvent: isChatCallEvent(parsed.callEvent) ? parsed.callEvent : null };
  } catch {
    return emptyMediaPayload();
  }
}

function normalizeChatMedia(value: unknown): ChatMedia | null {
  if (!isChatMedia(value)) return null;
  const media = value as ChatMedia;
  if (media.size < 0 || media.size > 12 * 1024 * 1024 || media.name.length > 255 || media.mimeType.length > 160) return null;
  return { ...media, name: safeText(media.name, 255), mimeType: safeText(media.mimeType, 160), thumbnailUrl: typeof media.thumbnailUrl === "string" && media.thumbnailUrl.startsWith("/manus-storage/") ? media.thumbnailUrl : null, caption: safeText(media.caption, 1000) || null };
}

function toMobileMessage(record: MobileMessageRecord) {
  const payload = record.mediaRevokedAt ? emptyMediaPayload() : parseMediaPayload(record.mediaPayload);
  return { id: record.id, senderId: record.senderId, recipientId: record.recipientId, body: record.body, createdAt: record.createdAt.toISOString(), deliveredAt: toIso(record.deliveredAt), readAt: toIso(record.readAt), media: payload.media, mediaItems: payload.mediaItems, mediaRevokedAt: toIso(record.mediaRevokedAt), callEvent: payload.callEvent };
}

function getSessionKey() {
  if (!ENV.cookieSecret) throw new Error("Thiếu cấu hình khóa phiên của máy chủ.");
  return new TextEncoder().encode(ENV.cookieSecret);
}

async function issueSession(user: MobileUserRecord) {
  return new SignJWT({ userId: user.id, username: user.username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSessionKey());
}

async function verifySession(token: string): Promise<MobileSession> {
  const { payload } = await jwtVerify(token, getSessionKey());
  const userId = Number(payload.userId);
  const username = typeof payload.username === "string" ? payload.username : "";
  if (!Number.isInteger(userId) || !username) throw new Error("Phiên đăng nhập không hợp lệ.");
  return { userId, username };
}

function readBearerToken(value: string | undefined) {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function asErrorMessage(error: unknown, fallback = "Máy chủ không thể hoàn tất yêu cầu.") {
  return error instanceof Error ? error.message : fallback;
}

function safeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validCallId(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,96}$/.test(value) ? value : null;
}

function openRelayFallbackCredential(userId: number) {
  const username = `${Math.floor(Date.now() / 1000) + 60 * 60}:${userId}:ketnoi`;
  const credential = createHmac("sha1", OPEN_RELAY_SHARED_SECRET).update(username).digest("base64");
  return { urls: OPEN_RELAY_TURN_URLS, username, credential };
}

async function requireDb() {
  const database = await getDb();
  if (!database) throw new Error("Cơ sở dữ liệu chưa sẵn sàng.");
  return database;
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, expected] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && timingSafeEqual(expectedBuffer, actual);
}

async function getMobileUser(userId: number) {
  const database = await requireDb();
  const [user] = await database.select().from(mobileUsers).where(eq(mobileUsers.id, userId)).limit(1);
  return user ?? null;
}

async function getMobileUserByUsername(username: string) {
  const database = await requireDb();
  const [user] = await database.select().from(mobileUsers).where(eq(mobileUsers.username, username)).limit(1);
  return user ?? null;
}

async function getMobileUserByEmail(email: string) {
  const database = await requireDb();
  const [user] = await database.select().from(mobileUsers).where(eq(mobileUsers.email, email)).limit(1);
  return user ?? null;
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function relationshipBetween(userId: number, peerId: number) {
  const database = await requireDb();
  const records = await database.select().from(friendRequests).where(or(
    and(eq(friendRequests.senderId, userId), eq(friendRequests.recipientId, peerId)),
    and(eq(friendRequests.senderId, peerId), eq(friendRequests.recipientId, userId)),
  ));
  const accepted = records.find((item) => item.status === "accepted");
  if (accepted) return "friends" as const;
  const direct = records.find((item) => item.senderId === userId);
  if (direct?.status === "pending") return "outgoing" as const;
  const incoming = records.find((item) => item.recipientId === userId);
  if (incoming?.status === "pending") return "incoming" as const;
  return "none" as const;
}

async function listFriends(userId: number) {
  const database = await requireDb();
  const relations = await database.select().from(friendRequests).where(and(
    eq(friendRequests.status, "accepted"),
    or(eq(friendRequests.senderId, userId), eq(friendRequests.recipientId, userId)),
  ));
  const peerIds = [...new Set(relations.map((item) => item.senderId === userId ? item.recipientId : item.senderId))];
  if (!peerIds.length) return [];
  const peers = await database.select().from(mobileUsers).where(inArray(mobileUsers.id, peerIds)).orderBy(asc(mobileUsers.displayName));
  return peers.map(toMobileUser);
}

async function buildFriendRequest(record: FriendRequestRecord) {
  const [sender, recipient] = await Promise.all([getMobileUser(record.senderId), getMobileUser(record.recipientId)]);
  if (!sender || !recipient) throw new Error("Không tìm thấy người dùng cho lời mời kết bạn.");
  return {
    id: record.id,
    sender: toMobileUser(sender),
    recipient: toMobileUser(recipient),
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    respondedAt: toIso(record.respondedAt),
  };
}

function normalizeOffer(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Lời mời cuộc gọi không hợp lệ.");
  const serialized = JSON.stringify(value);
  if (serialized.length > 180_000) throw new Error("Dữ liệu lời mời cuộc gọi quá lớn.");
  return serialized;
}

async function createCallRecord(callId: string, callerId: number, calleeId: number, kind: CallKind, description: unknown) {
  const database = await requireDb();
  const existing = await database.select().from(callRecords).where(eq(callRecords.id, callId)).limit(1);
  if (existing[0]) return existing[0];
  await database.insert(callRecords).values({ id: callId, callerId, calleeId, kind, status: "ringing", offerData: normalizeOffer(description) });
  const [record] = await database.select().from(callRecords).where(eq(callRecords.id, callId)).limit(1);
  if (!record) throw new Error("Không thể tạo phiên cuộc gọi.");
  return record;
}

async function markCallAnswered(callId: string) {
  const database = await requireDb();
  const now = new Date();
  await database.update(callRecords).set({ status: "answered", answeredAt: now }).where(and(eq(callRecords.id, callId), eq(callRecords.status, "ringing")));
}

async function finishCall(callId: string, reason: CallReason) {
  const database = await requireDb();
  const [record] = await database.select().from(callRecords).where(eq(callRecords.id, callId)).limit(1);
  if (!record || record.endedAt) return { record: record ?? null, finalized: false };
  const endedAt = new Date();
  const durationSeconds = record.answeredAt ? Math.max(0, Math.floor((endedAt.getTime() - record.answeredAt.getTime()) / 1000)) : 0;
  const status: CallRecord["status"] = reason === "ended" ? "ended" : reason;
  await database.update(callRecords).set({ status, endedAt, durationSeconds }).where(eq(callRecords.id, callId));
  return { record: { ...record, status, endedAt, durationSeconds }, finalized: true };
}

async function sendIncomingCallPush(calleeId: number, caller: MobileUserRecord, callId: string, withVideo: boolean) {
  const database = await requireDb();
  const tokens = await database.select().from(mobilePushTokens).where(and(eq(mobilePushTokens.userId, calleeId), eq(mobilePushTokens.active, 1)));
  const targets = tokens.filter((item) => item.token.startsWith("ExponentPushToken[") || item.token.startsWith("ExpoPushToken["));
  if (!targets.length) return false;
  const url = `/call?peerId=${caller.id}&peerName=${encodeURIComponent(caller.displayName)}&direction=incoming&mode=${withVideo ? "video" : "audio"}&callId=${encodeURIComponent(callId)}`;
  const body = targets.map((item) => ({
    to: item.token,
    title: withVideo ? "Cuộc gọi video đến" : "Cuộc gọi thoại đến",
    body: `${caller.displayName} đang gọi cho bạn`,
    sound: "default",
    priority: "high",
    channelId: "calls",
    categoryId: "incoming-call",
    data: { type: "incoming_call", callId, fromUserId: caller.id, callerName: caller.displayName, withVideo, url },
  }));
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function listCallHistory(userId: number, peerId?: number) {
  const database = await requireDb();
  const filter = peerId
    ? or(and(eq(callRecords.callerId, userId), eq(callRecords.calleeId, peerId)), and(eq(callRecords.calleeId, userId), eq(callRecords.callerId, peerId)))
    : or(eq(callRecords.callerId, userId), eq(callRecords.calleeId, userId));
  const records = await database.select().from(callRecords).where(filter).orderBy(desc(callRecords.startedAt)).limit(100);
  const peerIds = [...new Set(records.map((record) => record.callerId === userId ? record.calleeId : record.callerId))];
  if (!peerIds.length) return [];
  const peers = await database.select().from(mobileUsers).where(inArray(mobileUsers.id, peerIds));
  const byId = new Map(peers.map((peer) => [peer.id, peer]));
  return records.flatMap((record) => {
    const peer = byId.get(record.callerId === userId ? record.calleeId : record.callerId);
    return peer ? [toCallHistory(record, userId, peer)] : [];
  });
}

async function userFromRequest(req: Request) {
  const token = readBearerToken(req.header("authorization"));
  if (!token) throw new Error("Bạn cần đăng nhập để tiếp tục.");
  const session = await verifySession(token);
  const user = await getMobileUser(session.userId);
  if (!user || user.username !== session.username) throw new Error("Phiên đăng nhập đã hết hạn.");
  return user;
}

function protectedRoute(handler: (req: Request, res: Response, user: MobileUserRecord) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      const user = await userFromRequest(req);
      await handler(req, res, user);
    } catch (error) {
      res.status(asErrorMessage(error).includes("đăng nhập") || asErrorMessage(error).includes("Phiên") ? 401 : 400).json({ message: asErrorMessage(error) });
    }
  };
}

function parsePeerId(value: unknown) {
  const peerId = Number(value);
  if (!Number.isInteger(peerId) || peerId <= 0) throw new Error("Người nhận không hợp lệ.");
  return peerId;
}

async function ensureCallable(userId: number, peerId: number) {
  if (userId === peerId) throw new Error("Không thể gọi cho chính bạn.");
  const relation = await relationshipBetween(userId, peerId);
  if (relation !== "friends") throw new Error("Bạn chỉ có thể gọi cho bạn bè đã xác nhận.");
}

function currentOnlineIds(onlineSockets: Map<number, Set<string>>) {
  return [...onlineSockets.entries()].filter(([, socketIds]) => socketIds.size > 0).map(([userId]) => userId);
}

export function registerMobileCallService(app: Express, httpServer: HttpServer) {
  const io = new SocketServer(httpServer, {
    cors: { origin: true, credentials: true, methods: ["GET", "POST"] },
  });
  const onlineSockets = new Map<number, Set<string>>();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1 } });

  const saveChatMessage = async (senderId: number, recipientId: number, input: { body?: unknown; media?: unknown; mediaItems?: unknown }) => {
    if (senderId === recipientId) throw new Error("Không thể gửi tin nhắn cho chính bạn.");
    if (await relationshipBetween(senderId, recipientId) !== "friends") throw new Error("Bạn chỉ có thể nhắn tin cho bạn bè đã xác nhận.");
    const body = safeText(input.body, 4000);
    const mediaItems = Array.isArray(input.mediaItems) ? input.mediaItems.map(normalizeChatMedia).filter((item): item is ChatMedia => Boolean(item)).slice(0, 8) : [];
    const media = normalizeChatMedia(input.media) ?? mediaItems[0] ?? null;
    if (!body && !media) throw new Error("Tin nhắn cần có nội dung hoặc tệp đính kèm.");
    const database = await requireDb();
    const deliveredAt = onlineSockets.get(recipientId)?.size ? new Date() : null;
    const inserted = await database.insert(mobileMessages).values({ senderId, recipientId, body, mediaPayload: media ? JSON.stringify({ media, mediaItems: mediaItems.length ? mediaItems : [media] }) : null, deliveredAt });
    const messageId = Number((inserted as any).insertId ?? (inserted as any)[0]?.insertId);
    const [record] = await database.select().from(mobileMessages).where(eq(mobileMessages.id, messageId)).limit(1);
    if (!record) throw new Error("Không thể lưu tin nhắn.");
    const message = toMobileMessage(record);
    io.to(`mobile-user:${senderId}`).emit("chat:new", message);
    io.to(`mobile-user:${recipientId}`).emit("chat:new", message);
    if (deliveredAt) io.to(`mobile-user:${senderId}`).emit("chat:delivered", { recipientId, messageIds: [message.id], deliveredAt: deliveredAt.toISOString() });
    return message;
  };

  const saveCallHistoryMessage = async (record: CallRecord) => {
    const database = await requireDb();
    const body = `__ketnoi_call:${record.id}`;
    const [existing] = await database.select().from(mobileMessages).where(and(eq(mobileMessages.senderId, record.callerId), eq(mobileMessages.recipientId, record.calleeId), eq(mobileMessages.body, body))).limit(1);
    if (existing) return toMobileMessage(existing);
    const status = record.status === "missed" || record.status === "declined" || record.status === "ended" ? record.status : "ended";
    const callEvent: ChatCallEvent = { callId: record.id, kind: record.kind, status, durationSeconds: record.durationSeconds };
    const inserted = await database.insert(mobileMessages).values({ senderId: record.callerId, recipientId: record.calleeId, body, mediaPayload: JSON.stringify({ media: null, mediaItems: [], callEvent }), deliveredAt: onlineSockets.get(record.calleeId)?.size ? new Date() : null });
    const messageId = Number((inserted as any).insertId ?? (inserted as any)[0]?.insertId);
    const [stored] = await database.select().from(mobileMessages).where(eq(mobileMessages.id, messageId)).limit(1);
    if (!stored) throw new Error("Không thể lưu mục lịch sử cuộc gọi trong chat.");
    const message = toMobileMessage(stored);
    io.to(`mobile-user:${record.callerId}`).emit("chat:new", message);
    io.to(`mobile-user:${record.calleeId}`).emit("chat:new", message);
    return message;
  };

  const emitFriendRequest = (request: Awaited<ReturnType<typeof buildFriendRequest>>) => {
    io.to(`mobile-user:${request.recipient.id}`).emit("friend:request", request);
  };

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.post("/api/auth/register", async (req, res) => {
    try {
      const username = safeText(req.body?.username, 64).toLowerCase();
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const email = safeText(req.body?.email, 320).toLowerCase();
      const secretQuestion = safeText(req.body?.secretQuestion, 64);
      const secretAnswer = normalizeSecretAnswer(safeText(req.body?.secretAnswer, 160));
      if (!/^[a-z0-9_]{3,64}$/.test(username)) throw new Error("Username cần 3–64 ký tự gồm chữ thường, số hoặc dấu gạch dưới.");
      if (password.length < 8) throw new Error("Mật khẩu cần có ít nhất 8 ký tự.");
      if (!validEmail(email)) throw new Error("Email chưa hợp lệ.");
      if (!isSecretQuestionId(secretQuestion)) throw new Error("Câu hỏi bí mật không hợp lệ.");
      if (secretAnswer.length < 2) throw new Error("Câu trả lời bí mật cần có ít nhất 2 ký tự.");
      if (await getMobileUserByUsername(username)) throw new Error("Username này đã được sử dụng.");
      if (await getMobileUserByEmail(email)) throw new Error("Email này đã được sử dụng.");
      const database = await requireDb();
      const [passwordHash, secretAnswerHash] = await Promise.all([hashPassword(password), hashPassword(secretAnswer)]);
      const inserted = await database.insert(mobileUsers).values({ username, displayName: username, passwordHash, email, secretQuestion, secretAnswerHash });
      const insertId = Number((inserted as any).insertId ?? (inserted as any)[0]?.insertId);
      const user = await getMobileUser(insertId);
      if (!user) throw new Error("Không thể tạo tài khoản.");
      res.status(201).json({ token: await issueSession(user), user: toMobileUser(user) });
    } catch (error) {
      res.status(400).json({ message: asErrorMessage(error) });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const username = safeText(req.body?.username, 64).toLowerCase();
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const user = await getMobileUserByUsername(username);
      if (!user || !(await verifyPassword(password, user.passwordHash))) throw new Error("Username hoặc mật khẩu không đúng.");
      res.json({ token: await issueSession(user), user: toMobileUser(user) });
    } catch (error) {
      res.status(401).json({ message: asErrorMessage(error) });
    }
  });

  app.post("/api/auth/recovery-question", async (req, res) => {
    try {
      const username = safeText(req.body?.username, 64).toLowerCase();
      const user = await getMobileUserByUsername(username);
      if (!user || !isSecretQuestionId(user.secretQuestion)) throw new Error("Không tìm thấy tài khoản có câu hỏi bí mật.");
      const question = SECRET_QUESTIONS.find((item) => item.id === user.secretQuestion);
      if (!question) throw new Error("Không tìm thấy tài khoản có câu hỏi bí mật.");
      res.json({ question: question.label });
    } catch (error) {
      res.status(404).json({ message: asErrorMessage(error) });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const username = safeText(req.body?.username, 64).toLowerCase();
      const secretAnswer = normalizeSecretAnswer(safeText(req.body?.secretAnswer, 160));
      const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
      if (newPassword.length < 8) throw new Error("Mật khẩu cần có ít nhất 8 ký tự.");
      const user = await getMobileUserByUsername(username);
      if (!user || !(await verifyPassword(secretAnswer, user.secretAnswerHash))) throw new Error("Câu trả lời bí mật không đúng.");
      const database = await requireDb();
      await database.update(mobileUsers).set({ passwordHash: await hashPassword(newPassword) }).where(eq(mobileUsers.id, user.id));
      res.status(204).end();
    } catch (error) {
      res.status(400).json({ message: asErrorMessage(error) });
    }
  });

  app.get("/api/friends", protectedRoute(async (_req, res, user) => {
    res.json(await listFriends(user.id));
  }));

  app.get("/api/users/search", protectedRoute(async (req, res, user) => {
    const query = safeText(req.query.q, 80);
    if (!query) {
      res.json([]);
      return;
    }
    const database = await requireDb();
    const pattern = `%${query}%`;
    const users = await database.select().from(mobileUsers).where(or(like(mobileUsers.username, pattern), like(mobileUsers.displayName, pattern), like(mobileUsers.email, pattern))).limit(20);
    const results = await Promise.all(users.filter((item) => item.id !== user.id).map(async (item) => ({ ...toMobileUser(item), relationship: await relationshipBetween(user.id, item.id) })));
    res.json(results);
  }));

  app.get("/api/friend-requests", protectedRoute(async (req, res, user) => {
    const direction = req.query.direction === "outgoing" ? "outgoing" : "incoming";
    const database = await requireDb();
    const records = await database.select().from(friendRequests).where(direction === "incoming" ? eq(friendRequests.recipientId, user.id) : eq(friendRequests.senderId, user.id)).orderBy(desc(friendRequests.createdAt));
    res.json(await Promise.all(records.map(buildFriendRequest)));
  }));

  app.post("/api/friend-requests", protectedRoute(async (req, res, user) => {
    const recipientId = parsePeerId(req.body?.recipientId);
    if (recipientId === user.id) throw new Error("Không thể gửi lời mời cho chính bạn.");
    if (!await getMobileUser(recipientId)) throw new Error("Không tìm thấy người dùng này.");
    const relationship = await relationshipBetween(user.id, recipientId);
    if (relationship === "friends") throw new Error("Hai người đã là bạn bè.");
    if (relationship === "outgoing") throw new Error("Lời mời kết bạn đang chờ phản hồi.");
    if (relationship === "incoming") throw new Error("Người này đã gửi lời mời cho bạn. Hãy phản hồi lời mời đó.");
    const database = await requireDb();
    const inserted = await database.insert(friendRequests).values({ senderId: user.id, recipientId, status: "pending" });
    const requestId = Number((inserted as any).insertId ?? (inserted as any)[0]?.insertId);
    const [record] = await database.select().from(friendRequests).where(eq(friendRequests.id, requestId)).limit(1);
    if (!record) throw new Error("Không thể gửi lời mời kết bạn.");
    const request = await buildFriendRequest(record);
    emitFriendRequest(request);
    res.status(201).json(request);
  }));

  app.post("/api/friend-requests/:requestId/respond", protectedRoute(async (req, res, user) => {
    const requestId = parsePeerId(req.params.requestId);
    const accept = Boolean(req.body?.accept);
    const database = await requireDb();
    const [record] = await database.select().from(friendRequests).where(and(eq(friendRequests.id, requestId), eq(friendRequests.recipientId, user.id))).limit(1);
    if (!record || record.status !== "pending") throw new Error("Lời mời kết bạn không còn hiệu lực.");
    await database.update(friendRequests).set({ status: accept ? "accepted" : "declined", respondedAt: new Date() }).where(eq(friendRequests.id, requestId));
    const [updated] = await database.select().from(friendRequests).where(eq(friendRequests.id, requestId)).limit(1);
    if (!updated) throw new Error("Không thể cập nhật lời mời kết bạn.");
    res.json(await buildFriendRequest(updated));
  }));

  app.get("/api/conversations", protectedRoute(async (_req, res, user) => {
    const database = await requireDb();
    const [records, preferences] = await Promise.all([
      database.select().from(mobileMessages).where(or(eq(mobileMessages.senderId, user.id), eq(mobileMessages.recipientId, user.id))).orderBy(desc(mobileMessages.createdAt)).limit(500),
      database.select().from(mobileConversationPreferences).where(eq(mobileConversationPreferences.userId, user.id)),
    ]);
    const latestByPeer = new Map<number, MobileMessageRecord>();
    const unreadByPeer = new Map<number, number>();
    const preferenceByPeer = new Map(preferences.map((preference) => [preference.peerId, preference]));
    for (const record of records) {
      const peerId = record.senderId === user.id ? record.recipientId : record.senderId;
      const preference = preferenceByPeer.get(peerId);
      const removedForUser = record.senderId === user.id ? record.deletedForSenderAt : record.deletedForRecipientAt;
      if (removedForUser || (preference?.clearedAt && record.createdAt <= preference.clearedAt)) continue;
      if (!latestByPeer.has(peerId)) latestByPeer.set(peerId, record);
      if (record.recipientId === user.id && !record.readAt) unreadByPeer.set(peerId, (unreadByPeer.get(peerId) ?? 0) + 1);
    }
    const peerIds = [...latestByPeer.keys()];
    const peers = peerIds.length ? await database.select().from(mobileUsers).where(inArray(mobileUsers.id, peerIds)) : [];
    const peerById = new Map(peers.map((peer) => [peer.id, peer]));
    const result = peerIds.flatMap((peerId) => {
      const peer = peerById.get(peerId);
      const latest = latestByPeer.get(peerId);
      const preference = preferenceByPeer.get(peerId);
      if (!peer || !latest || preference?.hidden) return [];
      return [{ peer: toMobileUser(peer), lastMessage: toMobileMessage(latest), unreadCount: unreadByPeer.get(peerId) ?? 0, pinned: Boolean(preference?.pinned), archived: Boolean(preference?.archived), muted: Boolean(preference?.muted) }];
    });
    result.sort((left, right) => Number(right.pinned) - Number(left.pinned) || new Date(right.lastMessage.createdAt).getTime() - new Date(left.lastMessage.createdAt).getTime());
    res.json(result);
  }));

  app.patch("/api/conversations/:peerId", protectedRoute(async (req, res, user) => {
    const peerId = parsePeerId(req.params.peerId);
    const changes = req.body ?? {};
    const database = await requireDb();
    const [existing] = await database.select().from(mobileConversationPreferences).where(and(eq(mobileConversationPreferences.userId, user.id), eq(mobileConversationPreferences.peerId, peerId))).limit(1);
    const choose = (key: "pinned" | "archived" | "muted" | "hidden") => typeof changes[key] === "boolean" ? Number(changes[key]) : Number(existing?.[key] ?? 0);
    const values = { userId: user.id, peerId, pinned: choose("pinned"), archived: choose("archived"), muted: choose("muted"), hidden: choose("hidden"), updatedAt: new Date() };
    await database.insert(mobileConversationPreferences).values(values).onDuplicateKeyUpdate({ set: values });
    const [preference] = await database.select().from(mobileConversationPreferences).where(and(eq(mobileConversationPreferences.userId, user.id), eq(mobileConversationPreferences.peerId, peerId))).limit(1);
    const peer = await getMobileUser(peerId);
    res.json({ peer: peer ? toMobileUser(peer) : null, lastMessage: null, unreadCount: 0, pinned: Boolean(preference?.pinned), archived: Boolean(preference?.archived), muted: Boolean(preference?.muted) });
  }));

  app.post("/api/conversations/:peerId/clear", protectedRoute(async (req, res, user) => {
    const peerId = parsePeerId(req.params.peerId);
    if (await relationshipBetween(user.id, peerId) !== "friends") throw new Error("Bạn chỉ có thể làm mới hội thoại với bạn bè đã xác nhận.");
    const database = await requireDb();
    const [existing] = await database.select().from(mobileConversationPreferences).where(and(eq(mobileConversationPreferences.userId, user.id), eq(mobileConversationPreferences.peerId, peerId))).limit(1);
    const clearedAt = new Date();
    const values = { userId: user.id, peerId, pinned: existing?.pinned ?? 0, archived: existing?.archived ?? 0, muted: existing?.muted ?? 0, hidden: existing?.hidden ?? 0, clearedAt, updatedAt: clearedAt };
    await database.insert(mobileConversationPreferences).values(values).onDuplicateKeyUpdate({ set: values });
    io.to(`mobile-user:${user.id}`).emit("chat:cleared", { peerId, clearedAt: clearedAt.toISOString() });
    res.status(204).end();
  }));

  app.post("/api/media", upload.single("file"), protectedRoute(async (req, res, user) => {
    const file = req.file;
    if (!file?.buffer?.length) throw new Error("Không nhận được tệp để tải lên.");
    const mimeType = safeText(file.mimetype, 160).toLowerCase();
    const kind = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("video/") ? "video" : "file";
    const allowed = kind !== "file" || mimeType === "application/pdf" || mimeType === "application/zip" || mimeType.startsWith("text/") || mimeType.includes("spreadsheet") || mimeType.includes("wordprocessing") || mimeType.includes("presentation") || mimeType.includes("excel");
    if (!allowed) throw new Error("Định dạng tệp này chưa được hỗ trợ.");
    if (file.size > 12 * 1024 * 1024) throw new Error("Tệp đính kèm cần nhỏ hơn 12 MB.");
    const name = safeText(file.originalname, 255) || `tep-${Date.now()}`;
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const stored = await storagePut(`ketnoi-chat/${user.id}/${Date.now()}-${safeName}`, file.buffer, mimeType || "application/octet-stream");
    res.status(201).json({ url: stored.url, kind, name, mimeType, size: file.size, thumbnailUrl: null });
  }));

  app.get("/api/messages/:peerId", protectedRoute(async (req, res, user) => {
    const peerId = parsePeerId(req.params.peerId);
    if (await relationshipBetween(user.id, peerId) !== "friends") throw new Error("Bạn chỉ có thể xem tin nhắn với bạn bè đã xác nhận.");
    const database = await requireDb();
    const [records, preferences] = await Promise.all([
      database.select().from(mobileMessages).where(or(and(eq(mobileMessages.senderId, user.id), eq(mobileMessages.recipientId, peerId)), and(eq(mobileMessages.senderId, peerId), eq(mobileMessages.recipientId, user.id)))).orderBy(asc(mobileMessages.createdAt)).limit(500),
      database.select().from(mobileConversationPreferences).where(and(eq(mobileConversationPreferences.userId, user.id), eq(mobileConversationPreferences.peerId, peerId))).limit(1),
    ]);
    const clearedAt = preferences[0]?.clearedAt;
    res.json(records.filter((record) => !(record.senderId === user.id ? record.deletedForSenderAt : record.deletedForRecipientAt) && (!clearedAt || record.createdAt > clearedAt)).map(toMobileMessage));
  }));

  app.post("/api/messages/:peerId", protectedRoute(async (req, res, user) => {
    const peerId = parsePeerId(req.params.peerId);
    res.status(201).json(await saveChatMessage(user.id, peerId, req.body ?? {}));
  }));

  app.post("/api/messages/:peerId/read", protectedRoute(async (req, res, user) => {
    const peerId = parsePeerId(req.params.peerId);
    const database = await requireDb();
    const pending = await database.select().from(mobileMessages).where(and(eq(mobileMessages.senderId, peerId), eq(mobileMessages.recipientId, user.id)));
    const messageIds = pending.filter((message) => !message.readAt).map((message) => message.id);
    if (messageIds.length) {
      const readAt = new Date();
      await database.update(mobileMessages).set({ readAt }).where(inArray(mobileMessages.id, messageIds));
      io.to(`mobile-user:${peerId}`).emit("chat:read", { readerId: user.id, peerId, messageIds, readAt: readAt.toISOString() });
    }
    res.status(204).end();
  }));

  app.delete("/api/messages/:messageId", protectedRoute(async (req, res, user) => {
    const messageId = parsePeerId(req.params.messageId);
    const database = await requireDb();
    const [message] = await database.select().from(mobileMessages).where(eq(mobileMessages.id, messageId)).limit(1);
    if (!message || (message.senderId !== user.id && message.recipientId !== user.id)) throw new Error("Không tìm thấy tin nhắn để xóa.");
    const deletedAt = new Date();
    const deletedForSenderAt = message.senderId === user.id ? deletedAt : message.deletedForSenderAt;
    const deletedForRecipientAt = message.recipientId === user.id ? deletedAt : message.deletedForRecipientAt;
    await database.update(mobileMessages).set({ deletedForSenderAt, deletedForRecipientAt }).where(eq(mobileMessages.id, message.id));
    io.to(`mobile-user:${user.id}`).emit("chat:deleted", { messageId: message.id, peerId: message.senderId === user.id ? message.recipientId : message.senderId });
    res.status(204).end();
  }));

  app.post("/api/messages/:messageId/recall", protectedRoute(async (req, res, user) => {
    const messageId = parsePeerId(req.params.messageId);
    const database = await requireDb();
    const [message] = await database.select().from(mobileMessages).where(eq(mobileMessages.id, messageId)).limit(1);
    if (!message || message.senderId !== user.id) throw new Error("Bạn chỉ có thể thu hồi tin nhắn do mình gửi.");
    if (Date.now() - message.createdAt.getTime() > 15 * 60 * 1000) throw new Error("Tin nhắn chỉ có thể thu hồi trong 15 phút.");
    const recalledAt = new Date();
    await database.update(mobileMessages).set({ body: "Tin nhắn đã được thu hồi", mediaPayload: null, mediaRevokedAt: recalledAt }).where(eq(mobileMessages.id, message.id));
    const [recalled] = await database.select().from(mobileMessages).where(eq(mobileMessages.id, message.id)).limit(1);
    if (!recalled) throw new Error("Không thể thu hồi tin nhắn.");
    const payload = toMobileMessage(recalled);
    io.to(`mobile-user:${message.senderId}`).emit("chat:recalled", payload);
    io.to(`mobile-user:${message.recipientId}`).emit("chat:recalled", payload);
    res.json(payload);
  }));

  app.get("/api/calls", protectedRoute(async (req, res, user) => {
    const rawPeerId = req.query.peerId;
    const peerId = rawPeerId === undefined ? undefined : parsePeerId(rawPeerId);
    res.json(await listCallHistory(user.id, peerId));
  }));

  app.get("/api/calls/:callId/invite", protectedRoute(async (req, res, user) => {
    const callId = validCallId(req.params.callId);
    if (!callId) throw new Error("Mã cuộc gọi không hợp lệ.");
    const database = await requireDb();
    const [record] = await database.select().from(callRecords).where(eq(callRecords.id, callId)).limit(1);
    if (!record || record.calleeId !== user.id || !record.offerData) throw new Error("Không tìm thấy lời mời cuộc gọi.");
    const caller = await getMobileUser(record.callerId);
    if (!caller) throw new Error("Không tìm thấy người gọi.");
    const description = JSON.parse(record.offerData) as { type?: string; sdp?: string };
    if (!description.type || !description.sdp) throw new Error("Lời mời cuộc gọi không hợp lệ.");
    res.json({ callId, fromUserId: caller.id, callerName: caller.displayName, withVideo: record.kind === "video", description });
  }));

  app.post("/api/calls/:callId/decline", protectedRoute(async (req, res, user) => {
    const callId = validCallId(req.params.callId);
    if (!callId) throw new Error("Mã cuộc gọi không hợp lệ.");
    const database = await requireDb();
    const [record] = await database.select().from(callRecords).where(eq(callRecords.id, callId)).limit(1);
    if (!record || record.calleeId !== user.id) throw new Error("Không tìm thấy cuộc gọi đến.");
    const finished = await finishCall(callId, "declined");
    if (finished.finalized && finished.record) await saveCallHistoryMessage(finished.record);
    io.to(`mobile-user:${record.callerId}`).emit("call:hangup", { fromUserId: user.id, callId, reason: "declined" });
    res.status(204).end();
  }));

  app.post("/api/push-tokens", protectedRoute(async (req, res, user) => {
    const pushToken = safeText(req.body?.token, 255);
    const platform = req.body?.platform === "ios" ? "ios" : req.body?.platform === "android" ? "android" : null;
    if (!platform || !/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(pushToken)) throw new Error("Token thông báo đẩy không hợp lệ.");
    const database = await requireDb();
    await database.insert(mobilePushTokens).values({ userId: user.id, token: pushToken, platform, active: 1 }).onDuplicateKeyUpdate({ set: { userId: user.id, platform, active: 1, updatedAt: new Date() } });
    res.status(204).end();
  }));

  app.get("/api/webrtc/config", protectedRoute(async (_req, res, user) => {
    const turnUrls = safeText(process.env.WEBRTC_TURN_URL, 1000).split(",").map((url) => url.trim()).filter(Boolean);
    const turnUsername = safeText(process.env.WEBRTC_TURN_USERNAME, 256);
    const turnCredential = safeText(process.env.WEBRTC_TURN_CREDENTIAL, 512);
    const iceServers = [{ urls: [GOOGLE_STUN] } as { urls: string[]; username?: string; credential?: string }];
    if (turnUrls.length && turnUsername && turnCredential) iceServers.push({ urls: turnUrls, username: turnUsername, credential: turnCredential });
    else iceServers.push(openRelayFallbackCredential(user.id));
    res.json({ iceServers });
  }));

  io.use(async (socket: Socket, next: (error?: Error) => void) => {
    try {
      const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : "";
      const session = await verifySession(token);
      const user = await getMobileUser(session.userId);
      if (!user || user.username !== session.username) throw new Error("Phiên Socket.IO không hợp lệ.");
      socket.data.mobileUser = user;
      next();
    } catch (error) {
      next(new Error(asErrorMessage(error, "Không thể xác thực Socket.IO.")));
    }
  });

  io.on("connection", (socket: Socket) => {
    const user = socket.data.mobileUser as MobileUserRecord;
    const userSockets = onlineSockets.get(user.id) ?? new Set<string>();
    const wasOffline = userSockets.size === 0;
    userSockets.add(socket.id);
    onlineSockets.set(user.id, userSockets);
    socket.emit("presence:list", currentOnlineIds(onlineSockets));
    if (wasOffline) socket.broadcast.emit("presence:changed", { userId: user.id, online: true });

    const relay = async (event: "call:offer" | "call:answer" | "call:ice-candidate" | "call:hangup" | "call:screen-share", payload: CallSignalPayload) => {
      const peerId = Number(payload.toUserId);
      const callId = validCallId(payload.callId);
      if (!Number.isInteger(peerId) || peerId <= 0 || !callId) return;
      try {
        await ensureCallable(user.id, peerId);
        if (event === "call:offer") {
          await createCallRecord(callId, user.id, peerId, payload.withVideo ? "video" : "audio", payload.description);
        } else if (event === "call:answer") {
          await markCallAnswered(callId);
        } else if (event === "call:hangup") {
          const finished = await finishCall(callId, payload.reason === "declined" || payload.reason === "missed" ? payload.reason : "ended");
          if (finished.finalized && finished.record) await saveCallHistoryMessage(finished.record);
        }
        const targetSockets = onlineSockets.get(peerId);
        if (!targetSockets?.size && event === "call:offer") {
          const delivered = await sendIncomingCallPush(peerId, user, callId, Boolean(payload.withVideo));
          if (!delivered) {
            const finished = await finishCall(callId, "missed");
            if (finished.finalized && finished.record) await saveCallHistoryMessage(finished.record);
            socket.emit("call:hangup", { fromUserId: peerId, callId, reason: "missed" });
          }
          return;
        }
        io.to(`mobile-user:${peerId}`).emit(event, {
          ...payload,
          callId,
          fromUserId: user.id,
          callerName: user.displayName,
        });
      } catch (error) {
        socket.emit("call:error", { callId, message: asErrorMessage(error) });
      }
    };

    socket.join(`mobile-user:${user.id}`);
    socket.on("call:offer", (payload: CallSignalPayload) => { void relay("call:offer", payload); });
    socket.on("call:answer", (payload: CallSignalPayload) => { void relay("call:answer", payload); });
    socket.on("call:ice-candidate", (payload: CallSignalPayload) => { void relay("call:ice-candidate", payload); });
    socket.on("call:hangup", (payload: CallSignalPayload) => { void relay("call:hangup", payload); });
    socket.on("call:screen-share", (payload: CallSignalPayload) => { void relay("call:screen-share", payload); });
    socket.on("chat:send", (payload: { recipientId?: unknown; body?: unknown; media?: unknown; mediaItems?: unknown }, acknowledge?: (reply: { ok: boolean; message?: ReturnType<typeof toMobileMessage>; error?: string }) => void) => {
      void saveChatMessage(user.id, parsePeerId(payload.recipientId), payload)
        .then((message) => acknowledge?.({ ok: true, message }))
        .catch((error) => acknowledge?.({ ok: false, error: asErrorMessage(error, "Không gửi được tin nhắn.") }));
    });
    socket.on("chat:typing", (payload: { recipientId?: unknown; isTyping?: unknown }) => {
      const peerId = Number(payload.recipientId);
      if (!Number.isInteger(peerId) || peerId <= 0) return;
      void relationshipBetween(user.id, peerId).then((relationship) => {
        if (relationship === "friends") io.to(`mobile-user:${peerId}`).emit("chat:typing", { fromUserId: user.id, isTyping: Boolean(payload.isTyping) });
      }).catch(() => undefined);
    });

    socket.on("disconnect", () => {
      const sockets = onlineSockets.get(user.id);
      if (!sockets) return;
      sockets.delete(socket.id);
      if (!sockets.size) {
        onlineSockets.delete(user.id);
        socket.broadcast.emit("presence:changed", { userId: user.id, online: false });
      }
    });
  });
}
