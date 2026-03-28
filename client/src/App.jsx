import React, { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:3001";

let socket = null;
function getSocket() {
  if (!socket) {
    socket = io(SERVER_URL, { autoConnect: false });
  }
  return socket;
}

function RoleBadge({ role }) {
  const map = { mafia: ["🔫", "Mafia"], doctor: ["💊", "Doctor"], crew: ["👤", "Crew"] };
  const [icon, label] = map[role] || ["?", "Unknown"];
  return (
    <span className={`player-badge badge-${role === "crew" ? "host" : "you"}`} style={{ color: role === "mafia" ? "var(--red-bright)" : role === "doctor" ? "var(--doctor)" : "var(--gold)" }}>
      {icon} {label}
    </span>
  );
}

// ─── Screens ────────────────────────────────────────────────────────

function LandingScreen({ onCreateRoom, onJoinRoom }) {
  return (
    <div className="panel">
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: "3.5rem", marginBottom: 8 }} className="flicker">🎭</div>
        <h1>MAFIA</h1>
        <div className="divider"><span>a game of deception</span></div>
        <p style={{ fontSize: "0.85rem", fontStyle: "italic" }}>The city sleeps. The killers never do.</p>
      </div>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <button className="btn-primary" onClick={onCreateRoom}>Create a Room</button>
        <button className="btn-secondary" onClick={onJoinRoom}>Join a Room</button>
      </div>
    </div>
  );
}

function CreateRoomScreen({ onBack }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = () => {
    if (!name.trim()) return setError("Enter your name to continue.");
    setLoading(true);
    const s = getSocket();
    s.connect();
    s.emit("create_room", { playerName: name.trim() });
    s.once("error", (e) => { setError(e.message); setLoading(false); });
  };

  return (
    <div className="panel">
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <h2>Create Room</h2>
        <p style={{ marginTop: 6 }}>You'll be the host — share the room code with others.</p>
      </div>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <input placeholder="Your name…" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleCreate()} maxLength={20} />
        {error && <div className="error-msg">{error}</div>}
        <button className="btn-primary" onClick={handleCreate} disabled={loading}>
          {loading ? "Connecting…" : "Create Room"}
        </button>
        <button className="btn-ghost" onClick={onBack}>← Back</button>
      </div>
    </div>
  );
}

function JoinRoomScreen({ onBack }) {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoin = () => {
    if (!name.trim()) return setError("Enter your name.");
    if (!roomId.trim()) return setError("Enter the room code.");
    setLoading(true);
    const s = getSocket();
    s.connect();
    s.emit("join_room", { playerName: name.trim(), roomId: roomId.trim().toUpperCase() });
    s.once("error", (e) => { setError(e.message); setLoading(false); });
  };

  return (
    <div className="panel">
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <h2>Join Room</h2>
        <p style={{ marginTop: 6 }}>Enter the code your host shared with you.</p>
      </div>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <input placeholder="Your name…" value={name} onChange={e => setName(e.target.value)} maxLength={20} />
        <input placeholder="Room code (e.g. AB3XY)…" value={roomId} onChange={e => setRoomId(e.target.value.toUpperCase())} maxLength={5} onKeyDown={e => e.key === "Enter" && handleJoin()} />
        {error && <div className="error-msg">{error}</div>}
        <button className="btn-primary" onClick={handleJoin} disabled={loading}>
          {loading ? "Joining…" : "Join Room"}
        </button>
        <button className="btn-ghost" onClick={onBack}>← Back</button>
      </div>
    </div>
  );
}

function LobbyScreen({ state, myId }) {
  const { players, roomId } = state;
  const me = players.find(p => p.id === myId);
  const isHost = me?.isHost;
  const canStart = players.length >= 5;

  const handleStart = () => {
    getSocket().emit("start_game");
  };

  return (
    <div className="panel">
      <div className="room-id-display">
        <div className="room-id-label">Room Code</div>
        <div className="room-id-code">{roomId}</div>
        <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 6, fontStyle: "italic" }}>
          Share this code with other players
        </div>
      </div>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3>Players ({players.length}/10)</h3>
          {!canStart && <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>Need {5 - players.length} more</span>}
        </div>
        <div className="player-list">
          {players.map(p => (
            <div className="player-item" key={p.id}>
              <div className="player-dot" />
              <span className="player-name">{p.name}</span>
              {p.isHost && <span className="player-badge badge-host">Host</span>}
              {p.id === myId && <span className="player-badge badge-you">You</span>}
            </div>
          ))}
        </div>
        {isHost ? (
          <>
            <button className="btn-primary" onClick={handleStart} disabled={!canStart} style={{ marginTop: 8 }}>
              {canStart ? "Start Game" : `Waiting for players… (${players.length}/5)`}
            </button>
          </>
        ) : (
          <div className="wait-msg">⌛ Waiting for the host to start the game…</div>
        )}
      </div>
    </div>
  );
}

