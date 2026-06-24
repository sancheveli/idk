import { createServer } from 'node:http';
import { Server } from 'socket.io';

const port = Number(process.env.SOCKET_PORT || process.env.PORT || 3001);
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const maxPlayersPerRoom = 5;
const movementTickMs = 80;
const eventIntervalMs = 7000;
const loweredTowerDurationMs = 30000;
const hiddenTowerUntilRoundEnd = Number.MAX_SAFE_INTEGER;
const lobbyDurationMs = 10000;
const reconnectGraceMs = 30000;
const freezeDurationMs = 7000;
const voidFallGraceMs = 1000;
const swordDamage = 5;
const swordCooldownMs = 2000;
const swordRange = 86;
const pizzaHealAmount = 50;
const doomsdayDamage = 60;
const baseStep = 14;
const rapidStep = 24;
const towerAirStep = 32;
const towerMaxAirborneMs = 1200;
const towerLandingY = 291.5;
const loweredTowerOffset = 74;
const towerEdgeInset = 10;
const towerFootSupportMargin = 18;
const towerPlatforms = [
  { left: 52.5, right: 202.5 },
  { left: 277.5, right: 427.5 },
  { left: 502.5, right: 652.5 },
  { left: 727.5, right: 877.5 },
  { left: 952.5, right: 1102.5 },
];
const towerEvents = [
  'Someone gets a sword',
  'Two towers are lowered',
  'Someones tower will disappear',
  'A bomb will detonate soon',
  'everyday im shuffling',
  'PIZZA DELIVERY',
  'SURVIVE THE DOOMSDAY',
  "A warp tool is teleporting into someone's hands",
  'Freeze',
  'Someone ate too many whoppers',
  'Deadly missles are coming for you!',
  'OH GREAT HEAVENS',
];
const defaultDecorations = {
  roofColor: '#facc15',
  bodyColor: '#ef4444',
  windowColor: '#bae6fd',
  chairEnabled: false,
  plantEnabled: false,
  updatedBy: 'server',
  updatedAt: Date.now(),
};

function getBaseNickname(name) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) return 'Player';
  if (trimmedName.length > 15 || isInappropriateUsername(trimmedName)) return 'Noob';
  return trimmedName;
}

function normalizeUsernameForModeration(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[@]/g, 'a')
    .replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z]/g, '');
}

function isInappropriateUsername(name) {
  const normalizedName = normalizeUsernameForModeration(name);
  const blockedWords = [
    'asshole',
    'bastard',
    'bitch',
    'cunt',
    'dick',
    'fag',
    'fuck',
    'hitler',
    'kike',
    'nazi',
    'nigger',
    'nigga',
    'penis',
    'pussy',
    'retard',
    'shit',
    'slut',
    'whore',
  ];

  return blockedWords.some((word) => normalizedName.includes(word));
}

function getUsedNicknames(clientId) {
  return new Set(
    Array.from(rooms.values()).flatMap((room) =>
      Array.from(room.players.values())
        .filter((player) => player.clientId !== clientId)
        .map((player) => player.nickname),
    ),
  );
}

function getNextGlobalNoobName(usedNames) {
  if (!usedNames.has('Noob')) return 'Noob';

  let suffix = 2;
  while (usedNames.has(`Noob${suffix}`)) suffix += 1;
  return `Noob${suffix}`;
}

function getUniqueNickname(clientId, requestedName) {
  const baseName = getBaseNickname(requestedName);
  const usedNames = getUsedNicknames(clientId);

  if (!usedNames.has(baseName)) return baseName;
  return getNextGlobalNoobName(usedNames);
}

function sanitizeDecorations(value, fallback) {
  return {
    roofColor: String(value?.roofColor || fallback.roofColor).slice(0, 24),
    bodyColor: String(value?.bodyColor || fallback.bodyColor).slice(0, 24),
    windowColor: String(value?.windowColor || fallback.windowColor).slice(0, 24),
    chairEnabled: Boolean(value?.chairEnabled),
    plantEnabled: Boolean(value?.plantEnabled),
    updatedBy: fallback.updatedBy || 'server',
    updatedAt: Date.now(),
  };
}

const httpServer = createServer((request, response) => {
  const path = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;

  if (path === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, service: 'terrifying-towering-socket' }));
    return;
  }

  if (path.startsWith('/socket.io/')) return;

  response.writeHead(404, { 'content-type': 'text/plain' });
  response.end('Not found');
});
const io = new Server(httpServer, {
  cors: {
    origin: clientOrigin,
    methods: ['GET', 'POST'],
  },
});

