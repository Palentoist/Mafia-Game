const io = require("socket.io-client");
const socket = io("http://localhost:3001");

socket.on("connect", () => {
  console.log("Connected as", socket.id);
  socket.emit("create_room", { playerName: "Tester" });
});

socket.on("room_created", ({ roomId }) => {
  console.log("Room Created", roomId);
  // Force start
  socket.emit("start_game");
});

socket.on("room_update", (state) => {
  console.log("Update phase:", state.phase, "round:", state.round);
  
  if (state.phase === "night_mafia") {
     socket.emit("mafia_pick", { targetId: "test" });
  }
  if (state.phase === "night_doctor") {
     socket.emit("doctor_pick", { targetId: "test" });
  }
  
  if (state.phase === "discussion") {
      console.log("Reached discussion!");
      socket.emit("chat_message", { text: "Hello World" });
      socket.emit("day_vote", { targetId: "skip" });
      
      setTimeout(() => {
         console.log("Exiting test...");
         process.exit(0);
      }, 500);
  }
  
  if (state.chat && state.chat.length > 0) {
     console.log("Chat contains:", state.chat);
  }
  if (state.dayVotes && Object.keys(state.dayVotes).length > 0) {
     console.log("Day votes contain:", state.dayVotes);
  }
});