function RoleRevealScreen({ state, myId }) {
  const { myRole } = state;
  const roleMap = {
    mafia: { icon: "🔫", title: "Mafia", desc: "Eliminate the crew before they discover you. Choose wisely — you act first each night." },
    doctor: { icon: "💊", title: "Doctor", desc: "Protect the innocent. Each night, choose one person to shield from the Mafia's blade." },
    crew: { icon: "👤", title: "Crew Member", desc: "Stay alive. The Mafia hides among you. Trust no one." },
  };
  const info = roleMap[myRole] || roleMap.crew;

  return (
    <div className="panel">
      <div className="card role-card">
        <div className="phase-label">Your Role</div>
        <span className="role-icon">{info.icon}</span>
        <div className={`role-title ${myRole}`}>{info.title}</div>
        <div className="role-desc" style={{ marginTop: 12 }}>{info.desc}</div>
        <div className="divider" style={{ marginTop: 24 }}><span>night falls soon</span></div>
        <p style={{ textAlign: "center", fontSize: "0.8rem" }}>Memorise your role. The screen will change in a moment…</p>
      </div>
    </div>
  );
}

function NightMafiaScreen({ state, myId }) {
  const { players, myRole, round } = state;
  const isMafia = myRole === "mafia";
  const alivePlayers = players.filter(p => p.isAlive && p.id !== myId);

  const handlePick = (targetId) => {
    getSocket().emit("mafia_pick", { targetId });
  };

  if (!isMafia) {
    return (
      <div className="panel">
        <div className="card blackout">
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: "2rem", marginBottom: 12, opacity: 0.15 }}>🌑</div>
            <p style={{ color: "#1e1e22", fontSize: "0.9rem" }}>The city is asleep…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="card">
        <div className="phase-label">Night {round} — Mafia's Turn</div>
        <h2 style={{ color: "var(--red-bright)", marginBottom: 6 }}>Choose Your Target</h2>
        <p style={{ marginBottom: 20, fontSize: "0.85rem" }}>Select the player you will eliminate tonight. The Doctor will act next.</p>
        <div className="player-list">
          {alivePlayers.map(p => (
            <div className="player-item selectable" key={p.id} onClick={() => handlePick(p.id)}>
              <div className="player-dot" style={{ background: "var(--red)" }} />
              <span className="player-name">{p.name}</span>
              <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>▶</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NightDoctorScreen({ state, myId }) {
  const { players, myRole, round } = state;
  const isDoctor = myRole === "doctor";
  const alivePlayers = players.filter(p => p.isAlive);

  const handleHeal = (targetId) => {
    getSocket().emit("doctor_pick", { targetId });
  };

  if (!isDoctor) {
    return (
      <div className="panel">
        <div className="card blackout">
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: "2rem", marginBottom: 12, opacity: 0.15 }}>🌑</div>
            <p style={{ color: "#1e1e22", fontSize: "0.9rem" }}>The city is asleep…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="card">
        <div className="phase-label">Night {round} — Doctor's Turn</div>
        <h2 style={{ color: "var(--doctor)", marginBottom: 6 }}>Choose Who to Heal</h2>
        <p style={{ marginBottom: 20, fontSize: "0.85rem" }}>The Mafia has made their move. Protect someone from death tonight.</p>
        <div className="player-list">
          {alivePlayers.map(p => (
            <div className="player-item selectable doctor-select" key={p.id} onClick={() => handleHeal(p.id)}>
              <div className="player-dot" style={{ background: "var(--doctor)" }} />
              <span className="player-name">{p.name}{p.id === myId ? " (you)" : ""}</span>
              <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>▶</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


function GameLogSidebar({ state }) {
  const { log } = state;
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  return (
    <div className="card chat-card" style={{ display: "flex", flexDirection: "column", height: "100%", maxHeight: "250px", padding: "20px" }}>
      <h3 style={{ marginBottom: 12 }}>Game Log</h3>
      <div className="chat-messages" style={{ flex: 1, overflowY: "auto", marginBottom: 12, paddingRight: 8, display: "flex", flexDirection: "column" }}>
        {log?.length === 0 ? (
          <div style={{ fontSize: "0.85rem", color: "var(--muted)", fontStyle: "italic" }}>No previous events yet.</div>
        ) : (
          log?.map((entry, i) => (
            <div key={i} style={{ marginBottom: 8, fontSize: "0.82rem", opacity: 0.85, borderLeft: "2px solid var(--border)", paddingLeft: 8 }}>
              {entry}
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

function ChatSidebar({ state, myId }) {
  const { chat, players } = state;
  const [msg, setMsg] = useState("");
  const chatEndRef = useRef(null);

  const me = players.find(p => p.id === myId);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const sendChat = (e) => {
    e.preventDefault();
    if (!msg.trim()) return;
    getSocket().emit("chat_message", { text: msg });
    setMsg("");
  };

  return (
    <div className="card chat-card" style={{ display: "flex", flexDirection: "column", height: "100%", maxHeight: "500px", padding: "20px" }}>
      <h3 style={{ marginBottom: 12 }}>Town Chat</h3>
      <div className="chat-messages" style={{ flex: 1, overflowY: "auto", marginBottom: 12, paddingRight: 8, display: "flex", flexDirection: "column" }}>
        {chat?.map((c, i) => (
          <div key={i} style={{ marginBottom: 8, fontSize: "0.85rem", opacity: c.isAlive ? 1 : 0.6, wordBreak: "break-word" }}>
            <span style={{ color: c.senderId === myId ? "var(--gold)" : c.isAlive ? "var(--white)" : "var(--muted)", fontWeight: "bold" }}>
              {c.name} {!c.isAlive && "(ghost)"}:
            </span>{" "}
            <span style={{ color: "var(--cream)" }}>{c.text}</span>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      {(me?.isAlive || state.phase === "gameover") ? (
        <form onSubmit={sendChat} style={{ display: "flex", gap: 8, marginTop: "auto" }}>
          <input value={msg} onChange={e => setMsg(e.target.value)} placeholder="Type a message..." style={{ padding: "8px 12px", fontSize: "0.85rem" }} maxLength={100} />
          <button type="submit" className="btn-secondary" style={{ padding: "8px 16px", width: "auto" }}>Send</button>
        </form>
      ) : (
        <div style={{ fontSize: "0.8rem", color: "var(--muted)", fontStyle: "italic", textAlign: "center", marginTop: "auto" }}>
          Ghosts cannot speak until game over.
        </div>
      )}
    </div>
  );
}

function DiscussionScreen({ state, myId }) {
  const { players, round, discussionEndTime, dayVotes } = state;
  const alivePlayers = players.filter((p) => p.isAlive);
  const me = players.find((p) => p.id === myId);
  const myVote = dayVotes?.[myId];

  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (!discussionEndTime) return;
    const updateTimer = () => {
      const remaining = Math.max(0, discussionEndTime - Date.now());
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setTimeLeft(`${m}:${s.toString().padStart(2, "0")}`);
    };
    updateTimer(); // Initial call
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [discussionEndTime]);

  const handleVote = (targetId) => {
    if (me?.isAlive) {
      getSocket().emit("day_vote", { targetId });
    }
  };

  const getVoteCount = (targetId) => {
    return Object.values(dayVotes || {}).filter(v => v === targetId).length;
  };

  const skipVotesCount = getVoteCount("skip");

  return (
    <div style={{ display: "flex", gap: "20px", width: "100%", maxWidth: "900px", flexWrap: "wrap", justifyContent: "center" }}>
      <div className="panel" style={{ flex: "1 1 500px", maxWidth: "520px" }}>
        <div className="card">
          <div className="phase-label">Day {round} — Discussion & Voting</div>
          <h2 style={{ marginBottom: 6 }}>Who is the Mafia?</h2>
          <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "var(--gold)", marginBottom: 16, textAlign: "center" }}>
            {timeLeft}
          </div>
          <p style={{ marginBottom: 20, fontSize: "0.85rem" }}>Click a player to vote for their execution. The most voted player will be eliminated.</p>
          
          <div className="divider"><span>alive players</span></div>
          <div className="player-list">
            {alivePlayers.map((p) => {
              const count = getVoteCount(p.id);
              return (
                <div 
                  className="player-item selectable" 
                  key={p.id} 
                  onClick={() => handleVote(p.id)}
                  style={{ 
                    borderColor: myVote === p.id ? 'var(--red)' : '',
                    background: myVote === p.id ? 'rgba(192, 57, 43, 0.1)' : ''
                  }}
                >
                  <div className="player-dot" />
                  <span className="player-name">{p.name}{p.id === myId ? " (you)" : ""}</span>
                  {count > 0 && <span style={{ fontSize: "0.75rem", color: "var(--red)", fontWeight: "bold", marginRight: 8 }}>{count} vote{count > 1 ? 's' : ''}</span>}
                </div>
              );
            })}
          </div>

          {me?.isAlive && (
            <button 
              className={myVote === "skip" ? "btn-ghost" : "btn-secondary"} 
              onClick={() => handleVote("skip")}
              style={{ marginTop: 20, borderColor: myVote === "skip" ? 'var(--gold)' : '' }}
            >
              {myVote === "skip" ? "Voted to Skip / Abstain" : "Vote to Skip / Abstain"} 
              <span style={{ marginLeft: 8, fontSize: "0.8rem", opacity: 0.8 }}>
                ({skipVotesCount}/{alivePlayers.length})
              </span>
            </button>
          )}
        </div>
      </div>
      <div className="panel" style={{ flex: "1 1 300px", maxWidth: "380px", display: "flex", flexDirection: "column", gap: "20px" }}>
        <GameLogSidebar state={state} />
        <ChatSidebar state={state} myId={myId} />
      </div>
    </div>
  );
}

function DayResultScreen({ state }) {
  const { dayResult, round } = state;

  return (
    <div className="panel" style={{ maxWidth: 520 }}>
      <div className="card">
        <div className="phase-label">Dusk — Round {round} Result</div>
        <h2 style={{ marginBottom: 16 }}>The Town Has Spoken</h2>

        {dayResult && (
          <div className={`notification ${dayResult.executedId ? "notif-red" : "notif-gold"}`}>
            {dayResult.executedId ? 
              `The town executed ${dayResult.executedName}. They were a ${dayResult.executedRole === 'mafia' ? 'Mafia' : dayResult.executedRole === 'doctor' ? 'Doctor' : 'Crew Member'}.` :
              "The town could not reach a decision, or a majority voted to abstain. Nobody was executed."
            }
          </div>
        )}

        <p style={{ textAlign: "center", fontSize: "0.8rem", marginTop: 12, fontStyle: "italic" }}>
          Night begins shortly…
        </p>
      </div>
    </div>
  );
}

function ResultScreen({ state, myId }) {
  const { nightResult, players, myRole, round, log } = state;
  const alivePlayers = players.filter(p => p.isAlive);
  const deadPlayers = players.filter(p => !p.isAlive);

  return (
    <div className="panel">
      <div className="card">
        <div className="phase-label">Dawn — Round {round} Result</div>
        <h2 style={{ marginBottom: 16 }}>The Night is Over</h2>

        {nightResult && (
          <>
            <div className={`notification ${nightResult.saved ? "notif-green" : "notif-red"}`}>
              {nightResult.nightMsg}
            </div>
            <div className="notification notif-gold">
              {nightResult.savedMsg}
            </div>
          </>
        )}

        <div className="divider"><span>survivors</span></div>
        <div className="player-list">
          {alivePlayers.map(p => (
            <div className="player-item" key={p.id}>
              <div className="player-dot" />
              <span className="player-name">{p.name}{p.id === myId ? " (you)" : ""}</span>
              {p.id === myId && <RoleBadge role={myRole} />}
            </div>
          ))}
          {deadPlayers.map(p => (
            <div className="player-item dead" key={p.id}>
              <div className="player-dot dead" />
              <span className="player-name">{p.name}</span>
              <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>eliminated</span>
            </div>
          ))}
        </div>

        <p style={{ textAlign: "center", fontSize: "0.8rem", marginTop: 12, fontStyle: "italic" }}>
          Next night begins shortly…
        </p>

        {log.length > 0 && (
          <>
            <div className="divider"><span>game log</span></div>
            <div className="game-log">
              {log.map((entry, i) => <div className="log-entry" key={i}>{entry}</div>)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GameOverScreen({ state, myId }) {
  const { winner, players, myRole, log } = state;
  const me = players.find(p => p.id === myId);
  const isHost = me?.isHost;

  const handlePlayAgain = () => {
    getSocket().emit("play_again");
  };

  const iWon = (winner === "mafia" && myRole === "mafia") || (winner === "crew" && myRole !== "mafia");

  return (
    <div className="panel">
      <div className="card winner-screen">
        <div className="phase-label">Game Over</div>
        <div style={{ fontSize: "3rem", marginBottom: 8 }}>{winner === "mafia" ? "🔫" : "⚖️"}</div>
        <div className={`winner-title ${winner === "mafia" ? "winner-mafia" : "winner-crew"}`}>
          {winner === "mafia" ? "Mafia Wins" : "Crew Wins"}
        </div>
        <p style={{ marginTop: 12, fontSize: "0.9rem" }}>
          {iWon ? "🏆 You are on the winning side!" : "💀 You lost this round."}
        </p>

        <div className="divider"><span>roles revealed</span></div>
        <div className="player-list" style={{ textAlign: "left" }}>
          {players.map(p => (
            <div className="player-item" key={p.id} style={{ opacity: p.isAlive ? 1 : 0.5 }}>
              <div className={`player-dot ${p.isAlive ? "" : "dead"}`} />
              <span className="player-name">{p.name}{p.id === myId ? " (you)" : ""}</span>
              <RoleBadge role={state.myRole && p.id === myId ? myRole : "crew"} />
            </div>
          ))}
        </div>

        {log.length > 0 && (
          <>
            <div className="divider"><span>game log</span></div>
            <div className="game-log">
              {log.map((entry, i) => <div className="log-entry" key={i}>{entry}</div>)}
            </div>
          </>
        )}

        {isHost && (
          <button className="btn-primary" onClick={handlePlayAgain} style={{ marginTop: 20 }}>
            Play Again
          </button>
        )}
        {!isHost && (
          <div className="wait-msg" style={{ marginTop: 12 }}>Waiting for host to start a new game…</div>
        )}
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("landing"); // landing | create | join | game
  const [gameState, setGameState] = useState(null);
  const myIdRef = useRef(null);

  useEffect(() => {
    const s = getSocket();

    s.on("connect", () => { myIdRef.current = s.id; });

    s.on("room_created", ({ roomId }) => {
      setScreen("game");
    });

    s.on("room_joined", ({ roomId }) => {
      setScreen("game");
    });

    s.on("room_update", (state) => {
      setGameState(state);
    });

    s.on("error", (e) => {
      console.error("Socket error:", e.message);
    });

    s.on("disconnect", () => {
      myIdRef.current = null;
    });

    return () => {
      s.off("connect");
      s.off("room_created");
      s.off("room_joined");
      s.off("room_update");
      s.off("error");
      s.off("disconnect");
    };
  }, []);

  const myId = myIdRef.current || getSocket().id;

  if (screen === "landing") return <div className="app"><LandingScreen onCreateRoom={() => setScreen("create")} onJoinRoom={() => setScreen("join")} /></div>;
  if (screen === "create") return <div className="app"><CreateRoomScreen onBack={() => setScreen("landing")} /></div>;
  if (screen === "join") return <div className="app"><JoinRoomScreen onBack={() => setScreen("landing")} /></div>;

  if (screen === "game" && gameState) {
    const phase = gameState.phase;
    const id = myId;

    return (
      <div className="app">
        {phase === "lobby" && <LobbyScreen state={gameState} myId={id} />}
        {phase === "role_reveal" && <RoleRevealScreen state={gameState} myId={id} />}
        {phase === "night_mafia" && <NightMafiaScreen state={gameState} myId={id} />}
        {phase === "night_doctor" && <NightDoctorScreen state={gameState} myId={id} />}
        {phase === "result" && <ResultScreen state={gameState} myId={id} />}
        {phase === "discussion" && <DiscussionScreen state={gameState} myId={id} />}
        {phase === "day_result" && <DayResultScreen state={gameState} myId={id} />}
        {phase === "gameover" && <GameOverScreen state={gameState} myId={id} />}
      </div>
    );
  }

  return (
    <div className="app">
      <div className="panel">
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: "2rem", marginBottom: 12 }}>🎭</div>
          <p>Connecting to server…</p>
        </div>
      </div>
    </div>
  );
}
