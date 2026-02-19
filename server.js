const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

function randomName() {
  const adjectives = ["Silent", "Brave", "Swift", "Curious", "Calm", "Bright", "Hidden", "Lucky"];
  const animals = ["Fox", "Owl", "Panda", "Tiger", "Wolf", "Koala", "Falcon", "Otter"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${adj}${animal}${suffix}`;
}

io.on("connection", (socket) => {
  const nickname = randomName();
  socket.data.nickname = nickname;

  socket.emit("welcome", {
    nickname,
    online: io.engine.clientsCount
  });

  socket.broadcast.emit("system-message", {
    text: `${nickname} joined the chat`,
    timestamp: Date.now(),
    online: io.engine.clientsCount
  });

  io.emit("online", io.engine.clientsCount);

  socket.on("chat-message", (text) => {
    const clean = String(text || "").trim();
    if (!clean) return;
    io.emit("chat-message", {
      from: socket.data.nickname,
      text: clean.slice(0, 500),
      timestamp: Date.now()
    });
  });

  socket.on("disconnect", () => {
    socket.broadcast.emit("system-message", {
      text: `${nickname} left the chat`,
      timestamp: Date.now(),
      online: io.engine.clientsCount
    });

    io.emit("online", io.engine.clientsCount);
  });
});

server.listen(PORT, () => {
  console.log(`Local anonymous chat running at http://localhost:${PORT}`);
});
