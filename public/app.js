const socket = io();
const messagesEl = document.getElementById("messages");
const statusEl = document.getElementById("status");
const roomEl = document.getElementById("room");
const onlineEl = document.getElementById("online");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("message-input");
const roomInputEl = document.getElementById("room-input");
const joinRoomBtnEl = document.getElementById("join-room-btn");
const roomsListEl = document.getElementById("rooms-list");
const imageInputEl = document.getElementById("image-input");
const uploadImageBtnEl = document.getElementById("upload-image-btn");

let currentRoom = "LOBBY";
let nickname = "";
let latestRooms = [];

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

function appendImageMessage(from, url, timestamp) {
  const p = document.createElement("p");
  p.className = "msg";

  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = `${fmtTime(timestamp)} | ${from}`;

  const img = document.createElement("img");
  img.className = "chat-image";
  img.src = url;
  img.alt = `Image from ${from}`;
  img.loading = "lazy";

  p.appendChild(meta);
  p.appendChild(document.createElement("br"));
  p.appendChild(img);

  messagesEl.appendChild(p);
  scrollToBottom();
}

function setRoom(room) {
  currentRoom = room;
  roomEl.textContent = `Room: ${room}`;
  renderRoomsList(latestRooms);
}

function renderRoomsList(rooms) {
  latestRooms = rooms;
  roomsListEl.innerHTML = "";

  if (!rooms.length) {
    const empty = document.createElement("li");
    empty.className = "rooms-empty";
    empty.textContent = "No open rooms yet";
    roomsListEl.appendChild(empty);
    return;
  }

  for (const item of rooms) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "room-item";
    button.dataset.room = item.room;
    if (item.room === currentRoom) {
      button.classList.add("active");
    }
    button.innerHTML = `<span>${item.room}</span><span>${item.count}</span>`;
    li.appendChild(button);
    roomsListEl.appendChild(li);
  }
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
    if (msg.type === "image") {
      appendImageMessage(msg.sender, msg.url, msg.timestamp);
    } else {
      appendChatMessage(msg.sender, msg.text, msg.timestamp);
    }
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

socket.on("chat-image", ({ room, from, url, timestamp }) => {
  if (room !== currentRoom) return;
  appendImageMessage(from, url, timestamp);
});

socket.on("rate-limited", ({ message }) => {
  appendSystemMessage(message || "Slow down.");
});

socket.on("rooms-list", (rooms) => {
  renderRoomsList(Array.isArray(rooms) ? rooms : []);
});

roomsListEl.addEventListener("click", (e) => {
  const target = e.target.closest(".room-item");
  if (!target) return;
  socket.emit("join-room", target.dataset.room || "LOBBY");
});

joinRoomBtnEl.addEventListener("click", () => {
  const room = roomInputEl.value.trim().toUpperCase();
  socket.emit("join-room", room || "LOBBY");
  roomInputEl.value = "";
  roomInputEl.focus();
});

uploadImageBtnEl.addEventListener("click", () => {
  imageInputEl.click();
});

imageInputEl.addEventListener("change", async () => {
  const file = imageInputEl.files && imageInputEl.files[0];
  if (!file) return;

  const data = new FormData();
  data.append("image", file);

  try {
    appendSystemMessage("Uploading image...");
    const res = await fetch("/upload", {
      method: "POST",
      body: data
    });

    const body = await res.json();
    if (!res.ok || !body.url) {
      throw new Error(body.error || "Upload failed");
    }

    socket.emit("chat-image", body.url);
  } catch (err) {
    appendSystemMessage(`Image upload failed: ${err.message}`);
  } finally {
    imageInputEl.value = "";
  }
});

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  socket.emit("chat-message", text);
  inputEl.value = "";
  inputEl.focus();
});
