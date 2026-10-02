# Procession

A multiplayer browser card game for 2–6 players.

## Run locally

Requirements: Node.js 20+

```bash
npm install
npm start
```

Then open:

http://localhost:3000

Open the URL in multiple browser tabs/devices on the same reachable server, create a room, and join with the room code.

## Current build

- 66-card deck: 6 suits × 0–10
- 5-card starting hands
- 6-card Procession
- Protected-tail collection rules
- Dynamic suit control and scoring
- Six-suit immediate end condition
- Draw-pile exhaustion end condition
- Final turns
- Simultaneous 2-card reveal
- Room-code multiplayer via WebSockets
- Server-authoritative state and hidden hands
- Color + unique symbol for every suit

## Suit visuals

The current proposed visual mapping is:

- Red — ◆ Diamond
- Blue — ● Circle
- Green — ▲ Triangle
- Yellow — ★ Star
- Purple — ⬟ Hexagon
- Orange — ✚ Cross

The rules engine identifies suits by stable IDs, not by their visual appearance.
