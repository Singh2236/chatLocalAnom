const socket = io();
const messagesEl = document.getElementById("messages");
const statusEl = document.getElementById("status");
const roomEl = document.getElementById("room");
const onlineEl = document.getElementById("online");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("message-input");
const roomInputEl = document.getElementById("room-input");
const joinRoomBtnEl = document.getElementById("join-room-btn");

let currentRoom = "LOBBY";
let nickname = "";

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function clearMessages() {
  messagesEl.innerHTML = "";
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendSystemMessage(text, timestamp = Date.now()) {
  const p = document.createElement("p");
  p.className = "msg system";

  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = fmtTime(timestamp);

  p.appendChild(meta);
  p.appendChild(document.createTextNode(` ${text}`));
  messagesEl.appendChild(p);
  scrollToBottom();
}

function appendChatMessage(from, text, timestamp) {
  const p = document.createElement("p");
  p.className = "msg";

  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = `${fmtTime(timestamp)} | ${from}`;

  const body = document.createElement("span");
  body.className = "body";
  body.textContent = text;

  p.appendChild(meta);
  p.appendChild(document.createElement("br"));
  p.appendChild(body);

  messagesEl.appendChild(p);
  scrollToBottom();
}

function setRoom(room) {
  currentRoom = room;
  roomEl.textContent = `Room: ${room}`;
}

socket.on("connect", () => {
  statusEl.textContent = "Connected";
});

socket.on("disconnect", () => {
  statusEl.textContent = "Disconnected";
});

socket.on("welcome", ({ nickname: assigned, room }) => {
  nickname = assigned;
  statusEl.textContent = `Connected as ${nickname}`;
  setRoom(room || "LOBBY");
  appendSystemMessage(`You joined as ${nickname}`);
});

socket.on("room-joined", ({ room, online }) => {
  setRoom(room);
  onlineEl.textContent = `Online in room: ${online}`;
  clearMessages();
  appendSystemMessage(`You are now in room ${room}`);
});

socket.on("room-history", (messages) => {
  for (const msg of messages) {
    appendChatMessage(msg.sender, msg.text, msg.timestamp);
  }
});

socket.on("online", ({ room, count }) => {
  if (room === currentRoom) {
    onlineEl.textContent = `Online in room: ${count}`;
  }
});

socket.on("system-message", ({ room, text, timestamp }) => {
  if (room !== currentRoom) return;
  appendSystemMessage(text, timestamp);
});

socket.on("chat-message", ({ room, from, text, timestamp }) => {
  if (room !== currentRoom) return;
  appendChatMessage(from, text, timestamp);
});

socket.on("rate-limited", ({ message }) => {
  appendSystemMessage(message || "Slow down.");
});

joinRoomBtnEl.addEventListener("click", () => {
  const room = roomInputEl.value.trim().toUpperCase();
  socket.emit("join-room", room || "LOBBY");
  roomInputEl.value = "";
  roomInputEl.focus();
});

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  socket.emit("chat-message", text);
  inputEl.value = "";
  inputEl.focus();
});