const rooms = new Map();
const clientRooms = new Map();
let nextRoomNumber = 1;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createRoom() {
  const now = Date.now();
  const room = {
    id: `tower-${nextRoomNumber}`,
    players: new Map(),
    phase: 'lobby',
    decorations: { ...defaultDecorations, updatedAt: now },
    currentEvent: {
      id: `waiting-${now}`,
      message: 'Waiting for next round...',
      selectedAt: now,
      slot: 0,
    },
    eventSlot: 0,
    roundStartedAt: now,
    lobbyEndsAt: now + lobbyDurationMs,
    nextEventAt: now + lobbyDurationMs,
    roundPlayerCount: 0,
    winnerId: '',
    winnerName: '',
    usedDoomsday: false,
    loweredTowers: [],
    hiddenTowers: [],
    bombs: [],
    explosions: [],
    doomsdayStrikes: [],
    damagedDoomsdayStrikes: new Set(),
    missiles: [],
  };

  nextRoomNumber += 1;
  rooms.set(room.id, room);
  return room;
}

function getConnectedPlayers(room) {
  return Array.from(room.players.values()).filter((player) => player.connected);
}

function resetPlayerRoundState(player, now = Date.now()) {
  player.hp = 100;
  player.hasSword = false;
  player.hasPizza = false;
  player.hasWarp = false;
  player.equippedItem = 'sword';
  player.frozenUntil = 0;
  player.isFat = false;
  player.fallingUntil = 0;
  player.airborneStartedAt = 0;
  player.rapidUntil = 0;
  player.lastSwordAt = 0;
  player.input = { left: false, right: false, airborne: false };
  player.updatedAt = now;
}

function clearRoomRoundEffects(room) {
  room.usedDoomsday = false;
  room.loweredTowers = [];
  room.hiddenTowers = [];
  room.bombs = [];
  room.explosions = [];
  room.doomsdayStrikes = [];
  room.damagedDoomsdayStrikes = new Set();
  room.missiles = [];
}

function getActivePlayers(room) {
  return getConnectedPlayers(room);
}

function getRoomSocketCount(room) {
  return io.sockets.adapter.rooms.get(room.id)?.size ?? 0;
}

function getActualConnectedPlayerCount(room) {
  return getRoomSocketCount(room);
}

function roomHasSockets(room) {
  return getActualConnectedPlayerCount(room) > 0;
}

function pauseEmptyRoom(room, now = Date.now()) {
  for (const player of room.players.values()) {
    player.connected = false;
    player.input = { left: false, right: false, airborne: false };
    if (!player.disconnectedAt) player.disconnectedAt = now;
  }

  room.roundStartedAt = now;
  room.phase = 'lobby';
  room.lobbyEndsAt = now + lobbyDurationMs;
  room.nextEventAt = room.lobbyEndsAt;
  room.winnerId = '';
  room.winnerName = '';
  clearRoomRoundEffects(room);
  room.currentEvent = {
    id: `waiting-${room.id}-${now}`,
    message: 'Waiting for next round...',
    selectedAt: now,
    slot: room.eventSlot,
  };

  for (const player of room.players.values()) {
    resetPlayerRoundState(player, now);
  }
}

function getReservablePlayers(room) {
  const now = Date.now();
  return Array.from(room.players.values()).filter((player) => player.connected || now - player.disconnectedAt < reconnectGraceMs);
}

function getReportedPlayerCount(room) {
  return getReservablePlayers(room).length;
}

function clearDisconnectedRoom(room, now = Date.now()) {
  for (const clientId of room.players.keys()) {
    if (clientRooms.get(clientId) === room.id) clientRooms.delete(clientId);
  }
  room.players.clear();
  pauseEmptyRoom(room, now);
}

function logMatchmakingDecision(room, decision, clientId) {
  console.log('[tower:matchmaking]', {
    roomId: room.id,
    serverId: room.id,
    reportedPlayerCount: getReportedPlayerCount(room),
    actualConnectedPlayerCount: getActualConnectedPlayerCount(room),
    clientId,
    decision,
  });
}

function getRoomForClient(clientId) {
  const existingRoomId = clientRooms.get(clientId);
  const existingRoom = existingRoomId ? rooms.get(existingRoomId) : null;
  if (existingRoom?.players.has(clientId)) {
    if (roomHasSockets(existingRoom)) {
      logMatchmakingDecision(existingRoom, 'reused existing client room', clientId);
      return existingRoom;
    }
    clearDisconnectedRoom(existingRoom);
    logMatchmakingDecision(existingRoom, 'cleared empty existing client room', clientId);
  }

  for (const room of rooms.values()) {
    if (!roomHasSockets(room)) {
      clearDisconnectedRoom(room);
    }
  }

  for (const room of rooms.values()) {
    if (getActualConnectedPlayerCount(room) < maxPlayersPerRoom) {
      logMatchmakingDecision(room, roomHasSockets(room) ? 'selected existing room' : 'reused empty room', clientId);
      return room;
    }
  }

  const room = createRoom();
  logMatchmakingDecision(room, 'created new room', clientId);
  return room;
}

