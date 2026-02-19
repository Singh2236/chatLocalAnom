const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const DEFAULT_ROOM = "LOBBY";
const HISTORY_LIMIT = 100;
const MAX_MSG_PER_WINDOW = 6;
const RATE_WINDOW_MS = 10000;
const MIN_MSG_GAP_MS = 400;
const UPLOAD_DIR = path.join(__dirname, "uploads");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new sqlite3.Database(path.join(__dirname, "chat.db"));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room TEXT NOT NULL,
      sender TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      room TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    )
  `);
  db.run(`INSERT OR IGNORE INTO rooms (room, created_at) VALUES (?, ?)`, [DEFAULT_ROOM, Date.now()]);
});

app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (String(file.mimetype || "").startsWith("image/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only image files are allowed"));
  }
});

app.post("/upload", (req, res) => {
  upload.single("image")(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || "Upload failed" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No image file provided" });
      return;
    }
    res.json({ url: `/uploads/${req.file.filename}` });
  });
});

function randomName() {
  const adjectives = ["Silent", "Brave", "Swift", "Curious", "Calm", "Bright", "Hidden", "Lucky"];
  const animals = ["Fox", "Owl", "Panda", "Tiger", "Wolf", "Koala", "Falcon", "Otter"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${adj}${animal}${suffix}`;
}

