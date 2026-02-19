# Local Anonymous Chat

A simple web app for anonymous chat on your local network.

## Run

1. Install dependencies:
   npm install
2. Start server:
   npm start
3. Open in browser:
   http://localhost:3000

## Local network use

- Find your machine IP (example `192.168.1.8`).
- Other users on the same network can open:
  `http://YOUR_IP:3000`
- Allow Node.js through your firewall if prompted.

## Notes

- No login, no permanent accounts, no database.
- Nicknames are random per connection.
- Messages are in-memory only and disappear when server restarts.
