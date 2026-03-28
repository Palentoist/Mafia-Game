const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const rooms = {}; // roomId -> room state

function generateRoomId() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function assignRoles(players) {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const roles = {};
  roles[shuffled[0].id] = "mafia";
  roles[shuffled[1].id] = "doctor";
  for (let i = 2; i < shuffled.length; i++) {
    roles[shuffled[i].id] = "crew";
  }
  return roles;
}

function getRoom(roomId) {
  return rooms[roomId];
}

function broadcastRoomState(roomId) {
  const room = getRoom(roomId);
  if (!room) return;

  // Send each player their own role + public state
  room.players.forEach((p) => {
    const socket = io.sockets.sockets.get(p.id);
    if (!socket) return;

    socket.emit("room_update", {
      roomId: room.id,
      players: room.players.map((pl) => ({
        id: pl.id,
        name: pl.name,
        isAlive: pl.isAlive,
        isHost: pl.isHost,
      })),
      phase: room.phase, // "lobby" | "role_reveal" | "night_mafia" | "night_doctor" | "result" | "gameover"
      myRole: room.roles ? room.roles[p.id] : null,
      round: room.round,
      log: room.log,
      winner: room.winner || null,
      nightResult: room.nightResult || null,
    });
  });
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  // Create room
  socket.on("create_room", ({ playerName }) => {
    const roomId = generateRoomId();
    rooms[roomId] = {
      id: roomId,
      players: [{ id: socket.id, name: playerName, isAlive: true, isHost: true }],
      phase: "lobby",
      roles: null,
      round: 0,
      log: [],
      mafiaTarget: null,
      doctorTarget: null,
      winner: null,
      nightResult: null,
    };
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.name = playerName;
    socket.emit("room_created", { roomId });
    broadcastRoomState(roomId);
  });

  // Join room
  socket.on("join_room", ({ roomId, playerName }) => {
    const room = getRoom(roomId);
    if (!room) return socket.emit("error", { message: "Room not found." });
    if (room.phase !== "lobby") return socket.emit("error", { message: "Game already started." });
    if (room.players.length >= 10) return socket.emit("error", { message: "Room is full." });
    if (room.players.find((p) => p.name === playerName))
      return socket.emit("error", { message: "Name already taken in this room." });

    room.players.push({ id: socket.id, name: playerName, isAlive: true, isHost: false });
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.name = playerName;
    socket.emit("room_joined", { roomId });
    broadcastRoomState(roomId);
  });

  // Start game (host only)
  socket.on("start_game", () => {
    const roomId = socket.data.roomId;
    const room = getRoom(roomId);
    if (!room) return;
    const me = room.players.find((p) => p.id === socket.id);
    if (!me || !me.isHost) return socket.emit("error", { message: "Only the host can start." });
    if (room.players.length < 5) return socket.emit("error", { message: "Need at least 5 players." });

    room.roles = assignRoles(room.players);
    room.phase = "role_reveal";
    room.round = 1;
    room.log = [];
    room.winner = null;
    broadcastRoomState(roomId);

    // After 5s auto-advance to night_mafia
    setTimeout(() => {
      if (room.phase === "role_reveal") {
        room.phase = "night_mafia";
        room.mafiaTarget = null;
        room.doctorTarget = null;
        room.nightResult = null;
        broadcastRoomState(roomId);
      }
    }, 5000);
  });

  // Mafia picks target
  socket.on("mafia_pick", ({ targetId }) => {
    const roomId = socket.data.roomId;
    const room = getRoom(roomId);
    if (!room || room.phase !== "night_mafia") return;
    if (room.roles[socket.id] !== "mafia") return;

    room.mafiaTarget = targetId;
    room.phase = "night_doctor";
    broadcastRoomState(roomId);
  });

  // Doctor picks target
  socket.on("doctor_pick", ({ targetId }) => {
    const roomId = socket.data.roomId;
    const room = getRoom(roomId);
    if (!room || room.phase !== "night_doctor") return;
    if (room.roles[socket.id] !== "doctor") return;

    room.doctorTarget = targetId;

    // Resolve night
    const attacked = room.players.find((p) => p.id === room.mafiaTarget);
    const healed = room.players.find((p) => p.id === room.doctorTarget);
    const saved = room.mafiaTarget === room.doctorTarget;

    let nightMsg = "";
    let savedMsg = "";

    if (saved) {
      nightMsg = `🩸 The Mafia attacked ${attacked?.name}, but they were SAVED by the Doctor!`;
      savedMsg = `💊 ${healed?.name} was healed and survived the night.`;
    } else {
      if (attacked) {
        attacked.isAlive = false;
        nightMsg = `💀 ${attacked?.name} was killed by the Mafia!`;
      }
      savedMsg = `💊 ${healed?.name} was protected by the Doctor (but the Mafia struck elsewhere).`;
    }

    room.log.push(`Round ${room.round}: ${nightMsg}`);
    room.nightResult = { nightMsg, savedMsg, saved, attackedName: attacked?.name, healedName: healed?.name };
    room.phase = "result";

    // Check win conditions
    const alivePlayers = room.players.filter((p) => p.isAlive);
    const aliveMafia = alivePlayers.filter((p) => room.roles[p.id] === "mafia");
    const aliveCrew = alivePlayers.filter((p) => room.roles[p.id] !== "mafia");

    if (aliveMafia.length === 0) {
      room.winner = "crew";
      room.phase = "gameover";
    } else if (aliveMafia.length >= aliveCrew.length) {
      room.winner = "mafia";
      room.phase = "gameover";
    }

    broadcastRoomState(roomId);

    // Auto-advance to next round after 6s if game not over
    if (room.phase === "result") {
      setTimeout(() => {
        if (room.phase === "result") {
          room.round += 1;
          room.phase = "night_mafia";
          room.mafiaTarget = null;
          room.doctorTarget = null;
          room.nightResult = null;
          broadcastRoomState(roomId);
        }
      }, 6000);
    }
  });

  // Play again (host only)
  socket.on("play_again", () => {
    const roomId = socket.data.roomId;
    const room = getRoom(roomId);
    if (!room) return;
    const me = room.players.find((p) => p.id === socket.id);
    if (!me || !me.isHost) return;

    // Reset all players alive
    room.players.forEach((p) => (p.isAlive = true));
    room.roles = assignRoles(room.players);
    room.phase = "role_reveal";
    room.round = 1;
    room.log = [];
    room.winner = null;
    room.nightResult = null;
    room.mafiaTarget = null;
    room.doctorTarget = null;
    broadcastRoomState(roomId);

    setTimeout(() => {
      if (room.phase === "role_reveal") {
        room.phase = "night_mafia";
        broadcastRoomState(roomId);
      }
    }, 5000);
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    const room = getRoom(roomId);
    if (!room) return;

    room.players = room.players.filter((p) => p.id !== socket.id);

    // Transfer host if needed
    if (room.players.length > 0 && !room.players.find((p) => p.isHost)) {
      room.players[0].isHost = true;
    }

    if (room.players.length === 0) {
      delete rooms[roomId];
    } else {
      broadcastRoomState(roomId);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🎭 Mafia server running on port ${PORT}`));
