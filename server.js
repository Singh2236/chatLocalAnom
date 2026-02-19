const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const DEFAULT_ROOM = "LOBBY";
const HISTORY_LIMIT = 100;
const MAX_MSG_PER_WINDOW = 6;
const RATE_WINDOW_MS = 10000;
const MIN_MSG_GAP_MS = 400;

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
});

app.use(express.static(path.join(__dirname, "public")));

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

const blockedWords = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "dick",
  "cunt",
  "motherfucker"
];

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
      callback(rows.reverse());
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

function getOpenRooms() {
  const out = [];
  for (const [room, members] of io.sockets.adapter.rooms) {
    if (io.sockets.sockets.has(room)) continue;
    if (!/^[A-Z0-9]{1,12}$/.test(room)) continue;
    out.push({ room, count: members.size });
  }
  out.sort((a, b) => b.count - a.count || a.room.localeCompare(b.room));
  return out;
}

function broadcastRoomsList() {
  io.emit("rooms-list", getOpenRooms());
}

function joinRoom(socket, requestedRoom) {
  const nextRoom = normalizeRoom(requestedRoom);
  const prevRoom = socket.data.room;
  const nickname = socket.data.nickname;

  if (prevRoom === nextRoom) {
    socket.emit("room-joined", {
      room: nextRoom,
      online: roomOnlineCount(nextRoom)
    });
    socket.emit("rooms-list", getOpenRooms());
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
  socket.emit("rooms-list", getOpenRooms());

  socket.on("join-room", (roomCode) => {
    joinRoom(socket, roomCode);
  });

  socket.on("chat-message", (text) => {
    const room = socket.data.room || DEFAULT_ROOM;
    const raw = String(text || "").trim();
    if (!raw) return;

    const now = Date.now();
    if (now - socket.data.lastMessageAt < MIN_MSG_GAP_MS) {
      socket.emit("rate-limited", {
        message: "You are sending too fast. Slow down."
      });
      return;
    }

    const recent = socket.data.rate.filter((ts) => now - ts < RATE_WINDOW_MS);
    if (recent.length >= MAX_MSG_PER_WINDOW) {
      socket.emit("rate-limited", {
        message: "Rate limit reached. Wait a few seconds."
      });
      socket.data.rate = recent;
      return;
    }

    recent.push(now);
    socket.data.rate = recent;
    socket.data.lastMessageAt = now;

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
