const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const envCandidates = [".env", ".env.local", ".env copy.example", ".env.example"];
const envPath = envCandidates
  .map((name) => path.resolve(__dirname, name))
  .find((candidate) => fs.existsSync(candidate));

if (envPath) {
  dotenv.config({ path: envPath });
  console.log(`Loaded environment from ${path.basename(envPath)}`);
} else {
  console.warn(
    "No environment file found. Create backend/.env from backend/.env.example"
  );
}

const app = require("./src/app");
const http = require("http");
const { Server } = require("socket.io");
const socketUtils = require("./src/socket");

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: true }
});
socketUtils.setIo(io);

const onlineUsers = new Map();

function emitPresenceChange(userId, isOnline) {
  io.emit("presence.changed", { userId: String(userId), isOnline: Boolean(isOnline) });
}

function emitPresenceSnapshot(socket) {
  socket.emit("presence.snapshot", {
    userIds: Array.from(onlineUsers.keys()).map(String)
  });
}

function decrementPresence(userId) {
  if (!userId || !onlineUsers.has(userId)) return;

  const nextCount = Math.max((onlineUsers.get(userId) || 0) - 1, 0);
  if (nextCount === 0) {
    onlineUsers.delete(userId);
    emitPresenceChange(userId, false);
  } else {
    onlineUsers.set(userId, nextCount);
  }
}

io.on("connection", (socket) => {
  console.log("[socket] connected", socket.id);

  // User joins their personal notification room and all their chat rooms
  socket.on("user:join", async ({ userId }) => {
    if (userId) {
      const normalizedUserId = String(userId);
      if (socket.data.userId === normalizedUserId) {
        socket.join(normalizedUserId);
        emitPresenceSnapshot(socket);
        return;
      }

      if (socket.data.userId && socket.data.userId !== normalizedUserId) {
        decrementPresence(socket.data.userId);
      }

      socket.data.userId = normalizedUserId;
      socket.join(normalizedUserId);

      const nextCount = (onlineUsers.get(normalizedUserId) || 0) + 1;
      onlineUsers.set(normalizedUserId, nextCount);
      if (nextCount === 1) {
        emitPresenceChange(normalizedUserId, true);
      }
      emitPresenceSnapshot(socket);

      console.log(`[socket] ${socket.id} joined user room ${userId}`);
      
      // Also join all chat rooms the user belongs to
      try {
        const pool = require("./src/config/db");
        const chatsRes = await pool.query(
          "SELECT chat_id FROM chat_members WHERE user_id = $1",
          [normalizedUserId]
        );
        for (const row of chatsRes.rows) {
          socket.join(row.chat_id);
        }
      } catch (err) {
        console.error(`[socket] Error auto-joining chats for user ${userId}:`, err);
      }
    }
  });

  socket.on("chat:join", async ({ chatId }) => {
    if (chatId) {
      const userId = socket.data.userId;
      if (!userId) {
        console.warn(`[socket] Unauthorized room join attempt (no userId) for chat ${chatId}`);
        return;
      }
      try {
        const { canAccessChat } = require("./src/services/group.service");
        const hasAccess = await canAccessChat(userId, chatId);
        if (hasAccess) {
          socket.join(chatId);
          console.log(`[socket] ${socket.id} (user ${userId}) joined chat ${chatId}`);
        } else {
          console.warn(`[socket] User ${userId} unauthorized to join chat ${chatId}`);
        }
      } catch (err) {
        console.error(`[socket] Error verifying access for chat ${chatId}:`, err);
      }
    }
  });

  socket.on("chat:leave", ({ chatId }) => {
    if (chatId) {
      socket.leave(chatId);
      console.log(`[socket] ${socket.id} left chat ${chatId}`);
    }
  });

  socket.on("chat.typing.start", ({ chatId, userId, userName }) => {
    if (!chatId || !userId) {
      return;
    }

    socket.to(String(chatId)).emit("chat.typing.start", {
      chatId: String(chatId),
      userId: String(userId),
      userName: userName || null
    });
  });

  socket.on("chat.typing.stop", ({ chatId, userId }) => {
    if (!chatId || !userId) {
      return;
    }

    socket.to(String(chatId)).emit("chat.typing.stop", {
      chatId: String(chatId),
      userId: String(userId)
    });
  });

  socket.on("disconnect", () => {
    const userId = socket.data.userId;
    decrementPresence(userId);

    console.log("[socket] disconnected", socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`UniLink backend running at http://localhost:${PORT}`);
});
