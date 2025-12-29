const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {};

// --------------------
// Deck helpers
// --------------------
function createDeck() {
  const colors = ["red", "yellow", "green", "blue"];
  const values = ["0","1","2","3","4","5","6","7","8","9","skip","reverse","draw2"];
  const deck = [];

  for (const color of colors) {
    for (const value of values) {
      deck.push({ color, value });
      if (value !== "0") deck.push({ color, value });
    }
  }

  for (let i = 0; i < 4; i++) {
    deck.push({ color: "wild", value: "wild" });
    deck.push({ color: "wild", value: "wild4" });
  }

  return shuffle(deck);
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function dealCards(room, count = 7) {
  room.players.forEach(player => {
    player.hand = [];
    for (let i = 0; i < count; i++) {
      player.hand.push(room.deck.pop());
    }
  });
}

// --------------------
// Socket logic
// --------------------
io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // JOIN ROOM
  socket.on("joinRoom", (roomId, playerName) => {
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        started: false,
        deck: []
      };
    }

    const room = rooms[roomId];

    if (room.started) {
      socket.emit("gameAlreadyStarted");
      return;
    }

    if (room.players.some(p => p.id === socket.id)) {
      socket.emit("alreadyJoined");
      return;
    }

    if (room.players.length >= 6) {
      socket.emit("roomFull");
      return;
    }

    const isHost = room.players.length === 0;

    room.players.push({
      id: socket.id,
      name: playerName,
      host: isHost,
      hand: []
    });

    socket.join(roomId);
    io.to(roomId).emit("playerList", room.players);
    console.log(`Room ${roomId}: ${playerName} joined (${room.players.length}/6)`);
  });

  // START GAME
  socket.on("startGame", (roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.players.length < 2) {
      socket.emit("notEnoughPlayers");
      return;
    }

    const host = room.players.find(p => p.host);
    if (!host || host.id !== socket.id) return;

    room.started = true;
    room.deck = createDeck();

    dealCards(room);

    // Send PRIVATE hands
    room.players.forEach(player => {
      io.to(player.id).emit("yourHand", player.hand);
    });

    // Send PUBLIC state
    io.to(roomId).emit("gameState", {
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        handCount: p.hand.length,
        host: p.host
      }))
    });
    console.log(`--- DEALING CARDS ---`);
room.players.forEach(p => {
  console.log(
    `${p.name} received ${p.hand.length} cards`
  );
});
console.log(`Deck remaining: ${room.deck.length}`);
console.log(`---------------------`);


    console.log(
      `Game started in room ${roomId} | Players: ${room.players.length} | Deck left: ${room.deck.length}`
    );
    

    io.to(roomId).emit("gameStarted");
  });
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
