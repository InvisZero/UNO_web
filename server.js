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

function drawFirstCard(room) {
  let card;
  do {
    card = room.deck.pop();
  } while (
    card.color === "wild" ||
    card.value === "skip" ||
    card.value === "reverse" ||
    card.value === "draw2"
  );

  room.discardPile = [card];
  return card;
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
        deck: [],
        discardPile: []
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

    console.log(`Room ${roomId}: ${playerName} joined (${room.players.length}/6)`);

    io.to(roomId).emit("playerList", room.players);
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

    console.log(`--- DEALING CARDS ---`);
    room.players.forEach(p => {
      console.log(`${p.name} received ${p.hand.length} cards`);
    });

    // Send private hands
    room.players.forEach(player => {
      io.to(player.id).emit("yourHand", player.hand);
    });

    // Draw first discard card
    const firstCard = drawFirstCard(room);

    console.log(`First card: ${firstCard.color} ${firstCard.value}`);
    console.log(`Deck left: ${room.deck.length}`);
    console.log(`--------------------`);

    // Public game state
    io.to(roomId).emit("gameState", {
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        handCount: p.hand.length,
        host: p.host
      })),
      topCard: firstCard
    });

    io.to(roomId).emit("firstCard", firstCard);
    io.to(roomId).emit("gameStarted");
  });
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
