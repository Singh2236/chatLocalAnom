# Local Anonymous Chat

Anonymous chat app with room codes, profanity filtering, spam protection, image uploads, and SQLite message history.

## Features

- Anonymous random nickname per connection.
- Room codes (join/create room by code).
- Location-based nearby groups (join a room based on your current location).
- Profanity filtering (common abusive words are masked).
- Basic anti-spam limits (message burst + very fast send blocking).
- Image upload and sharing in room chat (up to 5 MB per file).
- SQLite persistence (`chat.db`) for room message history.

## Run local

1. Install dependencies:
   `npm install`
2. Start server:
   `npm start`
3. Open:
   `http://localhost:3000`

## Cloud (Render)

- Uses `process.env.PORT`, so Render works out of the box.
- Build command: `npm install`
- Start command: `npm start`
- Add a persistent disk in Render if you want `chat.db` and `uploads/` to survive deploys/restarts.

## Notes

- History load: last 100 messages per room.
- Current persistence stores chat messages only (not system join/leave events).
- Room code format: uppercase letters/numbers, max length 12.
- Uploaded image files are served from `/uploads`.
- Nearby group room code is derived from coarse coordinate grid (~0.25 degrees); raw coordinates are not stored.
