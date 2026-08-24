import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { promisify } from "node:util";

import { and, asc, desc, eq, inArray, like, or } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { Server as SocketServer, type Socket } from "socket.io";

import {
  callRecords,
  friendRequests,
  mobileUsers,
  type CallRecord,
  type FriendRequestRecord,
  type MobileUserRecord,
} from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";

const scrypt = promisify(scryptCallback);
const GOOGLE_STUN = "stun:stun.l.google.com:19302";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type MobileSession = { userId: number; username: string };
type CallKind = "audio" | "video";
type CallReason = "ended" | "missed" | "declined";
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

async function createCallRecord(callId: string, callerId: number, calleeId: number, kind: CallKind) {
  const database = await requireDb();
  const existing = await database.select().from(callRecords).where(eq(callRecords.id, callId)).limit(1);
  if (existing[0]) return existing[0];
  await database.insert(callRecords).values({ id: callId, callerId, calleeId, kind, status: "ringing" });
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
  if (!record || record.endedAt) return record ?? null;
  const endedAt = new Date();
  const durationSeconds = record.answeredAt ? Math.max(0, Math.floor((endedAt.getTime() - record.answeredAt.getTime()) / 1000)) : 0;
  const status = reason === "ended" ? "ended" : reason;
  await database.update(callRecords).set({ status, endedAt, durationSeconds }).where(eq(callRecords.id, callId));
  return { ...record, status, endedAt, durationSeconds };
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

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.post("/api/auth/register", async (req, res) => {
    try {
      const username = safeText(req.body?.username, 64).toLowerCase();
      const displayName = safeText(req.body?.displayName, 120);
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const email = safeText(req.body?.email, 320) || null;
      if (!/^[a-z0-9_]{3,64}$/.test(username)) throw new Error("Username cần 3–64 ký tự gồm chữ thường, số hoặc dấu gạch dưới.");
      if (displayName.length < 2) throw new Error("Tên hiển thị cần có ít nhất 2 ký tự.");
      if (password.length < 8) throw new Error("Mật khẩu cần có ít nhất 8 ký tự.");
      if (await getMobileUserByUsername(username)) throw new Error("Username này đã được sử dụng.");
      const database = await requireDb();
      const passwordHash = await hashPassword(password);
      const inserted = await database.insert(mobileUsers).values({ username, displayName, passwordHash, email });
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
    res.status(201).json(await buildFriendRequest(record));
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

  app.get("/api/messages/:peerId", protectedRoute(async (_req, res) => {
    // Luồng gọi chỉ cần lịch sử trống để mở màn hình chat và dùng các nút gọi.
    res.json([]);
  }));

  app.post("/api/messages/:peerId/read", protectedRoute(async (_req, res) => {
    res.status(204).end();
  }));

  app.get("/api/calls", protectedRoute(async (req, res, user) => {
    const rawPeerId = req.query.peerId;
    const peerId = rawPeerId === undefined ? undefined : parsePeerId(rawPeerId);
    res.json(await listCallHistory(user.id, peerId));
  }));

  app.get("/api/webrtc/config", protectedRoute(async (_req, res) => {
    const turnUrls = safeText(process.env.WEBRTC_TURN_URL, 1000).split(",").map((url) => url.trim()).filter(Boolean);
    const turnUsername = safeText(process.env.WEBRTC_TURN_USERNAME, 256);
    const turnCredential = safeText(process.env.WEBRTC_TURN_CREDENTIAL, 512);
    const iceServers = [{ urls: [GOOGLE_STUN] } as { urls: string[]; username?: string; credential?: string }];
    if (turnUrls.length && turnUsername && turnCredential) iceServers.push({ urls: turnUrls, username: turnUsername, credential: turnCredential });
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
          await createCallRecord(callId, user.id, peerId, payload.withVideo ? "video" : "audio");
        } else if (event === "call:answer") {
          await markCallAnswered(callId);
        } else if (event === "call:hangup") {
          await finishCall(callId, payload.reason === "declined" || payload.reason === "missed" ? payload.reason : "ended");
        }
        const targetSockets = onlineSockets.get(peerId);
        if (!targetSockets?.size && event === "call:offer") {
          await finishCall(callId, "missed");
          socket.emit("call:hangup", { fromUserId: peerId, callId, reason: "missed" });
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
