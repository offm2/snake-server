const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// Create HTTP server
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Snake server running");
});

// Attach WebSocket server to same HTTP server
const wss = new WebSocket.Server({ server })

// Game state
const gameState = {
  players: {},
  food: { x: 0, y: 0 },
  walls: [],
  powerups: [],
  lastFoodSpawn: 0,
  powerupSpawnTimer: 0
};

// Game constants
const WIDTH = 800;
const HEIGHT = 600;
const GRID_SIZE = 15;

// Directions
const UP = { x: 0, y: -1 };
const DOWN = { x: 0, y: 1 };
const LEFT = { x: -1, y: 0 };
const RIGHT = { x: 1, y: 0 };

// Player colors
const COLORS = ['#FF5252', '#4CAF50', '#2196F3', '#FFEB3B', '#9C27B0', '#FF9800'];

// Initialize game
function initGame() {
  gameState.food = generateFood();
  gameState.walls = createWalls(1);
  gameState.lastFoodSpawn = Date.now() / 1000;
  gameState.powerupSpawnTimer = Date.now() / 1000;
}

// Generate food position
function generateFood() {
  const gridWidth = Math.floor(WIDTH / GRID_SIZE);
  const gridHeight = Math.floor(HEIGHT / GRID_SIZE);
  
  while (true) {
    const pos = {
      x: Math.floor(Math.random() * (gridWidth - 2)) + 1,
      y: Math.floor(Math.random() * (gridHeight - 2)) + 1
    };
    
    // Check if position is valid
    const isWall = gameState.walls.some(wall => wall.x === pos.x && wall.y === pos.y);
    const isPlayer = Object.values(gameState.players).some(player => 
      player.body.some(segment => segment.x === pos.x && segment.y === pos.y)
    );
    const isPowerup = gameState.powerups.some(p => p.pos.x === pos.x && p.pos.y === pos.y && p.isActive());
    
    if (!isWall && !isPlayer && !isPowerup) {
      return pos;
    }
  }
}

// Create walls
function createWalls(level) {
  const walls = [];
  const gridWidth = Math.floor(WIDTH / GRID_SIZE);
  const gridHeight = Math.floor(HEIGHT / GRID_SIZE);
  
  if (level >= 2) {
    // Center wall
    const centerY = Math.floor(gridHeight / 2);
    for (let x = Math.floor(gridWidth / 2) - 8; x < Math.floor(gridWidth / 2) + 8; x++) {
      if (x % 4 !== 0) {
        walls.push({ x, y: centerY });
      }
    }
  }
  
  if (level >= 3) {
    // Borders
    for (let x = 0; x < gridWidth; x++) {
      if (x % 8 !== 0) {
        walls.push({ x, y: 0 });
        walls.push({ x, y: gridHeight - 1 });
      }
    }
    for (let y = 0; y < gridHeight; y++) {
      if (y % 8 !== 0) {
        walls.push({ x: 0, y });
        walls.push({ x: gridWidth - 1, y });
      }
    }
  }
  
  if (level === 5) {
    // Maze walls
    for (let x = 5; x < gridWidth - 5; x += 10) {
      for (let y = 5; y < gridHeight - 5; y += 8) {
        if (Math.random() > 0.5) {
          walls.push({ x, y });
        }
      }
    }
  }
  
  return walls;
}

