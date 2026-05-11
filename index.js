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

io.on("connection", (socket) => {
  console.log("[socket] connected", socket.id);

  // User joins their personal notification room
  socket.on("user:join", ({ userId }) => {
    if (userId) {
      const normalizedUserId = String(userId);
      socket.data.userId = normalizedUserId;
      socket.join(normalizedUserId);

      const nextCount = (onlineUsers.get(normalizedUserId) || 0) + 1;
      onlineUsers.set(normalizedUserId, nextCount);
      if (nextCount === 1) {
        emitPresenceChange(normalizedUserId, true);
      }

      console.log(`[socket] ${socket.id} joined user room ${userId}`);
    }
  });

  socket.on("chat:join", ({ chatId }) => {
    if (chatId) {
      socket.join(chatId);
      console.log(`[socket] ${socket.id} joined chat ${chatId}`);
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
    if (userId && onlineUsers.has(userId)) {
      const nextCount = Math.max((onlineUsers.get(userId) || 0) - 1, 0);
      if (nextCount === 0) {
        onlineUsers.delete(userId);
        emitPresenceChange(userId, false);
      } else {
        onlineUsers.set(userId, nextCount);
      }
    }

    console.log("[socket] disconnected", socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`UniLink backend running at http://localhost:${PORT}`);
});
