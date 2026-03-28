# 🎭 Mafia — A Game of Deception

Real-time multiplayer Mafia game built with **Socket.IO**, **Node.js**, and **React + Vite**.

---

## 📁 Project Structure

```
mafia-game/
├── server/         ← Node.js + Socket.IO backend
│   ├── index.js
│   └── package.json
└── client/         ← React + Vite frontend
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx
        └── index.css
```

---

## 🚀 Setup & Running

### 1. Start the Server

```bash
cd server
npm install
npm start
```

Server runs on **http://localhost:3001**

### 2. Start the Client

```bash
cd client
npm install
npm run dev
```

Client runs on **http://localhost:3000**

---

## 🎮 How to Play

### Lobby
- One player **creates a room** → gets a 5-letter Room Code
- Others **join using that code** (minimum **5 players** to start)
- Host clicks **Start Game**

### Roles (assigned randomly)
| Role | Ability |
|------|---------|
| 🔫 Mafia (×1) | Chooses who to eliminate each night |
| 💊 Doctor (×1) | Chooses who to protect each night |
| 👤 Crew (rest) | Survive until the Mafia is found |

### Night Phase
1. **Mafia's turn** — everyone else sees a black screen. Mafia picks a target.
2. **Doctor's turn** — everyone else sees a black screen. Doctor picks who to heal.

### Resolution
- Healed == Attacked → **"The Mafia's target was SAVED!"**
- Healed ≠ Attacked → attacked player is **eliminated**

### Win Conditions
- **Crew wins** when the Mafia is eliminated
- **Mafia wins** when their numbers equal or exceed the Crew

---

## 🌐 Playing on LAN (same WiFi)

1. Find your local IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
2. In `client/src/App.jsx`, change:
   ```js
   const SERVER_URL = "http://YOUR_LOCAL_IP:3001";
   ```
3. Other players open `http://YOUR_LOCAL_IP:3000` on their device

## ☁️ Deploying Online

- **Server** → [Railway](https://railway.app) or [Render](https://render.com)
- **Client** → [Vercel](https://vercel.com) or [Netlify](https://netlify.com)
- Update `SERVER_URL` in `App.jsx` to your deployed server URL

---

## 🛠 Tech Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: React 18, Vite, Socket.IO Client
- **Fonts**: Playfair Display, Courier Prime (Google Fonts)