// Get a random spawn position for a new player
function getSpawnPosition() {
  const gridWidth = Math.floor(WIDTH / GRID_SIZE);
  const gridHeight = Math.floor(HEIGHT / GRID_SIZE);
  
  // Try different quadrants to spread players out
  const quadrants = [
    { x: 5, y: 5 }, // Top-left
    { x: gridWidth - 6, y: 5 }, // Top-right
    { x: 5, y: gridHeight - 6 }, // Bottom-left
    { x: gridWidth - 6, y: gridHeight - 6 } // Bottom-right
  ];
  
  for (const quadrant of quadrants) {
    let valid = true;
    
    // Check if position is valid
    const isWall = gameState.walls.some(wall => 
      wall.x === quadrant.x && wall.y === quadrant.y
    );
    
    const isPlayer = Object.values(gameState.players).some(player => 
      player.body.some(segment => 
        segment.x === quadrant.x && segment.y === quadrant.y
      )
    );
    
    if (!isWall && !isPlayer) {
      return quadrant;
    }
  }
  
  // If all quadrants are occupied, find any random position
  while (true) {
    const pos = {
      x: Math.floor(Math.random() * (gridWidth - 10)) + 5,
      y: Math.floor(Math.random() * (gridHeight - 10)) + 5
    };
    
    const isWall = gameState.walls.some(wall => wall.x === pos.x && wall.y === pos.y);
    const isPlayer = Object.values(gameState.players).some(player => 
      player.body.some(segment => segment.x === pos.x && segment.y === pos.y)
    );
    
    if (!isWall && !isPlayer) {
      return pos;
    }
  }
}

// Check collisions
function checkCollisions() {
  const players = Object.values(gameState.players);
  
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    if (!player.alive) continue;
    
    const head = player.body[0];
    
    // Wall collision
    const hitWall = gameState.walls.some(wall => wall.x === head.x && wall.y === head.y);
    if (hitWall && !player.invincible) {
      player.alive = false;
      continue;
    }
    
    // Self collision
    const selfCollision = player.body.slice(1).some(segment => 
      segment.x === head.x && segment.y === head.y
    );
    if (selfCollision && !player.invincible) {
      player.alive = false;
      continue;
    }
    
    // Collision with other players
    for (let j = 0; j < players.length; j++) {
      if (i === j) continue;
      
      const otherPlayer = players[j];
      const headInOtherPlayer = otherPlayer.body.some(segment => 
        segment.x === head.x && segment.y === head.y
      );
      
      if (headInOtherPlayer) {
        if (player.invincible && otherPlayer.invincible) {
          // Both invincible - no effect
        } else if (player.invincible) {
          otherPlayer.alive = false;
        } else if (otherPlayer.invincible) {
          player.alive = false;
        } else {
          // Head-to-head collision
          if (player.body.length > otherPlayer.body.length) {
            otherPlayer.alive = false;
            player.score += 500;
          } else if (player.body.length < otherPlayer.body.length) {
            player.alive = false;
            otherPlayer.score += 500;
          } else {
            player.alive = false;
            otherPlayer.alive = false;
          }
        }
        break;
      }
    }
  }
}

// Game update loop
function gameUpdate() {
  const currentTime = Date.now() / 1000;
  
  // Spawn powerups occasionally
  if (currentTime - gameState.powerupSpawnTimer > 15 && Math.random() > 0.7) {
    gameState.powerupSpawnTimer = currentTime;
    const pos = generateFood();
    gameState.powerups.push(new PowerUp(pos));
  }
  
  // Remove expired powerups
  gameState.powerups = gameState.powerups.filter(p => p.isActive());
  
  // Move players
  Object.values(gameState.players).forEach(player => {
    if (player.alive) {
      player.move();
    }
  });
  
  // Check collisions
  checkCollisions();
  
  // Check food collision
  Object.values(gameState.players).forEach(player => {
    if (player.alive && 
        player.body[0].x === gameState.food.x && 
        player.body[0].y === gameState.food.y) {
      player.grow();
      gameState.food = generateFood();
      gameState.lastFoodSpawn = currentTime;
    }
  });
  
  // Check powerup collision
  for (let i = gameState.powerups.length - 1; i >= 0; i--) {
    const powerup = gameState.powerups[i];
    for (const player of Object.values(gameState.players)) {
      if (player.alive && 
          player.body[0].x === powerup.pos.x && 
          player.body[0].y === powerup.pos.y) {
        switch (powerup.type) {
          case "food":
            player.grow();
            player.grow();
            break;
          case "speed":
            player.activateSpeedBoost();
            break;
          case "invincible":
            player.activateInvincibility();
            break;
        }
        gameState.powerups.splice(i, 1);
        break;
      }
    }
  }
}

