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

function resolveDay(room) {
  if (room.discussionTimeout) {
    clearTimeout(room.discussionTimeout);
    room.discussionTimeout = null;
  }
  
  const counts = {};
  let maxVotes = 0;
  let targetsWithMax = [];
  
  Object.values(room.dayVotes || {}).forEach(vote => {
    counts[vote] = (counts[vote] || 0) + 1;
    if (counts[vote] > maxVotes) {
      maxVotes = counts[vote];
      targetsWithMax = [vote];
    } else if (counts[vote] === maxVotes) {
      targetsWithMax.push(vote);
    }
  });

  let executed = null;
  if (targetsWithMax.length === 1 && targetsWithMax[0] !== "skip") {
    const targetId = targetsWithMax[0];
    executed = room.players.find(p => p.id === targetId);
    if (executed) {
      executed.isAlive = false;
      const roleStr = room.roles[executed.id] === "mafia" ? "Mafia" : room.roles[executed.id] === "doctor" ? "Doctor" : "Crew Member";
      room.log.push(`Day ${room.round}: The town executed ${executed.name}. They were a ${roleStr}.`);
    }
  } else {
    room.log.push(`Day ${room.round}: The town could not reach a decision, or voted to skip. Nobody was executed.`);
  }

  room.dayResult = {
    executedId: executed ? executed.id : null,
    executedName: executed ? executed.name : null,
    executedRole: executed ? room.roles[executed.id] : null,
  };

  room.phase = "day_result";
  
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

  broadcastRoomState(room.id);

  if (room.phase === "day_result") {
    setTimeout(() => {
      if (room.phase === "day_result") {
        startNextRound(room);
      }
    }, 6000);
  }
}

function startNextRound(room) {
  room.round += 1;
  room.phase = "night_mafia";
  room.mafiaTarget = null;
  room.doctorTarget = null;
  room.nightResult = null;
  room.dayResult = null;
  room.discussionEndTime = null;
  room.dayVotes = {};
  if (room.discussionTimeout) {
    clearTimeout(room.discussionTimeout);
    room.discussionTimeout = null;
  }
  broadcastRoomState(room.id);
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
      discussionEndTime: room.discussionEndTime || null,
      dayVotes: room.dayVotes || {},
      dayResult: room.dayResult || null,
      chat: room.chat || [],
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
      dayResult: null,
      chat: [],
      dayVotes: {},
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

    // Auto-advance to discussion after 6s if game not over
    if (room.phase === "result") {
      setTimeout(() => {
        if (room.phase === "result") {
          room.phase = "discussion";
          room.discussionEndTime = Date.now() + 5 * 60 * 1000;
          room.dayVotes = {};
          broadcastRoomState(roomId);

          room.discussionTimeout = setTimeout(() => {
            if (room.phase === "discussion") {
              resolveDay(room);
            }
          }, 5 * 60 * 1000);
        }
      }, 6000);
    }
  });

  // Chat System
  socket.on("chat_message", ({ text }) => {
    const roomId = socket.data.roomId;
    const room = getRoom(roomId);
    if (!room) return;
    
    const me = room.players.find((p) => p.id === socket.id);
    if (!me) return;
    
    // Alive players can chat during game, dead players can only chat if game over
    // Let's actually let dead players chat, but maybe mark them as dead (classic Mafia doesn't, but ghost chat is fun). 
    // To be strict to classic, dead players shouldn't talk to alive players. Let's just allow it but they have a ghost symbol.
    
    if (!room.chat) room.chat = [];
    room.chat.push({ senderId: me.id, name: me.name, text, time: Date.now(), isAlive: me.isAlive });
    
    if (room.chat.length > 50) room.chat.shift();
    broadcastRoomState(roomId);
  });

  // Vote during the day
  socket.on("day_vote", ({ targetId }) => {
    const roomId = socket.data.roomId;
    const room = getRoom(roomId);
    if (!room || room.phase !== "discussion") return;

    const me = room.players.find((p) => p.id === socket.id);
    if (!me || !me.isAlive) return;

    if (!room.dayVotes) room.dayVotes = {};
    
    // Toggle vote off if clicking the same person/skip again
    if (room.dayVotes[socket.id] === targetId) {
      delete room.dayVotes[socket.id];
    } else {
      room.dayVotes[socket.id] = targetId;
    }

    const aliveCount = room.players.filter((p) => p.isAlive).length;
    const voteCount = Object.keys(room.dayVotes).length;
    
    // If all alive players have voted
    if (voteCount >= aliveCount) {
      resolveDay(room);
    } else {
      broadcastRoomState(roomId);
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
    room.dayResult = null;
    room.mafiaTarget = null;
    room.doctorTarget = null;
    room.discussionEndTime = null;
    room.dayVotes = {};
    room.chat = [];
    if (room.discussionTimeout) {
      clearTimeout(room.discussionTimeout);
      room.discussionTimeout = null;
    }
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
