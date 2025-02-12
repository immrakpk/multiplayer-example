// server.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;
const GAME_WORLD_WIDTH = 1000;
const GAME_WORLD_HEIGHT = 1000;
const PLAYER_INITIAL_SIZE = 10;
const FOOD_RADIUS = 5;
const FOOD_COUNT = 50; // maintain 50 food particles

// In-memory data stores
let players = {};
let foods = [];

// Helper: Spawn a single food particle with random position & color
function spawnFood() {
  return {
    id: Math.random().toString(36).substr(2, 9),
    x: Math.random() * (GAME_WORLD_WIDTH - 2 * FOOD_RADIUS) + FOOD_RADIUS,
    y: Math.random() * (GAME_WORLD_HEIGHT - 2 * FOOD_RADIUS) + FOOD_RADIUS,
    color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')
  };
}

// Create initial food particles
function initFoods() {
  foods = [];
  for (let i = 0; i < FOOD_COUNT; i++) {
    foods.push(spawnFood());
  }
}
initFoods();

// Serve static files from the public folder
app.use(express.static('public'));

// Handle socket connections
io.on('connection', socket => {
  console.log('A user connected: ' + socket.id);

  // Client sends a guest name when joining the game
  socket.on('join', guestName => {
    const x = Math.random() * (GAME_WORLD_WIDTH - 2 * PLAYER_INITIAL_SIZE) + PLAYER_INITIAL_SIZE;
    const y = Math.random() * (GAME_WORLD_HEIGHT - 2 * PLAYER_INITIAL_SIZE) + PLAYER_INITIAL_SIZE;
    players[socket.id] = {
      id: socket.id,
      name: guestName || 'Guest',
      x,
      y,
      size: PLAYER_INITIAL_SIZE,
      dead: false
    };
    // Update lobby for everyone
    io.emit('playerList', Object.values(players));
  });

  // Receive movement updates from the client
  socket.on('move', data => {
    const player = players[socket.id];
    if (player && !player.dead) {
      // Update the player's position with the new x and y values from the client
      player.x = data.x;
      player.y = data.y;
    }
  });

  // Handle disconnects
  socket.on('disconnect', () => {
    console.log('User disconnected: ' + socket.id);
    delete players[socket.id];
    io.emit('playerList', Object.values(players));
  });
});

// The main game loop: runs ~30 FPS (every 33ms)
function gameLoop() {
  // Loop over each player to check collisions
  for (let id in players) {
    let player = players[id];
    if (player.dead) continue;

    // Boundary detection: if the player touches the boundary, they die
    if (
      player.x - player.size <= 0 ||
      player.x + player.size >= GAME_WORLD_WIDTH ||
      player.y - player.size <= 0 ||
      player.y + player.size >= GAME_WORLD_HEIGHT
    ) {
      player.dead = true;
      io.to(id).emit('gameOver', { score: player.size });
      continue;
    }

    // Collision detection: check if the player collects any food
    for (let i = foods.length - 1; i >= 0; i--) {
      const food = foods[i];
      const dx = player.x - food.x;
      const dy = player.y - food.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < player.size + FOOD_RADIUS) {
        // Increase player's size and remove the food
        player.size += 1;
        foods.splice(i, 1);
        // Spawn a new food particle to maintain the count
        foods.push(spawnFood());
      }
    }
  }
  
  // Broadcast the latest game state to all clients
  io.emit('gameState', {
    players: Object.values(players),
    foods,
    world: { width: GAME_WORLD_WIDTH, height: GAME_WORLD_HEIGHT }
  });
}

// Run the game loop repeatedly
setInterval(gameLoop, 33);

http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
