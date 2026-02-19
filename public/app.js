const socket = io();
const messagesEl = document.getElementById("messages");
const statusEl = document.getElementById("status");
const onlineEl = document.getElementById("online");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("message-input");

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function appendMessage(html, cls = "") {
  const p = document.createElement("p");
  p.className = `msg ${cls}`.trim();
  p.innerHTML = html;
  messagesEl.appendChild(p);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

socket.on("connect", () => {
  statusEl.textContent = "Connected";
});

socket.on("disconnect", () => {
  statusEl.textContent = "Disconnected";
});

socket.on("welcome", ({ nickname, online }) => {
  statusEl.textContent = `Connected as ${nickname}`;
  onlineEl.textContent = `Online: ${online}`;
  appendMessage("You joined the chat", "system");
});

socket.on("online", (count) => {
  onlineEl.textContent = `Online: ${count}`;
});

socket.on("system-message", ({ text, timestamp, online }) => {
  appendMessage(`<span class="meta">${fmtTime(timestamp)}</span> ${text}`, "system");
  if (typeof online === "number") {
    onlineEl.textContent = `Online: ${online}`;
  }
});

socket.on("chat-message", ({ from, text, timestamp }) => {
  appendMessage(`<span class="meta">${fmtTime(timestamp)} | ${from}</span><br>${text}`);
});

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  socket.emit("chat-message", text);
  inputEl.value = "";
  inputEl.focus();
});
