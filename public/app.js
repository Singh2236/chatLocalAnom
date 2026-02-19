const socket = io();
const messagesEl = document.getElementById("messages");
const statusEl = document.getElementById("status");
const roomEl = document.getElementById("room");
const onlineEl = document.getElementById("online");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("message-input");
const roomInputEl = document.getElementById("room-input");
const joinRoomBtnEl = document.getElementById("join-room-btn");
const joinLocationBtnEl = document.getElementById("join-location-btn");
const roomsListEl = document.getElementById("rooms-list");
const imageInputEl = document.getElementById("image-input");
const uploadImageBtnEl = document.getElementById("upload-image-btn");
const refreshWeatherBtnEl = document.getElementById("refresh-weather-btn");
const weatherStatusEl = document.getElementById("weather-status");
const weatherCityEl = document.getElementById("weather-city");
const weatherMainEl = document.getElementById("weather-main");
const weatherDetailEl = document.getElementById("weather-detail");

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

function weatherCodeToText(code) {
  const map = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Rain showers",
    81: "Rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Thunderstorm with hail"
  };
  return map[Number(code)] || "Unknown conditions";
}

async function loadWeather(latitude, longitude) {
  weatherStatusEl.textContent = "Loading weather...";
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}` +
    `&longitude=${encodeURIComponent(longitude)}` +
    "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto";

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Weather API request failed");
  }

  const data = await res.json();
  const current = data.current || {};
  const units = data.current_units || {};

  if (typeof current.temperature_2m !== "number") {
    throw new Error("Weather data unavailable");
  }

  const condition = weatherCodeToText(current.weather_code);
  const tempUnit = units.temperature_2m || "°C";
  const humidityUnit = units.relative_humidity_2m || "%";
  const windUnit = units.wind_speed_10m || "km/h";

  weatherMainEl.textContent = `${current.temperature_2m}${tempUnit} - ${condition}`;
  weatherDetailEl.textContent =
    `Humidity ${current.relative_humidity_2m}${humidityUnit} | ` +
    `Wind ${current.wind_speed_10m}${windUnit}`;
  weatherStatusEl.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

async function loadCityName(latitude, longitude) {
  const url =
    `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${encodeURIComponent(latitude)}` +
    `&longitude=${encodeURIComponent(longitude)}&language=en&count=1`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("City lookup failed");
  }

  const data = await res.json();
  const result = Array.isArray(data.results) ? data.results[0] : null;
  if (!result || !result.name) {
    return "City: unavailable";
  }

  const parts = [result.name];
  if (result.admin1) {
    parts.push(result.admin1);
  } else if (result.country) {
    parts.push(result.country);
  }
  return `City: ${parts.join(", ")}`;
}

function getBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation unsupported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      () => reject(new Error("Geolocation unavailable")),
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  });
}

async function loadApproxLocationByIP() {
  const res = await fetch("https://ipapi.co/json/");
  if (!res.ok) {
    throw new Error("IP location lookup failed");
  }

  const data = await res.json();
  const latitude = Number(data.latitude);
  const longitude = Number(data.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("IP location coordinates unavailable");
  }

  const parts = [];
  if (data.city) parts.push(data.city);
  if (data.region) {
    parts.push(data.region);
  } else if (data.country_name) {
    parts.push(data.country_name);
  }

  return {
    latitude,
    longitude,
    cityLabel: parts.length ? `City: ${parts.join(", ")}` : "City: unavailable"
  };
}

async function requestWeatherByLocation() {
  weatherStatusEl.textContent = "Requesting location...";
  weatherCityEl.textContent = "City: locating...";

  let latitude;
  let longitude;
  let fallbackCityLabel = null;
  let usedApproximateLocation = false;

  try {
    const browserLocation = await getBrowserLocation();
    latitude = browserLocation.latitude;
    longitude = browserLocation.longitude;
  } catch (_err) {
    try {
      const ipLocation = await loadApproxLocationByIP();
      latitude = ipLocation.latitude;
      longitude = ipLocation.longitude;
      fallbackCityLabel = ipLocation.cityLabel;
      usedApproximateLocation = true;
    } catch (_ipErr) {
      weatherStatusEl.textContent = "Location unavailable.";
      weatherCityEl.textContent = "City: unavailable";
      return;
    }
  }

  try {
    const [weatherResult, cityResult] = await Promise.allSettled([
      loadWeather(latitude, longitude),
      loadCityName(latitude, longitude)
    ]);

    if (cityResult.status === "fulfilled") {
      weatherCityEl.textContent = cityResult.value;
    } else {
      weatherCityEl.textContent = fallbackCityLabel || "City: unavailable";
    }

    if (weatherResult.status === "rejected") {
      throw weatherResult.reason;
    }

    if (usedApproximateLocation) {
      weatherStatusEl.textContent =
        `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} (approx by IP)`;
    }
  } catch (err) {
    weatherStatusEl.textContent = `Weather error: ${err.message}`;
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

socket.on("location-room-joined", ({ room, gridDegrees }) => {
  appendSystemMessage(
    `Joined nearby group ${room} (area grid ~${Number(gridDegrees).toFixed(2)} degrees).`
  );
});

socket.on("location-room-error", ({ message }) => {
  appendSystemMessage(message || "Unable to join nearby group.");
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

joinLocationBtnEl.addEventListener("click", () => {
  if (!navigator.geolocation) {
    appendSystemMessage("Geolocation is not supported in this browser.");
    return;
  }

  appendSystemMessage("Requesting your location...");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      socket.emit("join-location-room", {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      });
    },
    (error) => {
      if (error.code === 1) {
        appendSystemMessage("Location permission denied.");
        return;
      }
      if (error.code === 2) {
        appendSystemMessage("Could not get your location.");
        return;
      }
      appendSystemMessage("Location request timed out.");
    },
    {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 60000
    }
  );
});

refreshWeatherBtnEl.addEventListener("click", () => {
  requestWeatherByLocation();
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

requestWeatherByLocation();