function normalizeRoom(input) {
  const clean = String(input || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
  return clean || DEFAULT_ROOM;
}

const blockedWords = ["fuck", "shit", "bitch", "asshole", "bastard", "dick", "cunt", "motherfucker"];

function censorProfanity(text) {
  let out = text;
  for (const word of blockedWords) {
    const re = new RegExp(`\\b${word}\\b`, "gi");
    out = out.replace(re, (match) => "*".repeat(match.length));
  }
  return out;
}

function roomOnlineCount(room) {
  return io.sockets.adapter.rooms.get(room)?.size || 0;
}

function parseStoredMessage(row) {
  if (String(row.text).startsWith("__IMG__:")) {
    return {
      sender: row.sender,
      type: "image",
      url: row.text.replace("__IMG__:", ""),
      timestamp: row.timestamp
    };
  }
  return {
    sender: row.sender,
    type: "text",
    text: row.text,
    timestamp: row.timestamp
  };
}

function readRoomHistory(room, callback) {
  db.all(
    `
      SELECT sender, text, created_at AS timestamp
      FROM messages
      WHERE room = ?
      ORDER BY id DESC
      LIMIT ?
    `,
    [room, HISTORY_LIMIT],
    (err, rows) => {
      if (err) {
        callback([]);
        return;
      }
      callback(rows.reverse().map(parseStoredMessage));
    }
  );
}

function saveMessage(room, sender, text, timestamp) {
  db.run(`INSERT INTO messages (room, sender, text, created_at) VALUES (?, ?, ?, ?)`, [
    room,
    sender,
    text,
    timestamp
  ]);
}

function emitRoomOnline(room) {
  io.to(room).emit("online", {
    room,
    count: roomOnlineCount(room)
  });
}

function ensureRoomExists(room) {
  db.run(`INSERT OR IGNORE INTO rooms (room, created_at) VALUES (?, ?)`, [room, Date.now()]);
}

function getRoomsList(callback) {
  db.all(`SELECT room FROM rooms`, [], (err, rows) => {
    if (err) {
      callback([]);
      return;
    }
    const out = rows
      .map((row) => row.room)
      .filter((room) => /^[A-Z0-9]{1,12}$/.test(room))
      .map((room) => ({ room, count: roomOnlineCount(room) }));
    out.sort((a, b) => b.count - a.count || a.room.localeCompare(b.room));
    callback(out);
  });
}

function emitRoomsListTo(socket) {
  getRoomsList((rooms) => {
    socket.emit("rooms-list", rooms);
  });
}

function broadcastRoomsList() {
  getRoomsList((rooms) => {
    io.emit("rooms-list", rooms);
  });
}

function overRateLimit(socket, now) {
  if (now - socket.data.lastMessageAt < MIN_MSG_GAP_MS) {
    socket.emit("rate-limited", {
      message: "You are sending too fast. Slow down."
    });
    return true;
  }

  const recent = socket.data.rate.filter((ts) => now - ts < RATE_WINDOW_MS);
  if (recent.length >= MAX_MSG_PER_WINDOW) {
    socket.emit("rate-limited", {
      message: "Rate limit reached. Wait a few seconds."
    });
    socket.data.rate = recent;
    return true;
  }

  recent.push(now);
  socket.data.rate = recent;
  socket.data.lastMessageAt = now;
  return false;
}

function joinRoom(socket, requestedRoom) {
  const nextRoom = normalizeRoom(requestedRoom);
  const prevRoom = socket.data.room;
  const nickname = socket.data.nickname;
  ensureRoomExists(nextRoom);

  if (prevRoom === nextRoom) {
    socket.emit("room-joined", {
      room: nextRoom,
      online: roomOnlineCount(nextRoom)
    });
    emitRoomsListTo(socket);
    readRoomHistory(nextRoom, (history) => {
      socket.emit("room-history", history);
    });
    return;
  }

  if (prevRoom) {
    socket.leave(prevRoom);
    socket.to(prevRoom).emit("system-message", {
      room: prevRoom,
      text: `${nickname} left room ${prevRoom}`,
      timestamp: Date.now()
    });
    emitRoomOnline(prevRoom);
  }

  socket.join(nextRoom);
  socket.data.room = nextRoom;

  socket.emit("room-joined", {
    room: nextRoom,
    online: roomOnlineCount(nextRoom)
  });

  socket.to(nextRoom).emit("system-message", {
    room: nextRoom,
    text: `${nickname} joined room ${nextRoom}`,
    timestamp: Date.now()
  });
  emitRoomOnline(nextRoom);
  broadcastRoomsList();

  readRoomHistory(nextRoom, (history) => {
    socket.emit("room-history", history);
  });
}

io.on("connection", (socket) => {
  const nickname = randomName();
  socket.data.nickname = nickname;
  socket.data.rate = [];
  socket.data.lastMessageAt = 0;
  socket.data.room = null;

  socket.emit("welcome", {
    nickname,
    room: DEFAULT_ROOM
  });

  joinRoom(socket, DEFAULT_ROOM);
  emitRoomsListTo(socket);

  socket.on("join-room", (roomCode) => {
    joinRoom(socket, roomCode);
  });

  socket.on("chat-message", (text) => {
    const room = socket.data.room || DEFAULT_ROOM;
    const raw = String(text || "").trim();
    if (!raw) return;

    const now = Date.now();
    if (overRateLimit(socket, now)) return;

    const filtered = censorProfanity(raw.slice(0, 500));
    const payload = {
      room,
      from: socket.data.nickname,
      text: filtered,
      timestamp: now
    };

    io.to(room).emit("chat-message", payload);
    saveMessage(room, payload.from, payload.text, payload.timestamp);
  });

  socket.on("chat-image", (url) => {
    const room = socket.data.room || DEFAULT_ROOM;
    const cleanUrl = String(url || "").trim();
    if (!cleanUrl.startsWith("/uploads/")) return;

    const now = Date.now();
    if (overRateLimit(socket, now)) return;

    const payload = {
      room,
      from: socket.data.nickname,
      url: cleanUrl,
      timestamp: now
    };

    io.to(room).emit("chat-image", payload);
    saveMessage(room, payload.from, `__IMG__:${payload.url}`, payload.timestamp);
  });

  socket.on("disconnect", () => {
    const room = socket.data.room;
    if (!room) return;

    socket.to(room).emit("system-message", {
      room,
      text: `${nickname} left room ${room}`,
      timestamp: Date.now()
    });
    emitRoomOnline(room);
    broadcastRoomsList();
  });
});

server.listen(PORT, () => {
  console.log(`Local anonymous chat running at http://localhost:${PORT}`);
});