function getSpawnPosition(slot = 0) {
  const platform = towerPlatforms[slot % towerPlatforms.length] || towerPlatforms[0];
  return {
    x: (platform.left + platform.right) / 2,
    y: towerLandingY,
  };
}

function getNextOpenSlot(room, clientId) {
  const usedSlots = new Set(
    Array.from(room.players.values())
      .filter((player) => player.connected && player.clientId !== clientId)
      .map((player) => player.slot),
  );

  for (let slot = 0; slot < maxPlayersPerRoom; slot += 1) {
    if (!usedSlots.has(slot)) return slot;
  }

  return 0;
}

function getMovementBounds() {
  return {
    minX: towerPlatforms[0].left + towerEdgeInset,
    maxX: towerPlatforms[towerPlatforms.length - 1].right - towerEdgeInset,
    minY: towerLandingY,
    maxY: towerLandingY + loweredTowerOffset,
  };
}

function getActivePlatformSlots(room) {
  const hiddenSlots = new Set(room.hiddenTowers.map((effect) => effect.slot));
  return towerPlatforms
    .map((platform, slot) => ({ platform, slot }))
    .filter(({ slot }) => !hiddenSlots.has(slot));
}

function getPlatformLandingY(room, slot) {
  return room.loweredTowers.some((effect) => effect.slot === slot) ? towerLandingY + loweredTowerOffset : towerLandingY;
}

function getLandingAt(room, position) {
  const matchingPlatforms = getActivePlatformSlots(room)
    .filter(({ platform }) => position.x >= platform.left + towerEdgeInset - towerFootSupportMargin && position.x <= platform.right - towerEdgeInset + towerFootSupportMargin)
    .map((activePlatform) => ({
      ...activePlatform,
      landingY: getPlatformLandingY(room, activePlatform.slot),
    }))
    .sort((first, second) => Math.abs(position.y - first.landingY) - Math.abs(position.y - second.landingY));
  const activePlatform = matchingPlatforms[0];
  if (!activePlatform) return null;

  return {
    x: clamp(position.x, activePlatform.platform.left + towerEdgeInset, activePlatform.platform.right - towerEdgeInset),
    y: activePlatform.landingY,
    slot: activePlatform.slot,
  };
}

function isOnPlatform(room, position) {
  const landing = getLandingAt(room, position);
  return Boolean(landing && Math.abs(position.y - landing.y) <= 1);
}

function playerIsOnTowerSlot(room, player, slot) {
  if (player.input?.airborne) return false;
  const landing = getLandingAt(room, player.position);
  return Boolean(landing && landing.slot === slot && Math.abs(player.position.y - landing.y) <= 1);
}

function serializePlayer(player) {
  return {
    clientId: player.clientId,
    userId: player.userId,
    nickname: player.nickname,
    position: player.position,
    direction: player.direction,
    connected: player.connected,
    updatedAt: player.updatedAt,
    decorations: player.decorations,
    slot: player.slot,
    status: player.status,
    hp: player.hp,
    hasSword: player.hasSword,
    hasPizza: player.hasPizza,
    hasWarp: player.hasWarp,
    equippedItem: player.equippedItem || 'sword',
    airborne: Boolean(player.input?.airborne),
    falling: Boolean(player.fallingUntil && Date.now() < player.fallingUntil),
    frozenUntil: player.frozenUntil,
    isFat: player.isFat,
  };
}

function snapshot(room) {
  const now = Date.now();

  return {
    roomId: room.id,
    phase: room.phase,
    players: getConnectedPlayers(room).map(serializePlayer),
    decorations: room.decorations,
    currentEvent: room.currentEvent,
    roundStartedAt: room.roundStartedAt,
    nextEventAt: room.nextEventAt,
    eventSlot: room.eventSlot,
    winnerId: room.winnerId,
    winnerName: room.winnerName,
    effects: {
      loweredTowers: room.loweredTowers,
      hiddenTowers: room.hiddenTowers,
      bombs: room.bombs,
      explosions: room.explosions,
      doomsdayStrikes: room.doomsdayStrikes,
      missiles: room.missiles,
    },
    activePlayerCount: getActualConnectedPlayerCount(room),
    maxPlayers: maxPlayersPerRoom,
    serverTime: now,
  };
}

function broadcastSnapshot(room) {
  io.to(room.id).emit('tower:snapshot', snapshot(room));
}

function chooseServerEvent(room) {
  if (!roomHasSockets(room)) return;
  if (room.phase !== 'arena') return;

  const now = Date.now();
  room.eventSlot += 1;
  let message = towerEvents[(room.eventSlot - 1) % towerEvents.length];
  if (message === 'SURVIVE THE DOOMSDAY' && room.usedDoomsday) {
    message = 'OH GREAT HEAVENS';
  }
  room.currentEvent = {
    id: `${room.id}-${now}-${room.eventSlot}`,
    message,
    selectedAt: now,
    slot: room.eventSlot,
  };
  room.nextEventAt = now + eventIntervalMs;
  applyTowerEvent(room, message, now);

  io.to(room.id).emit('tower:event', room.currentEvent);
  broadcastSnapshot(room);
}