// PowerUp class
class PowerUp {
  constructor(pos = null) {
    const types = ["food", "speed", "invincible"];
    this.type = types[Math.floor(Math.random() * types.length)];
    this.pos = pos || { x: 0, y: 0 };
    this.spawnTime = Date.now() / 1000;
    this.duration = 8;
  }
  
  getColor() {
    const colors = {
      "food": "#ff0",
      "speed": "#0ff",
      "invincible": "#ffa500"
    };
    return colors[this.type];
  }
  
  isActive() {
    return (Date.now() / 1000 - this.spawnTime) < this.duration;
  }
}

// Player class
class Player {
  constructor(id, name, color, startPos, controls) {
    this.id = id;
    this.name = name;
    this.body = [startPos];
    this.direction = RIGHT;
    this.alive = true;
    this.color = color;
    this.score = 0;
    this.speedBoost = false;
    this.boostEndTime = 0;
    this.invincible = false;
    this.invincibleEndTime = 0;
    this.controls = controls;
  }

  move() {
    if (!this.alive) return;

    if (this.speedBoost && Date.now() / 1000 > this.boostEndTime) {
      this.speedBoost = false;
    }

    if (this.invincible && Date.now() / 1000 > this.invincibleEndTime) {
      this.invincible = false;
    }

    const head = this.body[0];
    const newHead = {
      x: (head.x + this.direction.x + Math.floor(WIDTH / GRID_SIZE)) % Math.floor(WIDTH / GRID_SIZE),
      y: (head.y + this.direction.y + Math.floor(HEIGHT / GRID_SIZE)) % Math.floor(HEIGHT / GRID_SIZE)
    };

    this.body.unshift(newHead);
    this.body.pop();
  }

  grow() {
    if (this.alive) {
      this.body.push({...this.body[this.body.length - 1]});
      this.score += 100;
    }
  }

  changeDirection(newDirection) {
    if (newDirection.x * -1 !== this.direction.x || newDirection.y * -1 !== this.direction.y) {
      this.direction = newDirection;
    }
  }

  activateSpeedBoost(duration = 5) {
    this.speedBoost = true;
    this.boostEndTime = Date.now() / 1000 + duration;
  }

  activateInvincibility(duration = 3) {
    this.invincible = true;
    this.invincibleEndTime = Date.now() / 1000 + duration;
  }
}

// WebSocket server
wss.on('connection', (ws) => {
  console.log('New client connected');
  
  // Assign a unique ID to the player
  const playerId = Math.random().toString(36).substr(2, 9);
  let playerName = `Player ${Object.keys(gameState.players).length + 1}`;
  const color = COLORS[Object.keys(gameState.players).length % COLORS.length];
  
  // Create a new player
  const spawnPos = getSpawnPosition();
  const newPlayer = new Player(
    playerId,
    playerName,
    color,
    spawnPos,
    {}
  );
  
  gameState.players[playerId] = newPlayer;
  
  // Send initial game state to the new player
  ws.send(JSON.stringify({
    type: 'init',
    playerId,
    playerName,
    color,
    gameState
  }));
  
  // Broadcast new player to others
  broadcast({
    type: 'playerJoined',
    playerId,
    playerName,
    color,
    position: spawnPos
  });
  
  // Handle messages from client
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    
    switch (data.type) {
      case 'setName':
        playerName = data.name.substring(0, 15);
        gameState.players[playerId].name = playerName;
        broadcast({
          type: 'playerRenamed',
          playerId,
          playerName
        });
        break;
        
      case 'directionChange':
        if (gameState.players[playerId]) {
          gameState.players[playerId].changeDirection(data.direction);
        }
        break;
    }
  });
  
  // Handle client disconnection
  ws.on('close', () => {
    console.log('Client disconnected');
    delete gameState.players[playerId];
    broadcast({
      type: 'playerLeft',
      playerId
    });
  });
});

// Broadcast to all clients
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Start game loop
initGame();
setInterval(() => {
  gameUpdate();
  broadcast({
    type: 'gameUpdate',
    gameState
  });
}, 1000 / 10); // 10 FPS

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