function getAlivePlayers(room) {
  return Array.from(room.players.values()).filter((player) => player.status === 'alive' && player.connected);
}

function hashSeed(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed) {
  let state = hashSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function getRandomItems(items, count, seed = Date.now()) {
  const random = createSeededRandom(seed);
  return [...items]
    .map((item) => ({ item, sort: random() }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, Math.max(0, count))
    .map(({ item }) => item);
}

function getEventSeed(room, now, context) {
  return `${room.id}:${room.eventSlot}:${now}:${context}`;
}

function chooseTowerSlots(room, count, now, context, slots = [0, 1, 2, 3, 4]) {
  return getRandomItems(slots, count, getEventSeed(room, now, context));
}

function chooseAlivePlayers(room, count, now, context) {
  return getRandomItems(getAlivePlayers(room), count, getEventSeed(room, now, context));
}

function damagePlayer(player, amount, room) {
  if (!player || player.status !== 'alive') return;
  player.hp = Math.max(0, (player.hp ?? 100) - amount);
  if (player.hp <= 0) {
    player.status = 'waiting';
    player.input = { left: false, right: false, airborne: false };
  }
  player.updatedAt = Date.now();
  if (room) checkRoundEnd(room);
}

function applyTowerEvent(room, message, now = Date.now()) {
  const alivePlayers = getAlivePlayers(room);
  if (alivePlayers.length === 0) return;

  if (message === 'Someone gets a sword') {
    const player = chooseAlivePlayers(room, 1, now, 'sword')[0];
    if (player) player.hasSword = true;
    return;
  }

  if (message === 'Two towers are lowered') {
    room.loweredTowers = chooseTowerSlots(room, 2, now, 'lowered-towers').map((slot) => ({ slot, until: now + loweredTowerDurationMs }));
    return;
  }

  if (message === 'Someones tower will disappear') {
    const hiddenSlots = new Set(room.hiddenTowers.map((effect) => effect.slot));
    const availableSlots = [0, 1, 2, 3, 4].filter((slot) => !hiddenSlots.has(slot));
    const nextSlot = chooseTowerSlots(room, 1, now, 'hidden-tower', availableSlots.length > 0 ? availableSlots : [0, 1, 2, 3, 4])[0];
    if (nextSlot === undefined) return;
    room.hiddenTowers = [...room.hiddenTowers.filter((effect) => effect.slot !== nextSlot), { slot: nextSlot, until: hiddenTowerUntilRoundEnd }];
    return;
  }

  if (message === 'A bomb will detonate soon') {
    const slot = chooseTowerSlots(room, 1, now, 'bomb')[0];
    if (slot === undefined) return;
    const spawn = getSpawnPosition(slot);
    room.bombs.push({ id: `bomb-${now}`, slot, x: spawn.x, y: spawn.y - 72, spawnedAt: now, explodesAt: now + 30000 });
    return;
  }

  if (message === 'everyday im shuffling') {
    const positions = alivePlayers.map((player) => player.position);
    const shuffled = getRandomItems(positions, positions.length, getEventSeed(room, now, 'shuffle'));
    alivePlayers.forEach((player, index) => {
      player.position = shuffled[index] || player.position;
      player.updatedAt = now;
    });
    return;
  }

  if (message === 'PIZZA DELIVERY') {
    alivePlayers.forEach((player) => {
      player.hasPizza = true;
    });
    return;
  }

  if (message === 'SURVIVE THE DOOMSDAY') {
    room.usedDoomsday = true;
    const slots = chooseTowerSlots(room, 2, now, 'doomsday');
    if (slots.length === 0) return;
    room.doomsdayStrikes.push(
      { id: `tower-doom-${now}-1`, slot: slots[0], warningAt: now, hitAt: now + 3000, endsAt: now + 3900 },
      { id: `tower-doom-${now}-2`, slot: slots[1] ?? slots[0], warningAt: now + 3000, hitAt: now + 6000, endsAt: now + 6900 },
    );
    return;
  }

  if (message === "A warp tool is teleporting into someone's hands") {
    const player = chooseAlivePlayers(room, 1, now, 'warp')[0];
    if (player) player.hasWarp = true;
    return;
  }

  if (message === 'Freeze') {
    const player = chooseAlivePlayers(room, 1, now, 'freeze')[0];
    if (player) player.frozenUntil = now + freezeDurationMs;
    return;
  }

  if (message === 'Someone ate too many whoppers') {
    const player = chooseAlivePlayers(room, 1, now, 'whopper')[0];
    if (!player) return;
    player.isFat = true;
    player.hp = 150;
    return;
  }

  if (message === 'Deadly missles are coming for you!') {
    const targetCount = alivePlayers.length >= 4 ? 2 : 1;
    chooseAlivePlayers(room, targetCount, now, 'missiles').forEach((player) => {
      room.missiles.push({ id: `missile-${now}-${player.clientId}`, targetClientId: player.clientId, launchedAt: now, hitAt: now + 4000 });
    });
  }
}

function startRound(room, now = Date.now()) {
  const participatingPlayers = getConnectedPlayers(room);
  if (participatingPlayers.length === 0) {
    pauseEmptyRoom(room, now);
    return;
  }

  if (participatingPlayers.length < 2) {
    room.phase = 'lobby';
    room.lobbyEndsAt = now + lobbyDurationMs;
    room.nextEventAt = room.lobbyEndsAt;
    clearRoomRoundEffects(room);
    room.currentEvent = {
      id: `waiting-for-players-${room.id}-${now}`,
      message: 'Waiting for more players...',
      selectedAt: now,
      slot: room.eventSlot,
    };
    for (const player of room.players.values()) {
      resetPlayerRoundState(player, now);
      player.status = player.connected ? 'ready' : 'waiting';
    }
    console.log('[tower:round-waiting]', {
      roomId: room.id,
      connectedPlayers: participatingPlayers.length,
      socketCount: getRoomSocketCount(room),
      nextLobbyEndsAt: room.lobbyEndsAt,
    });
    broadcastSnapshot(room);
    return;
  }

  room.phase = 'arena';
  room.roundStartedAt = now;
  room.eventSlot = 0;
  room.nextEventAt = now + eventIntervalMs;
  room.roundPlayerCount = participatingPlayers.length;
  room.winnerId = '';
  room.winnerName = '';
  clearRoomRoundEffects(room);
  room.currentEvent = {
    id: `round-${room.id}-${now}`,
    message: 'Arena events starting...',
    selectedAt: now,
    slot: 0,
  };
  console.log('[tower:round-start]', {
    roomId: room.id,
    connectedPlayers: participatingPlayers.length,
    socketCount: getRoomSocketCount(room),
    nextEventAt: room.nextEventAt,
  });

  for (const player of room.players.values()) {
    if (player.connected) {
      resetPlayerRoundState(player, now);
      player.status = 'alive';
      player.position = getSpawnPosition(player.slot);
      player.direction = 'front';
    } else {
      player.status = 'waiting';
    }
  }

  broadcastSnapshot(room);
}

function endRound(room, winner, now = Date.now()) {
  room.phase = 'lobby';
  room.lobbyEndsAt = now + lobbyDurationMs;
  room.nextEventAt = room.lobbyEndsAt;
  room.winnerId = winner?.clientId || '';
  room.winnerName = winner?.nickname || '';
  clearRoomRoundEffects(room);
  room.currentEvent = {
    id: `round-over-${room.id}-${now}`,
    message: winner ? `${winner.nickname} wins` : 'Round over',
    selectedAt: now,
    slot: room.eventSlot,
  };

  for (const player of room.players.values()) {
    resetPlayerRoundState(player, now);
    player.status = player.connected ? 'ready' : 'waiting';
  }

  broadcastSnapshot(room);
}

function checkRoundEnd(room) {
  if (room.phase !== 'arena') return;

  const alivePlayers = Array.from(room.players.values()).filter((player) => player.status === 'alive' && player.connected);
  if (alivePlayers.length === 0 || (alivePlayers.length === 1 && room.roundPlayerCount > 1)) {
    endRound(room, alivePlayers[0]);
  }
}

function applyMovement(room, player) {
  if (!player.connected || player.status !== 'alive') return;
  if (player.frozenUntil && player.frozenUntil > Date.now()) return;

  const step = player.rapidUntil > Date.now() ? rapidStep : baseStep;
  const dx = (Number(player.input.right) - Number(player.input.left)) * (player.input.airborne ? towerAirStep : step);
  if (dx === 0) return;

  player.direction = dx > 0 ? 'right' : 'left';
  const bounds = getMovementBounds();
  const nextPosition = {
    x: clamp(player.position.x + dx, bounds.minX, bounds.maxX),
    y: clamp(player.position.y, bounds.minY, bounds.maxY),
  };

  if (!player.input.airborne) {
    const landing = getLandingAt(room, nextPosition);
    if (!landing || Math.abs(nextPosition.y - landing.y) > 1) return;
    player.position = { x: landing.x, y: landing.y };
    player.updatedAt = Date.now();
    return;
  }

  player.position = nextPosition;
  player.updatedAt = Date.now();
}

function reconcilePlayerPlatforms(room) {
  let removedPlayer = false;
  const now = Date.now();

  for (const player of getAlivePlayers(room)) {
    if (player.input.airborne) {
      if (player.airborneStartedAt && now - player.airborneStartedAt < towerMaxAirborneMs) continue;

      player.input = { ...player.input, airborne: false };
      player.airborneStartedAt = 0;
    }

    const landing = getLandingAt(room, player.position);
    if (!landing) {
      if (!player.fallingUntil) {
        player.input = { left: false, right: false, airborne: false };
        player.fallingUntil = now + voidFallGraceMs;
        player.updatedAt = now;
        continue;
      }

      if (now < player.fallingUntil) continue;

      player.status = 'waiting';
      player.input = { left: false, right: false, airborne: false };
      player.fallingUntil = 0;
      player.updatedAt = now;
      removedPlayer = true;
      continue;
    }

    if (player.fallingUntil) {
      player.fallingUntil = 0;
      player.airborneStartedAt = 0;
      player.updatedAt = now;
    }

    if (!player.input.airborne && (Math.abs(player.position.x - landing.x) > 1 || Math.abs(player.position.y - landing.y) > 1)) {
      player.position = { x: landing.x, y: landing.y };
      player.updatedAt = now;
    }
  }

  return removedPlayer;
}

function updateTimedTowerEffects(room, now = Date.now()) {
  room.damagedDoomsdayStrikes ||= new Set();
  room.doomsdayStrikes.forEach((strike) => {
    if (now < strike.hitAt || room.damagedDoomsdayStrikes.has(strike.id)) return;

    room.damagedDoomsdayStrikes.add(strike.id);
    getAlivePlayers(room).forEach((player) => {
      if (playerIsOnTowerSlot(room, player, strike.slot)) {
        damagePlayer(player, doomsdayDamage, room);
      }
    });
  });

  room.loweredTowers = room.loweredTowers.filter((effect) => now < effect.until);
  room.explosions = room.explosions.filter((effect) => now < effect.endsAt);
  room.doomsdayStrikes = room.doomsdayStrikes.filter((effect) => now < effect.endsAt);
  const activeDoomsdayIds = new Set(room.doomsdayStrikes.map((strike) => strike.id));
  room.damagedDoomsdayStrikes = new Set([...room.damagedDoomsdayStrikes].filter((id) => activeDoomsdayIds.has(id)));

  const explodingBombs = room.bombs.filter((bomb) => now >= bomb.explodesAt);
  room.bombs = room.bombs.filter((bomb) => now < bomb.explodesAt);
  explodingBombs.forEach((bomb) => {
    room.explosions.push({ id: `explosion-${bomb.id}`, x: bomb.x, y: bomb.y, startedAt: now, endsAt: now + 1100 });
    getAlivePlayers(room).forEach((player) => {
      if (Math.hypot(player.position.x - bomb.x, player.position.y - bomb.y) < 50) {
        damagePlayer(player, 50, room);
      }
    });
  });

  const hittingMissiles = room.missiles.filter((missile) => now >= missile.hitAt);
  room.missiles = room.missiles.filter((missile) => now < missile.hitAt);
  hittingMissiles.forEach((missile) => {
    const target = room.players.get(missile.targetClientId);
    const targetPosition = target?.position;
    if (!targetPosition) return;
    room.explosions.push({ id: `missile-explosion-${missile.id}`, x: targetPosition.x, y: targetPosition.y, startedAt: now, endsAt: now + 900 });
    getAlivePlayers(room).forEach((player) => {
      if (Math.hypot(player.position.x - targetPosition.x, player.position.y - targetPosition.y) < 45) {
        damagePlayer(player, 99, room);
      }
    });
  });

  if (reconcilePlayerPlatforms(room)) checkRoundEnd(room);
}

function pruneRooms() {
  const now = Date.now();

  for (const room of rooms.values()) {
    for (const [clientId, player] of room.players.entries()) {
      if (!player.connected && now - player.disconnectedAt > reconnectGraceMs) {
        room.players.delete(clientId);
        if (clientRooms.get(clientId) === room.id) clientRooms.delete(clientId);
      }
    }

    if (room.players.size === 0) {
      rooms.delete(room.id);
    }
  }
}

function removePlayerFromRoom(room, clientId) {
  const player = room.players.get(clientId);
  if (!player) return;

  room.players.delete(clientId);
  if (clientRooms.get(clientId) === room.id) clientRooms.delete(clientId);
  if (room.players.size === 0) {
    pauseEmptyRoom(room);
    rooms.delete(room.id);
    return;
  }

  broadcastSnapshot(room);
}

io.on('connection', (socket) => {
  socket.on('tower:join', (payload = {}) => {
    const clientId = String(payload.clientId || socket.id);
    const room = getRoomForClient(clientId);
    const existingPlayer = room.players.get(clientId);
    const existingSlotIsOpen =
      existingPlayer &&
      !Array.from(room.players.values()).some((player) => player.connected && player.clientId !== clientId && player.slot === existingPlayer.slot);
    const slot = existingSlotIsOpen ? existingPlayer.slot : getNextOpenSlot(room, clientId);
    const player =
      existingPlayer || {
        clientId,
        userId: '',
        nickname: 'Player',
        position: getSpawnPosition(slot),
        direction: 'front',
        connected: true,
        disconnectedAt: 0,
        updatedAt: Date.now(),
        input: { left: false, right: false, airborne: false },
        rapidUntil: 0,
        decorations: { ...defaultDecorations },
        slot,
        status: room.phase === 'lobby' ? 'ready' : 'waiting',
        hp: 100,
        hasSword: false,
        hasPizza: false,
        hasWarp: false,
        equippedItem: 'sword',
        frozenUntil: 0,
        isFat: false,
        fallingUntil: 0,
        airborneStartedAt: 0,
        lastSwordAt: 0,
      };

    player.socketId = socket.id;
    player.userId = String(payload.userId || player.userId);
    player.nickname = getUniqueNickname(clientId, payload.nickname || player.nickname);
    if (payload.decorations) {
      player.decorations = {
        ...sanitizeDecorations(payload.decorations, player.decorations || defaultDecorations),
        updatedBy: player.nickname,
      };
    }
    player.connected = true;
    player.disconnectedAt = 0;
    player.input = { left: false, right: false, airborne: false };
    player.equippedItem = 'sword';
    player.fallingUntil = 0;
    player.airborneStartedAt = 0;
    player.slot = slot;
    if (room.phase === 'lobby') {
      player.status = 'ready';
      player.position = getSpawnPosition(slot);
    } else if (player.status !== 'alive') {
      player.status = 'waiting';
    }
    player.updatedAt = Date.now();
    room.players.set(clientId, player);
    clientRooms.set(clientId, room.id);

    socket.data.clientId = clientId;
    socket.data.roomId = room.id;
    socket.join(room.id);
    if (getRoomSocketCount(room) === 1) {
      const now = Date.now();
      room.phase = 'lobby';
      room.roundStartedAt = now;
      room.lobbyEndsAt = now + lobbyDurationMs;
      room.nextEventAt = room.lobbyEndsAt;
      room.winnerId = '';
      room.winnerName = '';
      clearRoomRoundEffects(room);
      for (const roomPlayer of room.players.values()) {
        resetPlayerRoundState(roomPlayer, now);
        roomPlayer.status = roomPlayer.connected ? 'ready' : 'waiting';
        roomPlayer.position = getSpawnPosition(roomPlayer.slot);
      }
      room.currentEvent = {
        id: `waiting-${room.id}-${now}`,
        message: 'Waiting for next round...',
        selectedAt: now,
        slot: room.eventSlot,
      };
    }
    socket.emit('tower:joined', { selfId: clientId, roomId: room.id, snapshot: snapshot(room) });
    broadcastSnapshot(room);
  });

  socket.on('tower:input', (input = {}) => {
    const clientId = socket.data.clientId;
    const room = rooms.get(socket.data.roomId);
    if (!clientId || !room) return;
    const player = room.players.get(clientId);
    if (!player) return;

    player.input = player.fallingUntil
      ? { left: false, right: false, airborne: false }
      : {
          left: Boolean(input.left),
          right: Boolean(input.right),
          airborne: Boolean(input.airborne),
        };
    if (player.input.airborne) {
      player.airborneStartedAt ||= Date.now();
    } else {
      player.airborneStartedAt = 0;
    }
    if (
      input.equippedItem === 'sword' ||
      (input.equippedItem === 'pizza' && player.hasPizza) ||
      (input.equippedItem === 'warp' && player.hasWarp)
    ) {
      player.equippedItem = input.equippedItem;
    }
  });

  socket.on('tower:land', (payload = {}) => {
    const clientId = socket.data.clientId;
    const room = rooms.get(socket.data.roomId);
    if (!clientId || !room) return;
    const player = room.players.get(clientId);
    if (!player || player.status !== 'alive' || player.fallingUntil) return;

    const requestedPosition = {
      x: Number(payload.position?.x),
      y: Number(payload.position?.y),
    };
    if (!Number.isFinite(requestedPosition.x) || !Number.isFinite(requestedPosition.y)) return;

    const landing = getLandingAt(room, requestedPosition);
    if (!landing) return;

    player.position = { x: landing.x, y: landing.y };
    player.input = { left: false, right: false, airborne: false };
    player.fallingUntil = 0;
    player.airborneStartedAt = 0;
    player.updatedAt = Date.now();
    broadcastSnapshot(room);
  });

  socket.on('tower:decoration', (nextDecorations = {}) => {
    const clientId = socket.data.clientId;
    const room = rooms.get(socket.data.roomId);
    if (!clientId || !room) return;
    const player = room.players.get(clientId);

    if (player) {
      player.decorations = {
        ...sanitizeDecorations(nextDecorations, player.decorations || defaultDecorations),
        updatedBy: player.nickname,
      };
    }
    broadcastSnapshot(room);
  });

  socket.on('tower:die', () => {
    const clientId = socket.data.clientId;
    const room = rooms.get(socket.data.roomId);
    if (!clientId || !room) return;
    const player = room.players.get(clientId);
    if (!player || player.status !== 'alive') return;

    player.status = 'waiting';
    player.input = { left: false, right: false, airborne: false };
    player.fallingUntil = 0;
    player.airborneStartedAt = 0;
    player.updatedAt = Date.now();
    broadcastSnapshot(room);
    checkRoundEnd(room);
  });

  socket.on('tower:falling', () => {
    const clientId = socket.data.clientId;
    const room = rooms.get(socket.data.roomId);
    if (!clientId || !room) return;
    const player = room.players.get(clientId);
    if (!player || player.status !== 'alive') return;

    player.input = { left: false, right: false, airborne: false };
    player.airborneStartedAt = 0;
    player.fallingUntil = Date.now() + voidFallGraceMs;
    player.updatedAt = Date.now();
  });

  socket.on('tower:warp', (payload = {}) => {
    const clientId = socket.data.clientId;
    const room = rooms.get(socket.data.roomId);
    if (!clientId || !room) return;
    const player = room.players.get(clientId);
    const target = room.players.get(String(payload.targetClientId || ''));
    if (!player || !target || !player.hasWarp || player.status !== 'alive' || target.status !== 'alive') return;

    player.position = { ...target.position };
    player.updatedAt = Date.now();
    broadcastSnapshot(room);
  });

  socket.on('tower:pizza', () => {
    const clientId = socket.data.clientId;
    const room = rooms.get(socket.data.roomId);
    if (!clientId || !room) return;
    const player = room.players.get(clientId);
    if (!player || !player.hasPizza || player.status !== 'alive') return;

    const maxHp = player.isFat ? 150 : 100;
    player.hp = Math.min(maxHp, (player.hp ?? maxHp) + pizzaHealAmount);
    player.hasPizza = false;
    player.equippedItem = 'sword';
    player.updatedAt = Date.now();
    broadcastSnapshot(room);
  });

  socket.on('tower:sword', () => {
    const clientId = socket.data.clientId;
    const room = rooms.get(socket.data.roomId);
    if (!clientId || !room) return;
    const player = room.players.get(clientId);
    if (!player || !player.hasSword || player.status !== 'alive') return;

    const now = Date.now();
    if (now - (player.lastSwordAt || 0) < swordCooldownMs) return;
    player.lastSwordAt = now;

    const target = getAlivePlayers(room)
      .filter((nextPlayer) => nextPlayer.clientId !== clientId)
      .map((nextPlayer) => ({
        player: nextPlayer,
        distance: Math.hypot(nextPlayer.position.x - player.position.x, nextPlayer.position.y - player.position.y),
      }))
      .filter(({ distance }) => distance <= swordRange)
      .sort((a, b) => a.distance - b.distance)[0]?.player;

    if (!target) {
      broadcastSnapshot(room);
      return;
    }

    damagePlayer(target, swordDamage, room);
    broadcastSnapshot(room);
  });

  socket.on('tower:leave', (ack) => {
    const clientId = socket.data.clientId;
    const room = rooms.get(socket.data.roomId);
    if (!clientId || !room) {
      if (typeof ack === 'function') ack();
      return;
    }

    socket.leave(room.id);
    socket.data.roomId = undefined;
    socket.data.clientId = undefined;
    removePlayerFromRoom(room, clientId);
    if (typeof ack === 'function') ack();
  });

  socket.on('disconnect', () => {
    const clientId = socket.data.clientId;
    const room = rooms.get(socket.data.roomId);
    if (!clientId || !room) return;
    const player = room.players.get(clientId);
    if (!player) return;

    player.connected = false;
    player.disconnectedAt = Date.now();
    player.input = { left: false, right: false, airborne: false };
    if (player.status !== 'alive') player.status = 'waiting';
    player.updatedAt = Date.now();
    if (!roomHasSockets(room)) pauseEmptyRoom(room);
    broadcastSnapshot(room);
    checkRoundEnd(room);
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    if (!roomHasSockets(room)) {
      pauseEmptyRoom(room);
      continue;
    }
    if (room.phase !== 'arena') continue;

    updateTimedTowerEffects(room);
    for (const player of room.players.values()) applyMovement(room, player);
    broadcastSnapshot(room);
  }
}, movementTickMs);

setInterval(() => {
  const now = Date.now();

  for (const room of rooms.values()) {
    if (!roomHasSockets(room)) {
      pauseEmptyRoom(room, now);
      continue;
    }

    if (room.phase === 'lobby' && now >= room.lobbyEndsAt) {
      startRound(room, now);
      continue;
    }

    if (room.phase === 'arena' && now >= room.nextEventAt) chooseServerEvent(room);
  }
}, 250);

setInterval(pruneRooms, 5000);

httpServer.listen(port, () => {
  console.log(`Socket.IO tower server listening on http://localhost:${port}`);
});
