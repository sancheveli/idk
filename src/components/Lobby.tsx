import { useEffect, useMemo, useRef, useState } from 'react';

type LobbyProps = {
  nickname: string;
  userId: string;
  onMenuOpenChange?: (open: boolean) => void;
};

type Position = {
  x: number;
  y: number;
};

type GamePhase = 'lobby' | 'arena';
type ArenaMode = 'main' | 'duel';
type Direction = 'front' | 'back' | 'left' | 'right';
type MenuPanel = 'main' | 'gamemods' | 'settings';
type ServerEvent =
  | 'Someone will get a sword'
  | 'Something will explode'
  | 'SURVIVE THE DOOMSDAY'
  | 'Zombie apocalypse'
  | 'BATTLE TO DEATH'
  | 'FREEZE'
  | 'Someone will find out they are rapid'
  | 'Someone will get their leg lost'
  | 'Someone will turn blue'
  | 'Someone will turn red'
  | 'Someone will turn green';
type PlayerSnapshot = {
  clientId: string;
  userId: string;
  nickname: string;
  joinedAt: number;
  position: Position;
  direction: Direction;
  phase: GamePhase;
  hasSword: boolean;
  isBlue: boolean;
  isRed: boolean;
  isGreen: boolean;
  isFrozen: boolean;
  missingRightLeg: boolean;
  swordSwinging: boolean;
  health: number;
  isDead: boolean;
  updatedAt: number;
};
type GameStateSnapshot = {
  phase: GamePhase;
  roundEndsAt: number;
  hiddenArenaObjects: string[];
  serverAnnouncement: string;
};
type RoundSnapshot = GameStateSnapshot & {
  timeLeft: number;
  arenaElapsed: number;
  roundNumber: number;
  eventSlot: number;
  currentEventStartedAt: number;
  targetedEffects: {
    sword: string[];
    rapid: string[];
    missingRightLeg: string[];
    blue: string[];
    red: string[];
    green: string[];
    frozen: string[];
    frozenIds: string[];
  };
  fireHazards: FireHazard[];
  doomsdayStrikes: DoomsdayStrike[];
  zombies: Zombie[];
};
type BotSnapshot = PlayerSnapshot & {
  kind: 'bot';
  isRapid: boolean;
};
type DuelState = {
  id: string;
  fighters: [string, string];
  startedAt: number;
};
type FireHazard = {
  id: string;
  objectId: string;
  bounds: Bounds;
  startedAt: number;
};
type DoomsdayStrike = {
  id: string;
  x: number;
  y: number;
  radius: number;
  startedAt: number;
  hitAt: number;
};
type Zombie = {
  id: string;
  spawnedAt: number;
  position: Position;
  targetClientId: string;
  deadAt?: number;
  source?: 'event' | 'king';
  kind?: 'minion' | 'king';
  health?: number;
  maxHealth?: number;
  direction?: Direction;
  swordSwinging?: boolean;
};
type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};
type BoundsResolver = Bounds | ((width: number, height: number) => Bounds);
type SavedLobbyRunV1 = {
  version: 1;
  savedAt: number;
  joinedAt: number;
  phase: GamePhase;
  menuOpen: boolean;
  menuPanel: MenuPanel;
  isPaused: boolean;
  timeLeft: number;
  roundEndsAt: number;
  roomStartedAt: number;
  roundSeed: number;
  runRandomSeed: string;
  spawnPlaced: boolean;
  position: Position;
  direction: Direction;
  shopOpen: boolean;
  shopDismissed: boolean;
  swordSwinging: boolean;
  swordSwingStartedAt: number;
  serverAnnouncement: string;
  hasSword: boolean;
  isRapid: boolean;
  missingRightLeg: boolean;
  isBlue: boolean;
  isRed: boolean;
  isGreen: boolean;
  isFrozen: boolean;
  hiddenArenaObjects: string[];
  destroyedArenaObjects: string[];
  fireHazards: FireHazard[];
  doomsdayStrikes: DoomsdayStrike[];
  zombies: Zombie[];
  zombieKing: Zombie | null;
  kingZombies: Zombie[];
  equippedItem: 'sword' | 'gun';
  bots: BotSnapshot[];
  arenaMode: ArenaMode;
  duelState: DuelState | null;
  deathMessage: string;
  health: number;
  isDead: boolean;
  deathReturnAt: number;
  invulnerableUntil: number;
  nextZombieKingSpawnAt: number;
  kingSpawnedAfterBots: boolean;
  killedZombieIds: string[];
  damagedZombieIds: string[];
  damagedFireIds: string[];
  damagedDoomsdayIds: string[];
  handledEventIds: string[];
  damagedBotSwingIds: string[];
  damagedBotFireIds: string[];
  damagedBotDoomsdayIds: string[];
  botDeadAt: Array<[string, number]>;
  botEventImmuneUntil: Array<[string, number]>;
  playerPositionHistory: Array<{ position: Position; recordedAt: number }>;
};

const baseStep = 14;
const rapidStep = 24;
const worldWidth = 1155;
const worldHeight = 635;
const lobbyDuration = 20;
const eventInterval = 7;
const postDoomsdayEventDelay = 20;
const deathReturnDelay = 2200;
const eventTimelineLimit = 900;
const menuMusicSrc = '/audio/noob-alert.mp3';
const lobbyMusicSrc = '/audio/lobby-music.mp3';
const arenaMusicSrc = '/audio/arena-music.mp3';
const arenaSecondMusicSrc = '/audio/online-social-hangout.mp3';
const savedRunVersion = 1;
const savedRunMaxAge = 12 * 60 * 60 * 1000;
const lobbySpawnSlots: Position[] = [
  { x: 500, y: 330 },
  { x: 414, y: 330 },
  { x: 586, y: 330 },
  { x: 500, y: 410 },
  { x: 414, y: 410 },
  { x: 586, y: 410 },
];
const arenaSpawnSlots: Position[] = [
  { x: 500, y: 330 },
  { x: 380, y: 330 },
  { x: 620, y: 330 },
  { x: 500, y: 430 },
  { x: 380, y: 430 },
  { x: 620, y: 430 },
];
const initialBotIds = ['bot-1', 'bot-2', 'bot-3'];
const botIds = initialBotIds;
const botNames: Record<string, string> = {
  'bot-1': 'Bot 1',
  'bot-2': 'Bot 2',
  'bot-3': 'Bot 3',
};
const botSpawnSlots: Record<string, Position> = {
  'bot-1': { x: 240, y: 160 },
  'bot-2': { x: 930, y: 178 },
  'bot-3': { x: 880, y: 505 },
};
const duelSpawnSlots: [Position, Position] = [
  { x: 410, y: 360 },
  { x: 745, y: 360 },
];
const postDuelPlayerSpawn: Position = { x: worldWidth / 2, y: worldHeight - 58 };
const shopItems = ['1,000 Coins', '10,000 Coins', '25,000 Coins', '50,000 Coins', '75,000 Coins', '100,000 Coins'];
const serverAnnouncements: ServerEvent[] = [
  'Someone will get a sword',
  'Something will explode',
  'SURVIVE THE DOOMSDAY',
  'Zombie apocalypse',
  'BATTLE TO DEATH',
  'FREEZE',
  'Someone will find out they are rapid',
  'Someone will get their leg lost',
  'Someone will turn blue',
  'Someone will turn red',
  'Someone will turn green',
];
const explosiveObjects = ['fort-red', 'fort-blue', 'column-one', 'column-two', 'column-three', 'arena-tree-two', 'arena-tree-three', 'arena-tree-four'];
const fireDuration = 12000;
const fireDamage = 30;
const doomsdayDamage = 60;
const doomsdayInterval = 2000;
const doomsdayWarningDuration = 1000;
const doomsdayPostHitDuration = 900;
const doomsdayRadius = 84;
const doomsdayBaseWidth = 1155;
const doomsdayBaseHeight = 635;
const zombieDamage = 50;
const zombieSpeed = 28;
const zombieKingSpeed = 18;
const zombieKingMaxHealth = 500;
const zombieMinionMaxHealth = 50;
const zombieKingSpawnInterval = 15000;
const zombieKingAttackDistance = 112;
const zombieKingSwordCooldown = 250;
const swordDamage = 18;
const gunDamage = 5;
const botMaxHealth = 120;
const botSpeed = 22;
const botRapidSpeed = 32;
const botFleeSpeedMultiplier = 1.55;
const botFleeDistance = 178;
const botZombieFleeDistance = 220;
const botMovementSegmentDistance = 200;
const botSideEscapeDistance = 200;
const botAttackDistance = 118;
const botSwingInterval = 520;
const duelReturnGraceDuration = 1600;
const botRespawnEventPauseDuration = 10000;
const playerEventEffectDuration = 10000;
const freezeDuration = eventInterval * 1000;
const zombiePathCellSize = 28;
const zombiePathMinX = 1;
const zombiePathMaxX = Math.floor((worldWidth - 34) / zombiePathCellSize);
const zombiePathMinY = Math.ceil(88 / zombiePathCellSize);
const zombiePathMaxY = Math.floor((worldHeight - 34) / zombiePathCellSize);
const desktopFireBounds: Record<string, BoundsResolver> = {
  'arena-wall-top': (width) => ({ x: 150, y: 58, width: Math.min(780, width - 300), height: 34 }),
  'arena-wall-bottom': (width, height) => ({ x: 150, y: height - 92, width: Math.min(780, width - 300), height: 34 }),
  'arena-wall-left': (_width, height) => ({ x: 70, y: 140, width: 34, height: Math.min(300, height - 280) }),
  'arena-wall-right': (width, height) => ({ x: width - 104, y: 140, width: 34, height: Math.min(300, height - 280) }),
  'fort-red': { x: 170, y: 176, width: 110, height: 154 },
  'fort-blue': (width) => ({ x: width - 280, y: 176, width: 110, height: 154 }),
  'column-one': { x: 386, y: 160, width: 58, height: 58 },
  'column-two': (width, height) => ({ x: width - 444, y: height - 212, width: 58, height: 58 }),
  'column-three': (width, height) => ({ x: width / 2 - 29, y: height - 190, width: 58, height: 58 }),
  'arena-tree-two': (width) => ({ x: width - 174, y: 106, width: 70, height: 92 }),
  'arena-tree-three': (_width, height) => ({ x: 136, y: height - 168, width: 70, height: 92 }),
  'arena-tree-four': (width, height) => ({ x: width - 228, y: height - 176, width: 70, height: 92 }),
};
const lobbyObstacleBounds: Bounds[] = [
  { x: 450, y: 78, width: 254, height: 164 },
  { x: 60, y: 391, width: 98, height: 186 },
  { x: 997, y: 391, width: 98, height: 186 },
  { x: 220, y: 40, width: 98, height: 218 },
  { x: 827, y: 377, width: 98, height: 200 },
  { x: 281, y: 439, width: 80, height: 122 },
  { x: 800, y: 447, width: 80, height: 122 },
  { x: 411, y: 84, width: 80, height: 90 },
  { x: 630, y: 108, width: 80, height: 90 },
];
function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getClientId(userId: string) {
  const storageKey = `spawn-plaza:client-id:${userId}`;
  const storedClientId = window.localStorage.getItem(storageKey);
  if (storedClientId) return storedClientId;

  const nextClientId = crypto.randomUUID();
  window.localStorage.setItem(storageKey, nextClientId);
  return nextClientId;
}

function getSavedRunStorageKey(clientId: string) {
  return `brickbattle-run:${clientId}`;
}

function getSavedRunSessionKey(clientId: string) {
  return `brickbattle-run-session:${clientId}`;
}

function readSavedLobbyRun(clientId: string): SavedLobbyRunV1 | null {
  try {
    const storageKey = getSavedRunStorageKey(clientId);
    const sessionKey = getSavedRunSessionKey(clientId);
    if (window.sessionStorage.getItem(sessionKey) !== 'active') {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    const rawRun = window.localStorage.getItem(storageKey);
    if (!rawRun) return null;

    const parsed = JSON.parse(rawRun) as SavedLobbyRunV1;
    if (parsed.version !== savedRunVersion || Date.now() - parsed.savedAt > savedRunMaxAge) {
      window.localStorage.removeItem(storageKey);
      window.sessionStorage.removeItem(sessionKey);
      return null;
    }

    return parsed;
  } catch {
    window.localStorage.removeItem(getSavedRunStorageKey(clientId));
    window.sessionStorage.removeItem(getSavedRunSessionKey(clientId));
    return null;
  }
}

function writeSavedLobbyRun(clientId: string, run: SavedLobbyRunV1) {
  try {
    window.localStorage.setItem(getSavedRunStorageKey(clientId), JSON.stringify(run));
    window.sessionStorage.setItem(getSavedRunSessionKey(clientId), 'active');
  } catch {
    // Ignore quota/private-mode failures; the game should keep running.
  }
}

function clearSavedLobbyRun(clientId: string) {
  try {
    window.localStorage.removeItem(getSavedRunStorageKey(clientId));
    window.sessionStorage.removeItem(getSavedRunSessionKey(clientId));
  } catch {
    // Ignore storage failures.
  }
}

function shiftFiniteTimestamp(value: number, duration: number) {
  return Number.isFinite(value) ? value + duration : value;
}

function shiftActiveTimestamp(value: number, duration: number) {
  return value > 0 && Number.isFinite(value) ? value + duration : value;
}

function hashText(text: string) {
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function createRunRandomSeed() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function getDeterministicShuffle<T>(items: T[], seed: string, getKey: (item: T) => string) {
  return [...items].sort((first, second) => {
    const firstHash = hashText(`${seed}:${getKey(first)}`);
    const secondHash = hashText(`${seed}:${getKey(second)}`);
    if (firstHash !== secondHash) return firstHash - secondHash;
    return getKey(first).localeCompare(getKey(second));
  });
}

function getDeterministicEvent(serverId: string, runRandomSeed: string, roundNumber: number, eventSlot: number, excludedEvents: ServerEvent[] = []) {
  if (eventSlot > 0 && eventSlot % 8 === 0) return 'SURVIVE THE DOOMSDAY';
  if (eventSlot > 0 && eventSlot % 9 === 0) return 'BATTLE TO DEATH';
  if (eventSlot > 0 && eventSlot % 6 === 0) return 'Zombie apocalypse';

  const reservedEvents: ServerEvent[] = ['SURVIVE THE DOOMSDAY', 'Zombie apocalypse', 'BATTLE TO DEATH'];
  const unavailableEvents = new Set<ServerEvent>([...reservedEvents, ...excludedEvents]);
  const availableEvents = serverAnnouncements.filter((event) => !unavailableEvents.has(event));
  const eventCycle = Math.floor((eventSlot - 1) / Math.max(1, availableEvents.length));
  const shuffledEvents = getDeterministicShuffle(availableEvents, `${serverId}:${runRandomSeed}:${roundNumber}:${eventCycle}:events`, (event) => event);
  return shuffledEvents[(eventSlot - 1) % shuffledEvents.length];
}

function getDeterministicExplosiveObject(serverId: string, runRandomSeed: string, roundNumber: number, eventSlot: number, usedObjects: string[]) {
  const availableObjects = explosiveObjects.filter((object) => !usedObjects.includes(object));
  if (availableObjects.length === 0) return undefined;

  const shuffledObjects = getDeterministicShuffle(availableObjects, `${serverId}:${runRandomSeed}:${roundNumber}:${eventSlot}:explode`, (objectId) => objectId);
  return shuffledObjects[0];
}

function getBaseObjectBounds(objectId: string) {
  const boundsResolver = desktopFireBounds[objectId];
  return typeof boundsResolver === 'function' ? boundsResolver(doomsdayBaseWidth, doomsdayBaseHeight) : boundsResolver;
}

function getFallbackFireBounds(serverId: string, runRandomSeed: string, roundNumber: number, eventSlot: number) {
  const xHash = hashText(`${serverId}:${runRandomSeed}:${roundNumber}:${eventSlot}:fallback-fire-x`);
  const yHash = hashText(`${serverId}:${runRandomSeed}:${roundNumber}:${eventSlot}:fallback-fire-y`);

  return {
    x: 120 + (xHash % 780),
    y: 120 + (yHash % 300),
    width: 72,
    height: 72,
  };
}

function getActiveObjectBounds(hiddenObjectIds: string[]) {
  const hiddenObjects = new Set(hiddenObjectIds);

  return explosiveObjects
    .filter((objectId) => !hiddenObjects.has(objectId))
    .map((objectId) => getBaseObjectBounds(objectId))
    .filter((bounds): bounds is Bounds => Boolean(bounds));
}

function getBotObjectBounds(hiddenObjectIds: string[]) {
  const hiddenObjects = new Set(hiddenObjectIds);

  return explosiveObjects
    .filter((objectId) => !objectId.startsWith('arena-tree-'))
    .filter((objectId) => !hiddenObjects.has(objectId))
    .map((objectId) => getBaseObjectBounds(objectId))
    .filter((bounds): bounds is Bounds => Boolean(bounds));
}

function collidesCharacterWithBounds(position: Position, bounds: Bounds[]) {
  const characterBox = {
    left: position.x - 23,
    right: position.x + 23,
    top: position.y - 66,
    bottom: position.y + 12,
  };

  return bounds.some((bound) => {
    return (
      characterBox.left < bound.x + bound.width &&
      characterBox.right > bound.x &&
      characterBox.top < bound.y + bound.height &&
      characterBox.bottom > bound.y
    );
  });
}

function getZombiePathGridPosition(position: Position) {
  return {
    x: clamp(Math.round(position.x / zombiePathCellSize), zombiePathMinX, zombiePathMaxX),
    y: clamp(Math.round(position.y / zombiePathCellSize), zombiePathMinY, zombiePathMaxY),
  };
}

function getZombiePathWorldPosition(cell: Position) {
  return {
    x: clamp(cell.x * zombiePathCellSize, 34, worldWidth - 34),
    y: clamp(cell.y * zombiePathCellSize, 88, worldHeight - 34),
  };
}

function getZombiePathKey(cell: Position) {
  return `${cell.x}:${cell.y}`;
}

function isZombiePathCellInBounds(cell: Position) {
  return cell.x >= zombiePathMinX && cell.x <= zombiePathMaxX && cell.y >= zombiePathMinY && cell.y <= zombiePathMaxY;
}

function isZombiePathCellOpen(cell: Position, obstacleBounds: Bounds[]) {
  const position = getZombiePathWorldPosition(cell);
  const pathBox = {
    left: position.x - 14,
    right: position.x + 14,
    top: position.y - 42,
    bottom: position.y + 8,
  };

  return !obstacleBounds.some((bound) => {
    return pathBox.left < bound.x + bound.width && pathBox.right > bound.x && pathBox.top < bound.y + bound.height && pathBox.bottom > bound.y;
  });
}

function getNearestOpenZombieCell(position: Position, obstacleBounds: Bounds[]) {
  const origin = getZombiePathGridPosition(position);
  if (isZombiePathCellOpen(origin, obstacleBounds)) return origin;

  for (let radius = 1; radius <= 8; radius += 1) {
    for (let yOffset = -radius; yOffset <= radius; yOffset += 1) {
      for (let xOffset = -radius; xOffset <= radius; xOffset += 1) {
        if (Math.abs(xOffset) !== radius && Math.abs(yOffset) !== radius) continue;

        const cell = { x: origin.x + xOffset, y: origin.y + yOffset };
        if (!isZombiePathCellInBounds(cell)) continue;
        if (isZombiePathCellOpen(cell, obstacleBounds)) return cell;
      }
    }
  }

  return origin;
}

function getZombiePath(start: Position, target: Position, obstacleBounds: Bounds[]) {
  const startCell = getNearestOpenZombieCell(start, obstacleBounds);
  const targetCell = getNearestOpenZombieCell(target, obstacleBounds);
  const startKey = getZombiePathKey(startCell);
  const targetKey = getZombiePathKey(targetCell);
  const openCells = new Set([startKey]);
  const cameFrom = new Map<string, string>();
  const cellByKey = new Map<string, Position>([[startKey, startCell]]);
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([[startKey, Math.hypot(targetCell.x - startCell.x, targetCell.y - startCell.y)]]);
  const maxIterations = 1200;

  for (let iteration = 0; iteration < maxIterations && openCells.size > 0; iteration += 1) {
    let currentKey = '';
    let currentScore = Number.POSITIVE_INFINITY;

    openCells.forEach((key) => {
      const score = fScore.get(key) ?? Number.POSITIVE_INFINITY;
      if (score < currentScore) {
        currentScore = score;
        currentKey = key;
      }
    });

    const currentCell = cellByKey.get(currentKey);
    if (!currentCell) break;

    if (currentKey === targetKey) {
      const path = [target];
      let traceKey = currentKey;

      while (traceKey !== startKey) {
        const traceCell = cellByKey.get(traceKey);
        if (traceCell) path.unshift(getZombiePathWorldPosition(traceCell));
        traceKey = cameFrom.get(traceKey) ?? startKey;
      }

      path.unshift(start);
      return path;
    }

    openCells.delete(currentKey);

    [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 1, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: 1 },
      { x: -1, y: -1 },
    ].forEach((offset) => {
      const neighbor = { x: currentCell.x + offset.x, y: currentCell.y + offset.y };
      if (!isZombiePathCellInBounds(neighbor)) return;
      if (!isZombiePathCellOpen(neighbor, obstacleBounds)) return;

      const neighborKey = getZombiePathKey(neighbor);
      const movementCost = offset.x !== 0 && offset.y !== 0 ? Math.SQRT2 : 1;
      const tentativeScore = (gScore.get(currentKey) ?? Number.POSITIVE_INFINITY) + movementCost;

      if (tentativeScore >= (gScore.get(neighborKey) ?? Number.POSITIVE_INFINITY)) return;

      cameFrom.set(neighborKey, currentKey);
      cellByKey.set(neighborKey, neighbor);
      gScore.set(neighborKey, tentativeScore);
      fScore.set(neighborKey, tentativeScore + Math.hypot(targetCell.x - neighbor.x, targetCell.y - neighbor.y));
      openCells.add(neighborKey);
    });
  }

  return [start];
}

function getDeterministicDoomsdayStrike(
  roundNumber: number,
  eventSlot: number,
  strikeIndex: number,
  startedAt: number,
  targetPosition: Position,
): DoomsdayStrike {
  return {
    id: `${roundNumber}-${eventSlot}-${strikeIndex}`,
    x: targetPosition.x,
    y: targetPosition.y,
    radius: doomsdayRadius,
    startedAt,
    hitAt: startedAt + doomsdayWarningDuration,
  };
}

function getDeterministicTarget(clientIds: string[], serverId: string, runRandomSeed: string, roundNumber: number, eventSlot: number) {
  if (clientIds.length === 0) return '';
  const targetCycle = Math.floor((eventSlot - 1) / Math.max(1, clientIds.length));
  const shuffledTargets = getDeterministicShuffle(clientIds, `${serverId}:${runRandomSeed}:${roundNumber}:${targetCycle}:targets`, (clientId) => clientId);
  return shuffledTargets[(eventSlot - 1) % shuffledTargets.length];
}

function getNearestAliveStickman(position: Position, players: PlayerSnapshot[]) {
  return players
    .filter((player) => player.phase === 'arena' && !player.isDead)
    .sort((a, b) => Math.hypot(a.position.x - position.x, a.position.y - position.y) - Math.hypot(b.position.x - position.x, b.position.y - position.y))[0];
}

function isBotClientId(clientId: string) {
  return clientId.startsWith('bot-');
}

function getPositionAt(history: Array<{ position: Position; recordedAt: number }>, targetTime: number, fallback: Position) {
  let closest = history[0];

  history.forEach((entry) => {
    if (entry.recordedAt <= targetTime) closest = entry;
  });

  return closest?.position ?? fallback;
}

function getDeterministicZombieSpawn(serverId: string, runRandomSeed: string, roundNumber: number, eventSlot: number, targetClientId: string, clientIds: string[]) {
  const targetSpawn = getSpawnSlot('arena', targetClientId, clientIds);
  const angleHash = hashText(`${serverId}:${runRandomSeed}:${roundNumber}:${eventSlot}:${targetClientId}:zombie-angle`);
  const distanceHash = hashText(`${serverId}:${runRandomSeed}:${roundNumber}:${eventSlot}:${targetClientId}:zombie-distance`);
  const angle = (angleHash % 360) * (Math.PI / 180);
  const distance = 72 + (distanceHash % 44);

  return {
    x: clamp(targetSpawn.x + Math.cos(angle) * distance, 34, worldWidth - 34),
    y: clamp(targetSpawn.y + Math.sin(angle) * distance, 88, worldHeight - 34),
  };
}

function getPathChasePosition(spawn: Position, target: Position, elapsedMs: number, obstacleBounds: Bounds[], speed: number) {
  const path = getZombiePath(spawn, target, obstacleBounds);
  let remainingTravel = (Math.max(0, elapsedMs) / 1000) * speed;

  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const next = path[index];
    const segmentX = next.x - previous.x;
    const segmentY = next.y - previous.y;
    const segmentDistance = Math.hypot(segmentX, segmentY);

    if (segmentDistance === 0) continue;

    if (remainingTravel <= segmentDistance) {
      const progress = remainingTravel / segmentDistance;
      return {
        x: previous.x + segmentX * progress,
        y: previous.y + segmentY * progress,
      };
    }

    remainingTravel -= segmentDistance;
  }

  return path[path.length - 1] ?? spawn;
}

function getZombiePosition(spawn: Position, target: Position, elapsedMs: number, obstacleBounds: Bounds[]) {
  return getPathChasePosition(spawn, target, elapsedMs, obstacleBounds, zombieSpeed);
}

function getDirectionToward(from: Position, to: Position): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'front' : 'back';
}

function getDirectionVector(nextDirection: Direction) {
  if (nextDirection === 'left') return { x: -1, y: 0 };
  if (nextDirection === 'right') return { x: 1, y: 0 };
  if (nextDirection === 'back') return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

function getOpenStepPosition(origin: Position, desiredTarget: Position, speed: number, obstacleBounds: Bounds[], seed: string) {
  const dx = desiredTarget.x - origin.x;
  const dy = desiredTarget.y - origin.y;
  const distance = Math.hypot(dx, dy);
  const baseAngle = distance > 0 ? Math.atan2(dy, dx) : ((hashText(seed) % 360) * Math.PI) / 180;
  const nearEdge = origin.x < 78 || origin.x > worldWidth - 78 || origin.y < 124 || origin.y > worldHeight - 78;
  const centerAngle = Math.atan2(worldHeight / 2 - origin.y, worldWidth / 2 - origin.x);
  const angleOffsets = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, (Math.PI * 3) / 4, (-Math.PI * 3) / 4, Math.PI];
  const seedOffset = ((hashText(`${seed}:offset`) % 360) * Math.PI) / 180;
  const candidateAngles = [
    ...(nearEdge ? [centerAngle, centerAngle + Math.PI / 5, centerAngle - Math.PI / 5] : []),
    ...angleOffsets.map((offset) => baseAngle + offset),
    ...angleOffsets.map((offset) => seedOffset + offset),
  ];

  for (const angle of candidateAngles) {
    const candidate = {
      x: clamp(origin.x + Math.cos(angle) * speed, 34, worldWidth - 34),
      y: clamp(origin.y + Math.sin(angle) * speed, 88, worldHeight - 34),
    };

    const actuallyMoved = Math.hypot(candidate.x - origin.x, candidate.y - origin.y) > 2;
    if (actuallyMoved && !collidesCharacterWithBounds(candidate, obstacleBounds)) return candidate;
  }

  return origin;
}

function getPathAwareStepPosition(origin: Position, desiredTarget: Position, speed: number, obstacleBounds: Bounds[], seed: string) {
  const dx = desiredTarget.x - origin.x;
  const dy = desiredTarget.y - origin.y;
  const targetDistance = Math.hypot(dx, dy);
  const directStep =
    targetDistance > 0
      ? {
          x: clamp(origin.x + (dx / targetDistance) * Math.min(speed, targetDistance), 34, worldWidth - 34),
          y: clamp(origin.y + (dy / targetDistance) * Math.min(speed, targetDistance), 88, worldHeight - 34),
        }
      : origin;

  if (targetDistance > 0 && !collidesCharacterWithBounds(directStep, obstacleBounds)) return directStep;

  const pathPosition = getPathChasePosition(origin, desiredTarget, 1000, obstacleBounds, speed);
  const pathProgress = Math.hypot(pathPosition.x - origin.x, pathPosition.y - origin.y);

  if (pathProgress > 2 && !collidesCharacterWithBounds(pathPosition, obstacleBounds)) return pathPosition;

  return getOpenStepPosition(origin, desiredTarget, speed, obstacleBounds, seed);
}

function getDirectionalSegmentTarget(origin: Position, angle: number, distance = botMovementSegmentDistance) {
  return {
    x: clamp(origin.x + Math.cos(angle) * distance, 70, worldWidth - 70),
    y: clamp(origin.y + Math.sin(angle) * distance, 118, worldHeight - 70),
  };
}

function getOpenDirectionalSegmentTarget(origin: Position, angle: number, obstacleBounds: Bounds[], seed: string, distance = botMovementSegmentDistance) {
  const offsets = [0, Math.PI / 5, -Math.PI / 5, Math.PI / 3, -Math.PI / 3, Math.PI / 2, -Math.PI / 2, Math.PI];
  const seedAngle = ((hashText(`${seed}:open-target`) % 360) * Math.PI) / 180;
  const candidateAngles = [...offsets.map((offset) => angle + offset), ...offsets.map((offset) => seedAngle + offset)];

  for (const candidateAngle of candidateAngles) {
    const candidate = getDirectionalSegmentTarget(origin, candidateAngle, distance);
    if (!collidesCharacterWithBounds(candidate, obstacleBounds)) return candidate;
  }

  return getOpenStepPosition(origin, getDirectionalSegmentTarget(origin, angle, distance), Math.min(80, distance), obstacleBounds, seed);
}

function getSideEscapeAngle(position: Position) {
  const nearLeft = position.x < 115;
  const nearRight = position.x > worldWidth - 115;
  const nearTop = position.y < 145;
  const nearBottom = position.y > worldHeight - 105;

  if (!(nearLeft || nearRight || nearTop || nearBottom)) return undefined;

  let escapeX = 0;
  let escapeY = 0;
  if (nearLeft) escapeX += 1;
  if (nearRight) escapeX -= 1;
  if (nearTop) escapeY += 1;
  if (nearBottom) escapeY -= 1;

  return Math.atan2(escapeY, escapeX);
}

function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function avoidReverseAngle(nextAngle: number, previousAngle: number | undefined, seed: string) {
  if (previousAngle === undefined) return nextAngle;

  const angleDelta = Math.abs(normalizeAngle(nextAngle - previousAngle));
  if (angleDelta < (Math.PI * 3) / 4) return nextAngle;

  const side = hashText(seed) % 2 === 0 ? 1 : -1;
  return previousAngle + side * (Math.PI / 2);
}

function clearBotFleeStarts(fleeStarts: Map<string, Position>, botId: string) {
  [...fleeStarts.keys()].forEach((key) => {
    if (key.startsWith(`${botId}:`)) fleeStarts.delete(key);
  });
}

function doomsdayStrikeHitsBounds(strike: DoomsdayStrike, bounds: Bounds) {
  const closestX = clamp(strike.x, bounds.x, bounds.x + bounds.width);
  const closestY = clamp(strike.y, bounds.y, bounds.y + bounds.height);
  const distanceX = strike.x - closestX;
  const distanceY = strike.y - closestY;

  return distanceX * distanceX + distanceY * distanceY <= strike.radius * strike.radius;
}

function getLobbySnapshot(roundNumber: number, now: number, lobbyStartedAt = now): RoundSnapshot {
  const lobbyElapsed = Math.max(0, Math.floor((now - lobbyStartedAt) / 1000));
  const timeLeft = Math.max(0, lobbyDuration - lobbyElapsed);

  return {
    phase: 'lobby',
    timeLeft,
    roundEndsAt: now + timeLeft * 1000,
    hiddenArenaObjects: [],
    serverAnnouncement: '',
    arenaElapsed: 0,
    roundNumber,
    eventSlot: 0,
    currentEventStartedAt: 0,
    targetedEffects: {
      sword: [],
      rapid: [],
      missingRightLeg: [],
      blue: [],
      red: [],
      green: [],
      frozen: [],
      frozenIds: [],
    },
    fireHazards: [],
    doomsdayStrikes: [],
    zombies: [],
  };
}

function getRoundSnapshot(
  serverId: string,
  runRandomSeed: string,
  roomStartedAt: number,
  now: number,
  players: PlayerSnapshot[],
  playerPositionHistory: Array<{ position: Position; recordedAt: number }>,
  suppressDangerEvents: boolean,
): RoundSnapshot {
  const elapsedSeconds = Math.max(0, Math.floor((now - roomStartedAt) / 1000));
  const roundNumber = 0;
  const clientIds = players.filter((player) => !player.isDead).map((player) => player.clientId).sort();

  if (elapsedSeconds < lobbyDuration) {
    return {
      phase: 'lobby',
      timeLeft: lobbyDuration - elapsedSeconds,
      roundEndsAt: now + (lobbyDuration - elapsedSeconds) * 1000,
      hiddenArenaObjects: [],
      serverAnnouncement: '',
      arenaElapsed: 0,
      roundNumber,
      eventSlot: 0,
      currentEventStartedAt: 0,
      targetedEffects: {
        sword: [],
        rapid: [],
        missingRightLeg: [],
        blue: [],
        red: [],
        green: [],
        frozen: [],
        frozenIds: [],
      },
      fireHazards: [],
      doomsdayStrikes: [],
      zombies: [],
    };
  }

  const arenaElapsed = elapsedSeconds - lobbyDuration;
  const hiddenArenaObjects: string[] = [];
  const targetedEffects = {
    sword: [] as string[],
    rapid: [] as string[],
    missingRightLeg: [] as string[],
    blue: [] as string[],
    red: [] as string[],
    green: [] as string[],
    frozen: [] as string[],
    frozenIds: [] as string[],
  };
  const fireHazards: FireHazard[] = [];
  const doomsdayStrikes: DoomsdayStrike[] = [];
  const zombies: Zombie[] = [];
  let serverAnnouncement = arenaElapsed >= eventInterval ? 'Arena events starting...' : '';
  let eventSlot = 0;
  let nextEventSecond = eventInterval;
  let currentEventStartedAt = 0;
  let previousEvent: ServerEvent | '' = '';

  while (nextEventSecond <= arenaElapsed && eventSlot < eventTimelineLimit) {
    eventSlot += 1;
    const slot = eventSlot;
    const eventStartedAt = roomStartedAt + (lobbyDuration + nextEventSecond) * 1000;
    const event = getDeterministicEvent(serverId, runRandomSeed, roundNumber, slot, previousEvent === 'SURVIVE THE DOOMSDAY' ? ['SURVIVE THE DOOMSDAY'] : []);
    serverAnnouncement = event;
    currentEventStartedAt = eventStartedAt;

    if (event === 'Something will explode') {
      const explodedObject = getDeterministicExplosiveObject(serverId, runRandomSeed, roundNumber, slot, hiddenArenaObjects);
      const fallbackBounds = getFallbackFireBounds(serverId, runRandomSeed, roundNumber, slot);

      if (explodedObject) {
        const bounds = getBaseObjectBounds(explodedObject) ?? fallbackBounds;

        hiddenArenaObjects.push(explodedObject);
        fireHazards.push({
          id: `${roundNumber}-${slot}-${explodedObject}`,
          objectId: explodedObject,
          bounds,
          startedAt: eventStartedAt,
        });
      } else {
        fireHazards.push({
          id: `${roundNumber}-${slot}-fallback-fire`,
          objectId: '',
          bounds: fallbackBounds,
          startedAt: eventStartedAt,
        });
      }
    }

    if (event === 'SURVIVE THE DOOMSDAY' && !suppressDangerEvents) {
      const strikesPerEvent = Math.floor(postDoomsdayEventDelay * 1000 / doomsdayInterval);
      const realPlayer = players.find((player) => !isBotClientId(player.clientId));
      const fallbackTarget = realPlayer?.position ?? { x: worldWidth / 2, y: worldHeight / 2 };

      for (let strikeIndex = 0; strikeIndex < strikesPerEvent; strikeIndex += 1) {
        const strikeStartedAt = eventStartedAt + strikeIndex * doomsdayInterval;
        const strikeTarget = getPositionAt(playerPositionHistory, strikeStartedAt - 2000, fallbackTarget);
        const strike = getDeterministicDoomsdayStrike(roundNumber, slot, strikeIndex, strikeStartedAt, strikeTarget);
        const isVisible = now >= strike.startedAt && now < strike.hitAt + doomsdayPostHitDuration;
        const hasHit = now >= strike.hitAt;

        if (isVisible) doomsdayStrikes.push(strike);

        if (hasHit) {
          explosiveObjects.forEach((objectId) => {
            if (hiddenArenaObjects.includes(objectId)) return;
            const bounds = getBaseObjectBounds(objectId);
            if (!bounds || !doomsdayStrikeHitsBounds(strike, bounds)) return;

            hiddenArenaObjects.push(objectId);
            fireHazards.push({
              id: `${roundNumber}-${slot}-${strikeIndex}-${objectId}`,
              objectId,
              bounds,
              startedAt: strike.hitAt,
            });
          });
        }
      }
    }

    if (event === 'Zombie apocalypse' && !suppressDangerEvents) {
      if (now >= eventStartedAt) {
        const activeObstacleBounds = getActiveObjectBounds(hiddenArenaObjects);

        clientIds.forEach((targetClientId) => {
          const spawn = getDeterministicZombieSpawn(serverId, runRandomSeed, roundNumber, slot, targetClientId, clientIds);
          const targetPlayer = getNearestAliveStickman(spawn, players);
          const targetPosition = targetPlayer?.position ?? getSpawnSlot('arena', targetClientId, clientIds);
          const zombiePosition = getZombiePosition(spawn, targetPosition, now - eventStartedAt, activeObstacleBounds);

          zombies.push({
            id: `${roundNumber}-${slot}-${targetClientId}`,
            spawnedAt: eventStartedAt,
            position: zombiePosition,
            targetClientId: targetPlayer?.clientId ?? targetClientId,
          });
        });
      }
    }

    const targetClientId = getDeterministicTarget(clientIds, serverId, runRandomSeed, roundNumber, slot);
    const playerEventActive = now < eventStartedAt + playerEventEffectDuration;

    if (playerEventActive && event === 'Someone will get a sword' && targetClientId) {
      targetedEffects.sword.push(targetClientId);
    }

    if (playerEventActive && event === 'Someone will find out they are rapid' && targetClientId) {
      targetedEffects.rapid.push(targetClientId);
    }

    if (playerEventActive && event === 'Someone will get their leg lost' && targetClientId) {
      targetedEffects.missingRightLeg.push(targetClientId);
    }

    if (playerEventActive && event === 'Someone will turn blue' && targetClientId) {
      targetedEffects.red = targetedEffects.red.filter((clientId) => clientId !== targetClientId);
      targetedEffects.green = targetedEffects.green.filter((clientId) => clientId !== targetClientId);
      targetedEffects.blue.push(targetClientId);
    }

    if (playerEventActive && event === 'Someone will turn red' && targetClientId) {
      targetedEffects.blue = targetedEffects.blue.filter((clientId) => clientId !== targetClientId);
      targetedEffects.green = targetedEffects.green.filter((clientId) => clientId !== targetClientId);
      targetedEffects.red.push(targetClientId);
    }

    if (playerEventActive && event === 'Someone will turn green' && targetClientId) {
      targetedEffects.blue = targetedEffects.blue.filter((clientId) => clientId !== targetClientId);
      targetedEffects.red = targetedEffects.red.filter((clientId) => clientId !== targetClientId);
      targetedEffects.green.push(targetClientId);
    }

    if (event === 'FREEZE' && targetClientId) {
      if (now < eventStartedAt + freezeDuration) {
        targetedEffects.frozen.push(targetClientId);
        targetedEffects.frozenIds.push(`${roundNumber}-${slot}-${targetClientId}`);
      }
    }

    previousEvent = event;
    nextEventSecond += event === 'SURVIVE THE DOOMSDAY' ? postDoomsdayEventDelay : eventInterval;
  }

  return {
    phase: 'arena',
    timeLeft: arenaElapsed,
    roundEndsAt: Number.POSITIVE_INFINITY,
    hiddenArenaObjects,
    serverAnnouncement,
    arenaElapsed,
    roundNumber,
    eventSlot,
    currentEventStartedAt,
    targetedEffects,
    fireHazards: fireHazards.filter((hazard) => now - hazard.startedAt < fireDuration),
    doomsdayStrikes,
    zombies,
  };
}

function getSpawnSlot(nextPhase: GamePhase, clientId: string, clientIds: string[]) {
  const spawnSlots = nextPhase === 'lobby' ? lobbySpawnSlots : arenaSpawnSlots;
  const sortedClientIds = clientIds.length > 0 ? [...clientIds].sort() : [clientId];
  const slotIndex = Math.max(0, sortedClientIds.indexOf(clientId)) % spawnSlots.length;
  return spawnSlots[slotIndex];
}

function PlayerAvatar({
  player,
  position,
  isLocal,
  equippedItem = 'sword',
  positionUnit = 'px',
}: {
  player: PlayerSnapshot;
  position: Position;
  isLocal?: boolean;
  equippedItem?: 'sword' | 'gun';
  positionUnit?: 'px' | '%';
}) {
  if (player.phase === 'arena' && player.isDead) return null;

  return (
    <div
      className={`player ${isLocal ? 'current-player' : 'remote-player'} ${player.direction} ${
        player.isBlue ? 'blue-player' : ''
      } ${player.isRed ? 'red-player' : ''} ${player.isGreen ? 'green-player' : ''} ${
        player.isFrozen ? 'frozen-player' : ''
      } ${player.missingRightLeg ? 'missing-right-leg' : ''}`}
      style={{ left: `${position.x}${positionUnit}`, top: `${position.y}${positionUnit}` }}
    >
      <div className="nameplate">{player.nickname}</div>
      {player.phase === 'arena' && (
        <div className="health-bar" aria-label="Health">
          <span style={{ width: `${Math.min(100, player.health)}%` }} />
        </div>
      )}
      <div className="stickman">
        <span className="head" />
        <span className="torso" />
        <span className="arm left-arm" />
        <span className="arm right-arm" />
        <span className="leg left-leg" />
        <span className="leg right-leg" />
        {player.phase === 'arena' && player.hasSword && equippedItem === 'sword' && (
          <button
            type="button"
            className={`classic-sword ${player.swordSwinging ? 'swing' : ''}`}
            aria-label="Swing sword"
            tabIndex={-1}
          >
            <span className="sword-blade" />
            <span className="sword-guard" />
            <span className="sword-handle" />
          </button>
        )}
        {player.phase === 'arena' && equippedItem === 'gun' && (
          <span className="classic-gun" aria-hidden="true">
            <span className="gun-sight" />
            <span className="gun-barrel" />
            <span className="gun-muzzle" />
            <span className="gun-slide" />
            <span className="gun-body" />
            <span className="gun-trigger" />
            <span className="gun-trigger-guard" />
            <span className="gun-grip" />
          </span>
        )}
      </div>
    </div>
  );
}

function createBots(nextBotIds: string[], now: number): BotSnapshot[] {
  return nextBotIds.map((botId, index) => ({
    kind: 'bot',
    clientId: botId,
    userId: botId,
    nickname: botNames[botId] ?? `Bot ${botId.replace('bot-', '')}`,
    joinedAt: now,
    position: botSpawnSlots[botId] ?? arenaSpawnSlots[index + 1] ?? arenaSpawnSlots[0],
    direction: 'front',
    phase: 'arena',
    hasSword: false,
    isBlue: false,
    isRed: false,
    isGreen: false,
    isFrozen: false,
    isRapid: false,
    missingRightLeg: false,
    swordSwinging: false,
    health: botMaxHealth,
    isDead: false,
    updatedAt: now,
  }));
}

function createInitialBots(now: number): BotSnapshot[] {
  return createBots(initialBotIds, now);
}

function ZombieAvatar({ zombie, position, isTargeted }: { zombie?: Zombie; position: Position; isTargeted?: boolean }) {
  const isKing = zombie?.kind === 'king';
  const health = zombie?.health ?? zombie?.maxHealth;
  const maxHealth = zombie?.maxHealth ?? health;

  return (
    <div
      className={`zombie ${isKing ? 'zombie-king' : ''} ${isTargeted ? 'zombie-targeted' : ''} ${zombie?.direction ?? 'front'}`}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
    >
      {isKing && <div className="zombie-crown">KING</div>}
      {health !== undefined && maxHealth !== undefined && (
        <div className="zombie-health" aria-label="Zombie health">
          <span style={{ width: `${Math.max(0, Math.min(100, (health / maxHealth) * 100))}%` }} />
        </div>
      )}
      <div className="zombie-stickman">
        <span className="head" />
        <span className="torso" />
        <span className="arm left-arm" />
        <span className="arm right-arm" />
        <span className="leg left-leg" />
        <span className="leg right-leg" />
        {isKing && (
          <span className={`classic-sword zombie-sword ${zombie?.swordSwinging ? 'swing' : ''}`} aria-hidden="true">
            <span className="sword-blade" />
            <span className="sword-guard" />
            <span className="sword-handle" />
          </span>
        )}
      </div>
    </div>
  );
}

export function Lobby({ nickname, userId, onMenuOpenChange }: LobbyProps) {
  const clientId = useMemo(() => getClientId(userId), [userId]);
  const joinedAtRef = useRef(Date.now());
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [menuOpen, setMenuOpen] = useState(true);
  const [menuPanel, setMenuPanel] = useState<MenuPanel>('main');
  const [isPaused, setIsPaused] = useState(false);
  const [timeLeft, setTimeLeft] = useState(lobbyDuration);
  const [roundEndsAt, setRoundEndsAt] = useState(() => Date.now() + lobbyDuration * 1000);
  const [position, setPosition] = useState<Position>(lobbySpawnSlots[0]);
  const [direction, setDirection] = useState<Direction>('front');
  const [shopOpen, setShopOpen] = useState(false);
  const [shopDismissed, setShopDismissed] = useState(false);
  const [swordSwinging, setSwordSwinging] = useState(false);
  const [serverAnnouncement, setServerAnnouncement] = useState('');
  const [hasSword, setHasSword] = useState(false);
  const [isRapid, setIsRapid] = useState(false);
  const [missingRightLeg, setMissingRightLeg] = useState(false);
  const [isBlue, setIsBlue] = useState(false);
  const [isRed, setIsRed] = useState(false);
  const [isGreen, setIsGreen] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);
  const [hiddenArenaObjects, setHiddenArenaObjects] = useState<string[]>([]);
  const [fireHazards, setFireHazards] = useState<FireHazard[]>([]);
  const [doomsdayStrikes, setDoomsdayStrikes] = useState<DoomsdayStrike[]>([]);
  const [zombies, setZombies] = useState<Zombie[]>([]);
  const [zombieKing, setZombieKing] = useState<Zombie | null>(null);
  const [kingZombies, setKingZombies] = useState<Zombie[]>([]);
  const [equippedItem, setEquippedItem] = useState<'sword' | 'gun'>('sword');
  const [bots, setBots] = useState<BotSnapshot[]>(() => createInitialBots(Date.now()));
  const [arenaMode, setArenaMode] = useState<ArenaMode>('main');
  const [duelState, setDuelState] = useState<DuelState | null>(null);
  const [deathMessage, setDeathMessage] = useState('');
  const [health, setHealth] = useState(100);
  const [isDead, setIsDead] = useState(false);
  const [roomStartedAt, setRoomStartedAt] = useState(joinedAtRef.current);
  const [roundSeed, setRoundSeed] = useState(0);
  const [runRandomSeed, setRunRandomSeed] = useState(() => createRunRandomSeed());
  const [spawnPlaced, setSpawnPlaced] = useState(false);
  const [musicRetryKey, setMusicRetryKey] = useState(0);
  const [arenaMusicIndex, setArenaMusicIndex] = useState(0);
  const [targetedZombieId, setTargetedZombieId] = useState<string | null>(null);
  const pressedKeys = useRef(new Set<string>());
  const frameRef = useRef<HTMLDivElement | null>(null);
  const menuMusicRef = useRef<HTMLAudioElement | null>(null);
  const lobbyMusicRef = useRef<HTMLAudioElement | null>(null);
  const arenaMusicRef = useRef<HTMLAudioElement | null>(null);
  const arenaSecondMusicRef = useRef<HTMLAudioElement | null>(null);
  const lobbyMusicEnabledRef = useRef(false);
  const swordTimerRef = useRef<number | null>(null);
  const swordSwingStartedAtRef = useRef(0);
  const playerSnapshotRef = useRef<PlayerSnapshot | null>(null);
  const positionRef = useRef(position);
  const botsRef = useRef(bots);
  const isDeadRef = useRef(isDead);
  const damagedFireIdsRef = useRef(new Set<string>());
  const damagedDoomsdayIdsRef = useRef(new Set<string>());
  const killedZombieIdsRef = useRef(new Set<string>());
  const damagedZombieIdsRef = useRef(new Set<string>());
  const zombiePositionCacheRef = useRef(new Map<string, Position>());
  const zombiePositionUpdatedAtRef = useRef(Date.now());
  const zombieKingRef = useRef<Zombie | null>(null);
  const kingZombiesRef = useRef<Zombie[]>([]);
  const nextZombieKingSpawnAtRef = useRef(0);
  const playerPositionHistoryRef = useRef<Array<{ position: Position; recordedAt: number }>>([]);
  const handledEventIdsRef = useRef(new Set<string>());
  const damagedBotSwingIdsRef = useRef(new Set<string>());
  const damagedBotFireIdsRef = useRef(new Set<string>());
  const damagedBotDoomsdayIdsRef = useRef(new Set<string>());
  const botFleeStartsRef = useRef(new Map<string, Position>());
  const botWanderTargetsRef = useRef(new Map<string, Position>());
  const botLastAnglesRef = useRef(new Map<string, number>());
  const botStuckRef = useRef(new Map<string, { position: Position; ticks: number }>());
  const botDeadAtRef = useRef(new Map<string, number>());
  const botEventImmuneUntilRef = useRef(new Map<string, number>());
  const playerFrozenUntilRef = useRef(0);
  const stickmanHitAtRef = useRef(new Map<string, number>());
  const destroyedArenaObjectsRef = useRef(new Set<string>());
  const kingSpawnedAfterBotsRef = useRef(false);
  const hydratedRunRef = useRef(false);
  const pauseStartedAtRef = useRef(0);
  const invulnerableUntilRef = useRef(0);
  const deathReturnAtRef = useRef(0);
  const gameStateRef = useRef<GameStateSnapshot>({
    phase: 'lobby',
    roundEndsAt: Date.now() + lobbyDuration * 1000,
    hiddenArenaObjects: [],
    serverAnnouncement: '',
  });
  const movementStep = isRapid && phase === 'arena' ? rapidStep : baseStep;
  const playerInActiveDuel = Boolean(duelState?.fighters.includes(clientId));
  const gameStopped = menuOpen || isPaused;
  const canMove = !gameStopped && !isDead && !isFrozen && (phase === 'lobby' || arenaMode === 'main' || playerInActiveDuel);

  const displayName = useMemo(() => {
    const trimmed = nickname.trim();
    return trimmed.length > 0 ? trimmed : 'Player';
  }, [nickname]);
  const playerSnapshot = useMemo<PlayerSnapshot>(
    () => ({
      clientId,
      userId,
      nickname: displayName,
      joinedAt: joinedAtRef.current,
      position,
      direction,
      phase,
      hasSword,
      isBlue,
      isRed,
      isGreen,
      isFrozen,
      missingRightLeg,
      swordSwinging,
      health,
      isDead,
      updatedAt: Date.now(),
    }),
    [
      clientId,
      direction,
      displayName,
      hasSword,
      health,
      isBlue,
      isDead,
      isFrozen,
      isGreen,
      isRed,
      missingRightLeg,
      phase,
      position,
      swordSwinging,
      userId,
    ],
  );
  const roomPlayerIds = useMemo(() => [clientId, ...botIds], [clientId]);
  const roomPlayerIdsRef = useRef(roomPlayerIds);

  useEffect(() => {
    const savedRun = readSavedLobbyRun(clientId);
    hydratedRunRef.current = true;
    if (!savedRun) return;

    const restoredAt = Date.now();
    const pauseDuration = savedRun.isPaused ? Math.max(0, restoredAt - savedRun.savedAt) : 0;
    const restoredRoundEndsAt = shiftFiniteTimestamp(savedRun.roundEndsAt, pauseDuration);
    const restoredRoomStartedAt = savedRun.roomStartedAt + pauseDuration;
    const restoredFireHazards = savedRun.fireHazards.map((hazard) => ({
      ...hazard,
      startedAt: hazard.startedAt + pauseDuration,
    }));
    const restoredDoomsdayStrikes = savedRun.doomsdayStrikes.map((strike) => ({
      ...strike,
      startedAt: strike.startedAt + pauseDuration,
      hitAt: strike.hitAt + pauseDuration,
    }));
    const restoredZombies = savedRun.zombies.map((zombie) => ({
      ...zombie,
      spawnedAt: zombie.spawnedAt + pauseDuration,
    }));
    const restoredZombieKing = savedRun.zombieKing
      ? {
          ...savedRun.zombieKing,
          spawnedAt: savedRun.zombieKing.spawnedAt + pauseDuration,
        }
      : null;
    const restoredKingZombies = savedRun.kingZombies.map((zombie) => ({
      ...zombie,
      spawnedAt: zombie.spawnedAt + pauseDuration,
    }));
    const restoredDuelState = savedRun.duelState
      ? {
          ...savedRun.duelState,
          startedAt: savedRun.duelState.startedAt + pauseDuration,
        }
      : null;
    const restoredDeathReturnAt = shiftActiveTimestamp(savedRun.deathReturnAt, pauseDuration);
    const restoredInvulnerableUntil = shiftActiveTimestamp(savedRun.invulnerableUntil, pauseDuration);
    const restoredNextZombieKingSpawnAt = shiftActiveTimestamp(savedRun.nextZombieKingSpawnAt, pauseDuration);
    const restoredBotDeadAt = savedRun.botDeadAt.map(([botId, deadAt]) => [botId, deadAt + pauseDuration] as [string, number]);
    const restoredBotEventImmuneUntil = savedRun.botEventImmuneUntil.map(([botId, immuneUntil]) => [botId, immuneUntil + pauseDuration] as [string, number]);
    const restoredPlayerPositionHistory = savedRun.playerPositionHistory.map((entry) => ({
      ...entry,
      recordedAt: entry.recordedAt + pauseDuration,
    }));

    lobbyMusicEnabledRef.current = !savedRun.menuOpen;
    joinedAtRef.current = savedRun.joinedAt;
    setPhase(savedRun.phase);
    setMenuOpen(savedRun.menuOpen);
    setMenuPanel(savedRun.menuPanel);
    setIsPaused(savedRun.isPaused);
    setTimeLeft(savedRun.timeLeft);
    setRoundEndsAt(restoredRoundEndsAt);
    setRoomStartedAt(restoredRoomStartedAt);
    setRoundSeed(savedRun.roundSeed);
    setRunRandomSeed(savedRun.runRandomSeed ?? createRunRandomSeed());
    setSpawnPlaced(savedRun.spawnPlaced);
    setPosition(savedRun.position);
    setDirection(savedRun.direction);
    setShopOpen(savedRun.shopOpen);
    setShopDismissed(savedRun.shopDismissed);
    setSwordSwinging(savedRun.swordSwinging);
    setServerAnnouncement(savedRun.serverAnnouncement);
    setHasSword(savedRun.hasSword);
    setIsRapid(savedRun.isRapid);
    setMissingRightLeg(savedRun.missingRightLeg);
    setIsBlue(savedRun.isBlue);
    setIsRed(savedRun.isRed);
    setIsGreen(savedRun.isGreen);
    setIsFrozen(savedRun.isFrozen);
    setHiddenArenaObjects(savedRun.hiddenArenaObjects);
    setFireHazards(restoredFireHazards);
    setDoomsdayStrikes(restoredDoomsdayStrikes);
    setZombies(restoredZombies);
    setZombieKing(restoredZombieKing);
    setKingZombies(restoredKingZombies);
    setEquippedItem(savedRun.equippedItem);
    setBots(savedRun.bots);
    setArenaMode(savedRun.arenaMode);
    setDuelState(restoredDuelState);
    setDeathMessage(savedRun.deathMessage);
    setHealth(savedRun.health);
    setIsDead(savedRun.isDead);

    positionRef.current = savedRun.position;
    botsRef.current = savedRun.bots;
    isDeadRef.current = savedRun.isDead;
    swordSwingStartedAtRef.current = savedRun.swordSwingStartedAt;
    destroyedArenaObjectsRef.current = new Set(savedRun.destroyedArenaObjects);
    zombieKingRef.current = restoredZombieKing;
    kingZombiesRef.current = restoredKingZombies;
    nextZombieKingSpawnAtRef.current = restoredNextZombieKingSpawnAt;
    kingSpawnedAfterBotsRef.current = savedRun.kingSpawnedAfterBots;
    deathReturnAtRef.current = restoredDeathReturnAt;
    invulnerableUntilRef.current = restoredInvulnerableUntil;
    playerFrozenUntilRef.current = savedRun.isFrozen ? restoredAt + freezeDuration : 0;
    pauseStartedAtRef.current = savedRun.isPaused ? restoredAt : 0;
    killedZombieIdsRef.current = new Set(savedRun.killedZombieIds);
    damagedZombieIdsRef.current = new Set(savedRun.damagedZombieIds);
    damagedFireIdsRef.current = new Set(savedRun.damagedFireIds);
    damagedDoomsdayIdsRef.current = new Set(savedRun.damagedDoomsdayIds);
    handledEventIdsRef.current = new Set(savedRun.handledEventIds);
    damagedBotSwingIdsRef.current = new Set(savedRun.damagedBotSwingIds);
    damagedBotFireIdsRef.current = new Set(savedRun.damagedBotFireIds);
    damagedBotDoomsdayIdsRef.current = new Set(savedRun.damagedBotDoomsdayIds);
    botDeadAtRef.current = new Map(restoredBotDeadAt);
    botEventImmuneUntilRef.current = new Map(restoredBotEventImmuneUntil);
    playerPositionHistoryRef.current = restoredPlayerPositionHistory;
    gameStateRef.current = {
      phase: savedRun.phase,
      roundEndsAt: restoredRoundEndsAt,
      hiddenArenaObjects: savedRun.hiddenArenaObjects,
      serverAnnouncement: savedRun.serverAnnouncement,
    };
  }, [clientId]);

  useEffect(() => {
    playerSnapshotRef.current = playerSnapshot;
  }, [playerSnapshot]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    botsRef.current = bots;
  }, [bots]);

  useEffect(() => {
    zombieKingRef.current = zombieKing;
  }, [zombieKing]);

  useEffect(() => {
    kingZombiesRef.current = kingZombies;
  }, [kingZombies]);

  useEffect(() => {
    if (!isZombieKingAlive(zombieKing) && kingZombies.length > 0) {
      clearKingZombies();
      nextZombieKingSpawnAtRef.current = 0;
    }
  }, [kingZombies, zombieKing]);

  useEffect(() => {
    if (gameStopped || phase !== 'arena' || arenaMode !== 'main') return;
    if (kingSpawnedAfterBotsRef.current || bots.length === 0 || !bots.every((bot) => bot.isDead)) return;

    kingSpawnedAfterBotsRef.current = true;
    spawnZombieKing();
  }, [arenaMode, bots, gameStopped, phase]);

  useEffect(() => {
    isDeadRef.current = isDead;
  }, [isDead]);

  useEffect(() => {
    roomPlayerIdsRef.current = roomPlayerIds;
  }, [roomPlayerIds]);

  useEffect(() => {
    onMenuOpenChange?.(menuOpen);
  }, [menuOpen, onMenuOpenChange]);

  useEffect(() => {
    if (spawnPlaced) return;
    setPosition(getSpawnPosition(phase, clientId, roomPlayerIds));
    setSpawnPlaced(true);
  }, [clientId, phase, roomPlayerIds, spawnPlaced]);

  useEffect(() => {
    gameStateRef.current = {
      phase,
      roundEndsAt,
      hiddenArenaObjects,
      serverAnnouncement,
    };
  }, [hiddenArenaObjects, phase, roundEndsAt, serverAnnouncement]);

  useEffect(() => {
    if (!hydratedRunRef.current || menuOpen) return;

    const savedRun: SavedLobbyRunV1 = {
      version: savedRunVersion,
      savedAt: Date.now(),
      joinedAt: joinedAtRef.current,
      phase,
      menuOpen,
      menuPanel,
      isPaused,
      timeLeft,
      roundEndsAt,
      roomStartedAt,
      roundSeed,
      runRandomSeed,
      spawnPlaced,
      position,
      direction,
      shopOpen,
      shopDismissed,
      swordSwinging,
      swordSwingStartedAt: swordSwingStartedAtRef.current,
      serverAnnouncement,
      hasSword,
      isRapid,
      missingRightLeg,
      isBlue,
      isRed,
      isGreen,
      isFrozen,
      hiddenArenaObjects,
      destroyedArenaObjects: Array.from(destroyedArenaObjectsRef.current),
      fireHazards,
      doomsdayStrikes,
      zombies,
      zombieKing,
      kingZombies,
      equippedItem,
      bots,
      arenaMode,
      duelState,
      deathMessage,
      health,
      isDead,
      deathReturnAt: deathReturnAtRef.current,
      invulnerableUntil: invulnerableUntilRef.current,
      nextZombieKingSpawnAt: nextZombieKingSpawnAtRef.current,
      kingSpawnedAfterBots: kingSpawnedAfterBotsRef.current,
      killedZombieIds: Array.from(killedZombieIdsRef.current),
      damagedZombieIds: Array.from(damagedZombieIdsRef.current),
      damagedFireIds: Array.from(damagedFireIdsRef.current),
      damagedDoomsdayIds: Array.from(damagedDoomsdayIdsRef.current),
      handledEventIds: Array.from(handledEventIdsRef.current),
      damagedBotSwingIds: Array.from(damagedBotSwingIdsRef.current),
      damagedBotFireIds: Array.from(damagedBotFireIdsRef.current),
      damagedBotDoomsdayIds: Array.from(damagedBotDoomsdayIdsRef.current),
      botDeadAt: Array.from(botDeadAtRef.current.entries()),
      botEventImmuneUntil: Array.from(botEventImmuneUntilRef.current.entries()),
      playerPositionHistory: playerPositionHistoryRef.current,
    };

    writeSavedLobbyRun(clientId, savedRun);
  }, [
    arenaMode,
    bots,
    clientId,
    deathMessage,
    direction,
    doomsdayStrikes,
    duelState,
    equippedItem,
    fireHazards,
    hasSword,
    health,
    hiddenArenaObjects,
    isBlue,
    isDead,
    isFrozen,
    isGreen,
    isPaused,
    isRapid,
    isRed,
    kingZombies,
    menuOpen,
    menuPanel,
    missingRightLeg,
    phase,
    position,
    roomStartedAt,
    roundEndsAt,
    roundSeed,
    runRandomSeed,
    serverAnnouncement,
    shopDismissed,
    shopOpen,
    spawnPlaced,
    swordSwinging,
    timeLeft,
    zombieKing,
    zombies,
  ]);

  function applyRoundSnapshot(nextSnapshot: RoundSnapshot) {
    const phaseChanged = gameStateRef.current.phase !== nextSnapshot.phase;
    const enteringLobby = phaseChanged && nextSnapshot.phase === 'lobby';
    const mergedHiddenArenaObjects =
      nextSnapshot.phase === 'arena'
        ? Array.from(new Set([...destroyedArenaObjectsRef.current, ...nextSnapshot.hiddenArenaObjects]))
        : [];

    if (nextSnapshot.phase === 'arena') {
      destroyedArenaObjectsRef.current = new Set(mergedHiddenArenaObjects);
    } else {
      destroyedArenaObjectsRef.current.clear();
    }

    gameStateRef.current = {
      phase: nextSnapshot.phase,
      roundEndsAt: nextSnapshot.roundEndsAt,
      hiddenArenaObjects: mergedHiddenArenaObjects,
      serverAnnouncement: nextSnapshot.serverAnnouncement,
    };

    if (phaseChanged) {
      setPosition(getSpawnPosition(nextSnapshot.phase, clientId, roomPlayerIdsRef.current));
      setDirection('front');
      pressedKeys.current.clear();
      setSwordSwinging(false);
      setHealth(100);
      setIsDead(false);
      setHasSword(false);
      setIsRapid(false);
      setMissingRightLeg(false);
      setIsBlue(false);
      setIsRed(false);
      setIsGreen(false);
      setIsFrozen(false);
      setDeathMessage('');
      setIsPaused(false);
      setZombieKing(null);
      setKingZombies([]);
      setEquippedItem('sword');
      pauseStartedAtRef.current = 0;
      deathReturnAtRef.current = 0;
      nextZombieKingSpawnAtRef.current = 0;
      kingSpawnedAfterBotsRef.current = false;
      playerFrozenUntilRef.current = 0;
      setArenaMode('main');
      setDuelState(null);
      setBots(nextSnapshot.phase === 'arena' ? createInitialBots(Date.now()) : []);
      damagedFireIdsRef.current.clear();
      damagedDoomsdayIdsRef.current.clear();
      killedZombieIdsRef.current.clear();
      damagedZombieIdsRef.current.clear();
      handledEventIdsRef.current.clear();
      damagedBotSwingIdsRef.current.clear();
      damagedBotFireIdsRef.current.clear();
      damagedBotDoomsdayIdsRef.current.clear();
      botFleeStartsRef.current.clear();
      botWanderTargetsRef.current.clear();
      botLastAnglesRef.current.clear();
      botStuckRef.current.clear();
      botDeadAtRef.current.clear();
      botEventImmuneUntilRef.current.clear();
      destroyedArenaObjectsRef.current.clear();
      kingZombiesRef.current = [];
      zombieKingRef.current = null;
      kingSpawnedAfterBotsRef.current = false;
      stickmanHitAtRef.current.clear();
      invulnerableUntilRef.current = 0;
      playerFrozenUntilRef.current = 0;
    }

    setPhase(nextSnapshot.phase);
    setTimeLeft(nextSnapshot.timeLeft);
    setRoundEndsAt(nextSnapshot.roundEndsAt);
    setHiddenArenaObjects(mergedHiddenArenaObjects);
    setFireHazards(nextSnapshot.fireHazards);
    setDoomsdayStrikes(nextSnapshot.doomsdayStrikes);
    setZombies(getSmoothedZombies(nextSnapshot.zombies, mergedHiddenArenaObjects, nextSnapshot.phase));
    setServerAnnouncement(nextSnapshot.serverAnnouncement);
    const playerIsDuelFighter = Boolean(duelState?.fighters.includes(clientId));
    setHasSword((current) => !enteringLobby && !isDead && (current || nextSnapshot.targetedEffects.sword.includes(clientId) || playerIsDuelFighter));
    setIsRapid((current) => !enteringLobby && !isDead && (current || nextSnapshot.targetedEffects.rapid.includes(clientId)));
    setMissingRightLeg((current) => !enteringLobby && !isDead && (current || nextSnapshot.targetedEffects.missingRightLeg.includes(clientId)));
    setIsBlue((current) => {
      if (enteringLobby || isDead) return false;
      if (nextSnapshot.targetedEffects.blue.includes(clientId)) return true;
      if (nextSnapshot.targetedEffects.red.includes(clientId) || nextSnapshot.targetedEffects.green.includes(clientId)) return false;
      return current;
    });
    setIsRed((current) => {
      if (enteringLobby || isDead) return false;
      if (nextSnapshot.targetedEffects.red.includes(clientId)) return true;
      if (nextSnapshot.targetedEffects.blue.includes(clientId) || nextSnapshot.targetedEffects.green.includes(clientId)) return false;
      return current;
    });
    setIsGreen((current) => {
      if (enteringLobby || isDead) return false;
      if (nextSnapshot.targetedEffects.green.includes(clientId)) return true;
      if (nextSnapshot.targetedEffects.blue.includes(clientId) || nextSnapshot.targetedEffects.red.includes(clientId)) return false;
      return current;
    });
    if (enteringLobby || isDead) {
      playerFrozenUntilRef.current = 0;
      setIsFrozen(false);
    } else if (nextSnapshot.targetedEffects.frozen.includes(clientId)) {
      playerFrozenUntilRef.current = Math.max(playerFrozenUntilRef.current, Date.now() + freezeDuration);
      setIsFrozen(true);
    } else if (playerFrozenUntilRef.current > 0 && Date.now() >= playerFrozenUntilRef.current) {
      playerFrozenUntilRef.current = 0;
      setIsFrozen(false);
    }

    setBots((currentBots) =>
      currentBots.map((bot) => {
        const now = Date.now();
        const isDuelFighter = Boolean(duelState?.fighters.includes(bot.clientId));
        const eventImmune = now < (botEventImmuneUntilRef.current.get(bot.clientId) ?? 0);
        const canReceiveEvent = !bot.isDead && !eventImmune;
        const receivesBlue = canReceiveEvent && nextSnapshot.targetedEffects.blue.includes(bot.clientId);
        const receivesRed = canReceiveEvent && nextSnapshot.targetedEffects.red.includes(bot.clientId);
        const receivesGreen = canReceiveEvent && nextSnapshot.targetedEffects.green.includes(bot.clientId);

        return {
          ...bot,
          phase: nextSnapshot.phase,
          hasSword: !bot.isDead && (bot.hasSword || isDuelFighter || (canReceiveEvent && nextSnapshot.targetedEffects.sword.includes(bot.clientId))),
          isRapid: canReceiveEvent && nextSnapshot.targetedEffects.rapid.includes(bot.clientId),
          isBlue: !bot.isDead && (receivesBlue || (bot.isBlue && !receivesRed && !receivesGreen)),
          isRed: !bot.isDead && (receivesRed || (bot.isRed && !receivesBlue && !receivesGreen)),
          isGreen: !bot.isDead && (receivesGreen || (bot.isGreen && !receivesBlue && !receivesRed)),
          isFrozen: canReceiveEvent && nextSnapshot.targetedEffects.frozen.includes(bot.clientId),
          missingRightLeg: canReceiveEvent && nextSnapshot.targetedEffects.missingRightLeg.includes(bot.clientId),
        };
      }),
    );

    if (nextSnapshot.phase === 'arena' && nextSnapshot.serverAnnouncement === 'BATTLE TO DEATH') {
      startBattleToDeath(nextSnapshot);
    }
  }

  function damagePlayer(amount: number) {
    if (phase !== 'arena' || isDead) return;

    setHealth((current) => {
      const nextHealth = Math.max(0, current - amount);
      if (nextHealth <= 0) {
        setIsDead(true);
        setDeathMessage(hashText(`${clientId}:${Date.now()}:death`) % 2 === 0 ? 'You died hahaha' : 'You died LOL');
        deathReturnAtRef.current = Date.now() + deathReturnDelay;
        setSwordSwinging(false);
        pressedKeys.current.clear();
      }
      return nextHealth;
    });
  }

  function clearBotMovementState(botId: string) {
    botDeadAtRef.current.delete(botId);
    botEventImmuneUntilRef.current.delete(botId);
    clearBotFleeStarts(botFleeStartsRef.current, botId);
    botWanderTargetsRef.current.delete(botId);
    botLastAnglesRef.current.delete(botId);
    botStuckRef.current.delete(botId);
  }

  function damageBot(botId: string, amount: number) {
    setBots((currentBots) => {
      const nextBots = currentBots.map((bot) => {
        if (bot.clientId !== botId || bot.isDead) return bot;
        const nextHealth = Math.max(0, bot.health - amount);
        const nextIsDead = nextHealth <= 0;
        if (nextIsDead && !botDeadAtRef.current.has(bot.clientId)) {
          botDeadAtRef.current.set(bot.clientId, Date.now());
          botEventImmuneUntilRef.current.delete(bot.clientId);
          botFleeStartsRef.current.delete(bot.clientId);
          botWanderTargetsRef.current.delete(bot.clientId);
          botLastAnglesRef.current.delete(bot.clientId);
          botStuckRef.current.delete(bot.clientId);
        }

        return {
          ...bot,
          health: nextHealth,
          isDead: nextIsDead,
          hasSword: nextIsDead ? false : bot.hasSword,
          isRapid: nextIsDead ? false : bot.isRapid,
          isBlue: nextIsDead ? false : bot.isBlue,
          isRed: nextIsDead ? false : bot.isRed,
          isGreen: nextIsDead ? false : bot.isGreen,
          isFrozen: nextIsDead ? false : bot.isFrozen,
          missingRightLeg: nextIsDead ? false : bot.missingRightLeg,
          swordSwinging: nextIsDead ? false : bot.swordSwinging,
        };
      });

      return nextBots;
    });
  }

  function damageKingZombie(zombieId: string, amount: number) {
    setKingZombies((currentZombies) =>
      currentZombies.map((zombie) => {
        if (zombie.id !== zombieId || killedZombieIdsRef.current.has(zombie.id)) return zombie;
        const nextHealth = Math.max(0, (zombie.health ?? zombieMinionMaxHealth) - amount);
        if (nextHealth <= 0) killedZombieIdsRef.current.add(zombie.id);
        return { ...zombie, health: nextHealth };
      }),
    );
  }

  function respawnDeadBotsAfterKingDeath(now = Date.now()) {
    const currentBots = botsRef.current;
    if (!currentBots.some((bot) => bot.isDead)) return;

    const currentPlayerIds = [clientId, ...currentBots.map((bot) => bot.clientId)];
    const nextBots = currentBots.map((bot) => {
      if (!bot.isDead) return bot;

      clearBotMovementState(bot.clientId);

      return {
        ...bot,
        position: getSpawnSlot('arena', bot.clientId, currentPlayerIds),
        direction: 'front' as Direction,
        phase: 'arena' as GamePhase,
        hasSword: false,
        isRapid: false,
        isBlue: false,
        isRed: false,
        isGreen: false,
        isFrozen: false,
        missingRightLeg: false,
        swordSwinging: false,
        health: botMaxHealth,
        isDead: false,
        updatedAt: now,
      };
    });

    botsRef.current = nextBots;
    setBots(nextBots);
    shiftPausedDeadlines(botRespawnEventPauseDuration);
    setRoomStartedAt((current) => current + botRespawnEventPauseDuration);
  }

  function damageZombieKing(amount: number) {
    const currentKing = zombieKingRef.current;
    if (!currentKing || killedZombieIdsRef.current.has(currentKing.id)) return;

    const nextHealth = Math.max(0, (currentKing.health ?? zombieKingMaxHealth) - amount);
    if (nextHealth <= 0) {
      killedZombieIdsRef.current.add(currentKing.id);
      clearKingZombies();
      zombieKingRef.current = null;
      nextZombieKingSpawnAtRef.current = 0;
      setZombieKing(null);
      setEquippedItem('sword');
      respawnDeadBotsAfterKingDeath();
      return;
    }

    const nextKing = { ...currentKing, health: nextHealth, swordSwinging: currentKing.swordSwinging };
    zombieKingRef.current = nextKing;
    setZombieKing(nextKing);
  }

  function getStickmanById(stickmanId: string, nextBots = botsRef.current) {
    if (stickmanId === clientId) return playerSnapshotRef.current;
    return nextBots.find((bot) => bot.clientId === stickmanId);
  }

  function getAliveStickmen(nextBots = botsRef.current) {
    const localSnapshot = playerSnapshotRef.current;
    return [localSnapshot, ...nextBots].filter((stickman): stickman is PlayerSnapshot | BotSnapshot => {
      return Boolean(stickman && stickman.phase === 'arena' && !stickman.isDead);
    });
  }

  function botCanTakeEventDamage(botId: string, now = Date.now()) {
    return now >= (botEventImmuneUntilRef.current.get(botId) ?? 0);
  }

  function isZombieKingAlive(nextKing = zombieKingRef.current) {
    return Boolean(nextKing && !killedZombieIdsRef.current.has(nextKing.id) && (nextKing.health ?? 0) > 0);
  }

  function clearKingZombies() {
    kingZombiesRef.current = [];
    setKingZombies([]);
  }

  function clearArenaCombatState() {
    pressedKeys.current.clear();
    setSwordSwinging(false);
    setServerAnnouncement('');
    setHasSword(false);
    setIsRapid(false);
    setMissingRightLeg(false);
    setIsBlue(false);
    setIsRed(false);
    setIsGreen(false);
    setIsFrozen(false);
    setHiddenArenaObjects([]);
    setFireHazards([]);
    setDoomsdayStrikes([]);
    setZombies([]);
    setZombieKing(null);
    setKingZombies([]);
    setEquippedItem('sword');
    setBots([]);
    setArenaMode('main');
    setDuelState(null);
    setDeathMessage('');
    setHealth(100);
    setIsDead(false);
    setShopOpen(false);
    setShopDismissed(false);

    damagedFireIdsRef.current.clear();
    damagedDoomsdayIdsRef.current.clear();
    killedZombieIdsRef.current.clear();
    damagedZombieIdsRef.current.clear();
    handledEventIdsRef.current.clear();
    damagedBotSwingIdsRef.current.clear();
    damagedBotFireIdsRef.current.clear();
    damagedBotDoomsdayIdsRef.current.clear();
    botFleeStartsRef.current.clear();
    botWanderTargetsRef.current.clear();
    botLastAnglesRef.current.clear();
    botStuckRef.current.clear();
    botDeadAtRef.current.clear();
    botEventImmuneUntilRef.current.clear();
    destroyedArenaObjectsRef.current.clear();
    kingZombiesRef.current = [];
    zombieKingRef.current = null;
    nextZombieKingSpawnAtRef.current = 0;
    kingSpawnedAfterBotsRef.current = false;
    stickmanHitAtRef.current.clear();
    invulnerableUntilRef.current = 0;
    deathReturnAtRef.current = 0;
    playerFrozenUntilRef.current = 0;
    playerPositionHistoryRef.current = [];
    zombiePositionCacheRef.current.clear();
  }

  function clearBattleToDeathArenaEffects() {
    setHiddenArenaObjects([]);
    setFireHazards([]);
    setDoomsdayStrikes([]);
    destroyedArenaObjectsRef.current.clear();
    damagedFireIdsRef.current.clear();
    damagedDoomsdayIdsRef.current.clear();
    damagedBotFireIdsRef.current.clear();
    damagedBotDoomsdayIdsRef.current.clear();
  }

  function spawnZombieKing(now = Date.now()) {
    if (isZombieKingAlive()) return;

    const king: Zombie = {
      id: `zombie-king-${now}`,
      spawnedAt: now,
      source: 'king',
      kind: 'king',
      position: { x: worldWidth / 2, y: worldHeight - 42 },
      targetClientId: clientId,
      health: zombieKingMaxHealth,
      maxHealth: zombieKingMaxHealth,
      direction: 'back',
      swordSwinging: false,
    };

    zombieKingRef.current = king;
    setZombieKing(king);
    setEquippedItem('gun');
    nextZombieKingSpawnAtRef.current = now + zombieKingSpawnInterval;
  }

  function startBattleToDeath(nextSnapshot: RoundSnapshot) {
    const eventId = `${nextSnapshot.roundNumber}:${nextSnapshot.eventSlot}:battle`;
    if (handledEventIdsRef.current.has(eventId) || duelState) return;

    const aliveStickmen = getAliveStickmen();
    const playerIsAlive = aliveStickmen.some((stickman) => stickman.clientId === clientId);
    const opponents = aliveStickmen.filter((stickman) => stickman.clientId !== clientId);
    if (!playerIsAlive || opponents.length === 0) return;

    handledEventIdsRef.current.add(eventId);
    const opponentIndex = hashText(`${eventId}:opponent`) % opponents.length;
    const fighters: [string, string] = [clientId, opponents[opponentIndex].clientId];
    clearBattleToDeathArenaEffects();
    setArenaMode('duel');
    setDuelState({ id: eventId, fighters, startedAt: Date.now() });

    fighters.forEach((fighterId, index) => {
      if (fighterId === clientId) {
        setPosition(duelSpawnSlots[index]);
        setDirection(index === 0 ? 'right' : 'left');
        setHasSword(true);
      }
    });

    setBots((currentBots) =>
      currentBots.map((bot) => {
        const fighterIndex = fighters.indexOf(bot.clientId);
        if (fighterIndex === -1) return bot;

        return {
          ...bot,
          position: duelSpawnSlots[fighterIndex],
          direction: fighterIndex === 0 ? 'right' : 'left',
          hasSword: true,
          swordSwinging: false,
          isFrozen: false,
        };
      }),
    );
  }

  function finishDuel(winnerId: string) {
    setArenaMode('main');
    setDuelState(null);
    invulnerableUntilRef.current = Date.now() + duelReturnGraceDuration;
    damagedFireIdsRef.current.clear();
    damagedDoomsdayIdsRef.current.clear();
    damagedZombieIdsRef.current.clear();
    stickmanHitAtRef.current.clear();

    if (winnerId === clientId) {
      setPosition(postDuelPlayerSpawn);
    }

    setBots((currentBots) =>
      currentBots.map((bot) => {
        if (bot.clientId !== winnerId) return bot;
        const currentPlayerIds = [clientId, ...currentBots.map((currentBot) => currentBot.clientId)];

        return {
          ...bot,
          position: getSpawnSlot('arena', bot.clientId, currentPlayerIds),
          swordSwinging: false,
        };
      }),
    );
  }

  function getRoomPlayerSnapshots() {
    const localSnapshot = playerSnapshotRef.current;
    return localSnapshot ? [localSnapshot, ...botsRef.current] : botsRef.current;
  }

  function getSmoothedZombies(nextZombies: Zombie[], hiddenObjectIds: string[], nextPhase: GamePhase) {
    if (nextPhase !== 'arena') {
      zombiePositionCacheRef.current.clear();
      zombiePositionUpdatedAtRef.current = Date.now();
      return nextZombies;
    }

    const now = Date.now();
    const elapsedMs = Math.min(350, Math.max(0, now - zombiePositionUpdatedAtRef.current));
    const obstacleBounds = getActiveObjectBounds(hiddenObjectIds);
    const activeZombieIds = new Set(nextZombies.map((zombie) => zombie.id));
    const nextCache = new Map<string, Position>();

    nextZombies.forEach((zombie) => {
      const previousPosition = zombiePositionCacheRef.current.get(zombie.id);
      const nextPosition = previousPosition
        ? getZombiePosition(previousPosition, zombie.position, elapsedMs, obstacleBounds)
        : zombie.position;

      nextCache.set(zombie.id, nextPosition);
    });

    zombiePositionCacheRef.current.forEach((_position, zombieId) => {
      if (!activeZombieIds.has(zombieId)) zombiePositionCacheRef.current.delete(zombieId);
    });

    zombiePositionCacheRef.current = nextCache;
    zombiePositionUpdatedAtRef.current = now;

    return nextZombies.map((zombie) => ({
      ...zombie,
      position: nextCache.get(zombie.id) ?? zombie.position,
    }));
  }

  function prepareAudio(audio: HTMLAudioElement | null) {
    if (!audio) return;
    audio.preload = 'auto';
    if (audio.readyState === 0) audio.load();
  }

  function playMusicTrack(audio: HTMLAudioElement | null, loop: boolean) {
    if (!audio) return;
    prepareAudio(audio);
    audio.volume = 0.45;
    audio.loop = loop;
    if (!audio.paused) return;
    void audio.play().catch(() => undefined);
  }

  function stopMusicTrack(audio: HTMLAudioElement | null, reset = true) {
    if (!audio) return;
    audio.pause();
    if (reset) audio.currentTime = 0;
  }

  function playCurrentMusic(nextMenuOpen = menuOpen, nextPhase = phase, nextGameStopped = gameStopped) {
    const activeArenaAudio = arenaMusicIndex === 0 ? arenaMusicRef.current : arenaSecondMusicRef.current;
    const inactiveArenaAudio = arenaMusicIndex === 0 ? arenaSecondMusicRef.current : arenaMusicRef.current;

    if (nextMenuOpen) {
      stopMusicTrack(lobbyMusicRef.current, false);
      stopMusicTrack(arenaMusicRef.current);
      stopMusicTrack(arenaSecondMusicRef.current);
      playMusicTrack(menuMusicRef.current, true);
      return;
    }

    stopMusicTrack(menuMusicRef.current);

    if (nextGameStopped || !lobbyMusicEnabledRef.current) {
      stopMusicTrack(lobbyMusicRef.current, false);
      stopMusicTrack(arenaMusicRef.current, false);
      stopMusicTrack(arenaSecondMusicRef.current, false);
      return;
    }

    if (nextPhase === 'lobby') {
      setArenaMusicIndex(0);
      stopMusicTrack(arenaMusicRef.current);
      stopMusicTrack(arenaSecondMusicRef.current);
      playMusicTrack(lobbyMusicRef.current, true);
      return;
    }

    stopMusicTrack(lobbyMusicRef.current);
    stopMusicTrack(inactiveArenaAudio);
    playMusicTrack(activeArenaAudio, false);
  }

  function startFromMenu() {
    const now = Date.now();
    clearSavedLobbyRun(clientId);
    setRunRandomSeed(createRunRandomSeed());
    pressedKeys.current.clear();
    setShopOpen(false);
    setShopDismissed(false);
    lobbyMusicEnabledRef.current = true;
    setIsPaused(false);
    pauseStartedAtRef.current = 0;
    playCurrentMusic(false, 'lobby', false);
    setMenuOpen(false);
    setMenuPanel('main');
    setRoomStartedAt(now);
    setRoundEndsAt(now + lobbyDuration * 1000);
    setRoundSeed((current) => current + 1);
  }

  function leaveArenaToLobby() {
    const now = Date.now();
    if (swordTimerRef.current) window.clearTimeout(swordTimerRef.current);
    clearArenaCombatState();
    lobbyMusicEnabledRef.current = true;
    playCurrentMusic(false, 'lobby', false);
    setPhase('lobby');
    setMenuOpen(false);
    setMenuPanel('main');
    setIsPaused(false);
    setTimeLeft(lobbyDuration);
    setRoundEndsAt(now + lobbyDuration * 1000);
    setRoomStartedAt(now);
    setRunRandomSeed(createRunRandomSeed());
    setRoundSeed((current) => current + 1);
    setSpawnPlaced(true);
    setPosition(getSpawnPosition('lobby', clientId, roomPlayerIdsRef.current));
    setDirection('front');
    pauseStartedAtRef.current = 0;
    gameStateRef.current = {
      phase: 'lobby',
      roundEndsAt: now + lobbyDuration * 1000,
      hiddenArenaObjects: [],
      serverAnnouncement: '',
    };
  }

  function shiftPausedDeadlines(pauseDuration: number) {
    deathReturnAtRef.current = shiftActiveTimestamp(deathReturnAtRef.current, pauseDuration);
    invulnerableUntilRef.current = shiftActiveTimestamp(invulnerableUntilRef.current, pauseDuration);
    nextZombieKingSpawnAtRef.current = shiftActiveTimestamp(nextZombieKingSpawnAtRef.current, pauseDuration);
    playerFrozenUntilRef.current = shiftActiveTimestamp(playerFrozenUntilRef.current, pauseDuration);

    botDeadAtRef.current.forEach((deadAt, botId) => {
      botDeadAtRef.current.set(botId, deadAt + pauseDuration);
    });
    botEventImmuneUntilRef.current.forEach((immuneUntil, botId) => {
      botEventImmuneUntilRef.current.set(botId, immuneUntil + pauseDuration);
    });
    playerPositionHistoryRef.current = playerPositionHistoryRef.current.map((entry) => ({
      ...entry,
      recordedAt: entry.recordedAt + pauseDuration,
    }));
    setRoundEndsAt((current) => shiftFiniteTimestamp(current, pauseDuration));
    setFireHazards((current) =>
      current.map((hazard) => ({
        ...hazard,
        startedAt: hazard.startedAt + pauseDuration,
      })),
    );
    setDoomsdayStrikes((current) =>
      current.map((strike) => ({
        ...strike,
        startedAt: strike.startedAt + pauseDuration,
        hitAt: strike.hitAt + pauseDuration,
      })),
    );
    setZombies((current) =>
      current.map((zombie) => ({
        ...zombie,
        spawnedAt: zombie.spawnedAt + pauseDuration,
      })),
    );
    setZombieKing((current) =>
      current
        ? {
            ...current,
            spawnedAt: current.spawnedAt + pauseDuration,
          }
        : null,
    );
    setKingZombies((current) =>
      current.map((zombie) => ({
        ...zombie,
        spawnedAt: zombie.spawnedAt + pauseDuration,
      })),
    );
    setDuelState((current) =>
      current
        ? {
            ...current,
            startedAt: current.startedAt + pauseDuration,
          }
        : null,
    );
  }

  function togglePause() {
    if (phase !== 'arena') return;
    pressedKeys.current.clear();

    if (!isPaused) {
      pauseStartedAtRef.current = Date.now();
      setIsPaused(true);
      return;
    }

    const pauseDuration = Math.max(0, Date.now() - pauseStartedAtRef.current);
    pauseStartedAtRef.current = 0;
    shiftPausedDeadlines(pauseDuration);
    setRoomStartedAt((current) => current + pauseDuration);
    playCurrentMusic(false, phase, false);
    setIsPaused(false);
  }

  useEffect(() => {
    if (gameStopped) return;

    function applyCurrentRoundSnapshot() {
      const now = Date.now();
      const history = playerPositionHistoryRef.current;
      history.push({ position: positionRef.current, recordedAt: now });
      playerPositionHistoryRef.current = history.filter((entry) => now - entry.recordedAt <= 30000);

      if (isDeadRef.current && deathReturnAtRef.current > 0 && now >= deathReturnAtRef.current) {
        setRoomStartedAt(now);
        setRoundSeed((current) => current + 1);
        applyRoundSnapshot(getLobbySnapshot(roundSeed + 1, now, now));
        return;
      }

      const snapshot = getRoundSnapshot(`local-game-${roundSeed}`, runRandomSeed, roomStartedAt, now, getRoomPlayerSnapshots(), playerPositionHistoryRef.current, arenaMode === 'duel');

      if (snapshot.phase === 'lobby') {
        applyRoundSnapshot(snapshot);
        return;
      }

      applyRoundSnapshot(snapshot);
    }

    applyCurrentRoundSnapshot();
    const timer = window.setInterval(() => {
      applyCurrentRoundSnapshot();
    }, 250);

    return () => window.clearInterval(timer);
  }, [arenaMode, gameStopped, phase, roomStartedAt, roundSeed, runRandomSeed]);

  useEffect(() => {
    if (!menuOpen && !lobbyMusicEnabledRef.current) return;

    function retryMusic() {
      const activeAudio =
        menuOpen ? menuMusicRef.current : phase === 'lobby' ? lobbyMusicRef.current : arenaMusicIndex === 0 ? arenaMusicRef.current : arenaSecondMusicRef.current;
      if (activeAudio?.paused) {
        setMusicRetryKey((current) => current + 1);
      }
    }

    window.addEventListener('pointerdown', retryMusic);
    window.addEventListener('keydown', retryMusic);

    return () => {
      window.removeEventListener('pointerdown', retryMusic);
      window.removeEventListener('keydown', retryMusic);
    };
  }, [arenaMusicIndex, menuOpen, phase]);

  useEffect(() => {
    prepareAudio(menuMusicRef.current);
    prepareAudio(lobbyMusicRef.current);
    prepareAudio(arenaMusicRef.current);
    prepareAudio(arenaSecondMusicRef.current);
  }, [menuOpen]);

  useEffect(() => {
    playCurrentMusic();
  }, [arenaMusicIndex, gameStopped, menuOpen, musicRetryKey, phase]);

  useEffect(() => {
    if (gameStopped || phase !== 'arena') return;

    const timer = window.setInterval(() => {
      const now = Date.now();
      const obstacleBounds = getActiveObjectBounds(hiddenArenaObjects);
      const localSnapshot = playerSnapshotRef.current;
      const aliveTargets = [localSnapshot, ...botsRef.current].filter((stickman): stickman is PlayerSnapshot | BotSnapshot => {
        return Boolean(stickman && stickman.phase === 'arena' && !stickman.isDead && (arenaMode === 'main' || stickman.clientId === clientId));
      });
      const king = zombieKingRef.current;
      const kingAlive = isZombieKingAlive(king);

      if (!kingAlive) {
        if (kingZombiesRef.current.length > 0) {
          clearKingZombies();
        }
        nextZombieKingSpawnAtRef.current = 0;
      }

      if (king && kingAlive && now >= nextZombieKingSpawnAtRef.current) {
        const directionVector = getDirectionVector(king.direction ?? 'back');
        const baseX = king.position.x + directionVector.x * 72;
        const baseY = king.position.y + directionVector.y * 72;
        const sideX = directionVector.y === 0 ? 0 : 34;
        const sideY = directionVector.x === 0 ? 0 : 34;
        const spawnedZombies: Zombie[] = [-1, 1].map((side) => ({
          id: `king-zombie-${now}-${side}`,
          spawnedAt: now,
          source: 'king',
          kind: 'minion',
          position: {
            x: clamp(baseX + sideX * side, 34, worldWidth - 34),
            y: clamp(baseY + sideY * side, 88, worldHeight - 34),
          },
          targetClientId: clientId,
          health: zombieMinionMaxHealth,
          maxHealth: zombieMinionMaxHealth,
          direction: king.direction ?? 'back',
        }));

        nextZombieKingSpawnAtRef.current = now + zombieKingSpawnInterval;
        setKingZombies((current) => [...current, ...spawnedZombies]);
      }

      setKingZombies((currentZombies) =>
        (kingAlive ? currentZombies : [])
          .filter((zombie) => !killedZombieIdsRef.current.has(zombie.id) && (zombie.health ?? 0) > 0)
          .map((zombie) => {
            const nearestTarget = aliveTargets
              .slice()
              .sort((a, b) => Math.hypot(a.position.x - zombie.position.x, a.position.y - zombie.position.y) - Math.hypot(b.position.x - zombie.position.x, b.position.y - zombie.position.y))[0];
            if (!nearestTarget) return zombie;

            const nextPosition = getPathChasePosition(zombie.position, nearestTarget.position, 1000, obstacleBounds, zombieSpeed);
            return {
              ...zombie,
              position: nextPosition,
              targetClientId: nearestTarget.clientId,
              direction: getDirectionToward(zombie.position, nextPosition),
            };
          }),
      );

      setZombieKing((currentKing) => {
        if (!currentKing || killedZombieIdsRef.current.has(currentKing.id) || (currentKing.health ?? 0) <= 0 || !localSnapshot || localSnapshot.isDead) return currentKing;

        const nextPosition = getPathChasePosition(currentKing.position, localSnapshot.position, 1000, obstacleBounds, zombieKingSpeed);
        const attackDistance = Math.hypot(localSnapshot.position.x - currentKing.position.x, localSnapshot.position.y - currentKing.position.y);
        const swordSwinging = attackDistance <= zombieKingAttackDistance && Math.floor(now / zombieKingSwordCooldown) % 2 === 0;
        const hitId = `${currentKing.id}:${clientId}`;

        if (!isDeadRef.current && attackDistance <= zombieKingAttackDistance && now - (stickmanHitAtRef.current.get(hitId) ?? 0) >= zombieKingSwordCooldown) {
          stickmanHitAtRef.current.set(hitId, now);
          damagePlayer(swordDamage);
        }

        return {
          ...currentKing,
          position: nextPosition,
          direction: getDirectionToward(currentKing.position, nextPosition),
          swordSwinging,
        };
      });
    }, 160);

    return () => window.clearInterval(timer);
  }, [arenaMode, clientId, gameStopped, hiddenArenaObjects, phase]);

  useEffect(() => {
    if (gameStopped || phase !== 'arena') return;

    const timer = window.setInterval(() => {
      const now = Date.now();
      const localSnapshot = playerSnapshotRef.current;

      setBots((currentBots) => {
        const duelFighters = new Set(duelState?.fighters ?? []);
        const stickmen = [localSnapshot, ...currentBots].filter((stickman): stickman is PlayerSnapshot | BotSnapshot => {
          if (!stickman || stickman.phase !== 'arena' || stickman.isDead) return false;
          return arenaMode === 'main' || duelFighters.has(stickman.clientId);
        });
        const obstacleBounds = arenaMode === 'main' ? getBotObjectBounds(hiddenArenaObjects) : [];

        return currentBots.map((bot) => {
          if (bot.isDead || bot.phase !== 'arena' || (arenaMode === 'duel' && !duelFighters.has(bot.clientId))) {
            botWanderTargetsRef.current.delete(bot.clientId);
            botLastAnglesRef.current.delete(bot.clientId);
            botStuckRef.current.delete(bot.clientId);
            return { ...bot, swordSwinging: false };
          }

          if (bot.isFrozen) return { ...bot, swordSwinging: false };

          const enemies = stickmen.filter((stickman) => stickman.clientId !== bot.clientId);
          const nearestSwordThreat = bot.hasSword
            ? undefined
            : enemies
                .filter((stickman) => stickman.hasSword)
                .sort((a, b) => Math.hypot(a.position.x - bot.position.x, a.position.y - bot.position.y) - Math.hypot(b.position.x - bot.position.x, b.position.y - bot.position.y))[0];
          const kingAlive = isZombieKingAlive();
          const activeZombieThreats = [...zombies, ...(kingAlive ? kingZombiesRef.current : []), ...(kingAlive && zombieKingRef.current ? [zombieKingRef.current] : [])];
          const nearestZombie = activeZombieThreats
            .filter((zombie) => !killedZombieIdsRef.current.has(zombie.id))
            .sort((a, b) => Math.hypot(a.position.x - bot.position.x, a.position.y - bot.position.y) - Math.hypot(b.position.x - bot.position.x, b.position.y - bot.position.y))[0];
          const nearestTarget = enemies.sort(
            (a, b) => Math.hypot(a.position.x - bot.position.x, a.position.y - bot.position.y) - Math.hypot(b.position.x - bot.position.x, b.position.y - bot.position.y),
          )[0];
          const threatDistance = nearestSwordThreat ? Math.hypot(nearestSwordThreat.position.x - bot.position.x, nearestSwordThreat.position.y - bot.position.y) : Number.POSITIVE_INFINITY;
          const zombieDistance = nearestZombie ? Math.hypot(nearestZombie.position.x - bot.position.x, nearestZombie.position.y - bot.position.y) : Number.POSITIVE_INFINITY;
          const speed = bot.isRapid ? botRapidSpeed : botSpeed;
          let movementSpeed = speed;
          let targetPosition: Position;
          const sideEscapeAngle = getSideEscapeAngle(bot.position);

          if (sideEscapeAngle !== undefined) {
            clearBotFleeStarts(botFleeStartsRef.current, bot.clientId);
            movementSpeed = speed * botFleeSpeedMultiplier;
            const currentSegment = botWanderTargetsRef.current.get(bot.clientId);
            if (currentSegment && Math.hypot(currentSegment.x - bot.position.x, currentSegment.y - bot.position.y) >= 18) {
              targetPosition = currentSegment;
            } else {
              const segmentAngle = avoidReverseAngle(sideEscapeAngle, botLastAnglesRef.current.get(bot.clientId), `${bot.clientId}:${now}:side`);
              botLastAnglesRef.current.set(bot.clientId, segmentAngle);
              targetPosition = getOpenDirectionalSegmentTarget(bot.position, segmentAngle, obstacleBounds, `${bot.clientId}:${now}:side`, botSideEscapeDistance);
              botWanderTargetsRef.current.set(bot.clientId, targetPosition);
            }
          } else if (nearestZombie && zombieDistance < botZombieFleeDistance) {
            const fleeKey = `${bot.clientId}:${nearestZombie.id}`;
            const currentFleeKey = [...botFleeStartsRef.current.keys()].find((key) => key.startsWith(`${bot.clientId}:`) && key !== fleeKey);
            if (currentFleeKey) {
              botFleeStartsRef.current.delete(currentFleeKey);
              botWanderTargetsRef.current.delete(bot.clientId);
            }

            movementSpeed = speed * botFleeSpeedMultiplier;
            const currentSegment = botWanderTargetsRef.current.get(bot.clientId);
            if (currentSegment && Math.hypot(currentSegment.x - bot.position.x, currentSegment.y - bot.position.y) >= 18) {
              targetPosition = currentSegment;
            } else {
              botFleeStartsRef.current.set(fleeKey, bot.position);
              const segmentAngle = avoidReverseAngle(
                Math.atan2(bot.position.y - nearestZombie.position.y, bot.position.x - nearestZombie.position.x),
                botLastAnglesRef.current.get(bot.clientId),
                `${bot.clientId}:${now}:zombie`,
              );
              botLastAnglesRef.current.set(bot.clientId, segmentAngle);
              targetPosition = getOpenDirectionalSegmentTarget(bot.position, segmentAngle, obstacleBounds, `${bot.clientId}:${now}:zombie`);
              botWanderTargetsRef.current.set(bot.clientId, targetPosition);
            }
          } else if (nearestSwordThreat && threatDistance < botFleeDistance) {
            const fleeKey = `${bot.clientId}:${nearestSwordThreat.clientId}`;
            const currentFleeKey = [...botFleeStartsRef.current.keys()].find((key) => key.startsWith(`${bot.clientId}:`) && key !== fleeKey);
            if (currentFleeKey) {
              botFleeStartsRef.current.delete(currentFleeKey);
              botWanderTargetsRef.current.delete(bot.clientId);
            }

            movementSpeed = speed * botFleeSpeedMultiplier;
            const currentSegment = botWanderTargetsRef.current.get(bot.clientId);
            if (currentSegment && Math.hypot(currentSegment.x - bot.position.x, currentSegment.y - bot.position.y) >= 18) {
              targetPosition = currentSegment;
            } else {
              botFleeStartsRef.current.set(fleeKey, bot.position);
              const segmentAngle = avoidReverseAngle(
                Math.atan2(bot.position.y - nearestSwordThreat.position.y, bot.position.x - nearestSwordThreat.position.x),
                botLastAnglesRef.current.get(bot.clientId),
                `${bot.clientId}:${now}:sword`,
              );
              botLastAnglesRef.current.set(bot.clientId, segmentAngle);
              targetPosition = getOpenDirectionalSegmentTarget(bot.position, segmentAngle, obstacleBounds, `${bot.clientId}:${now}:sword`);
              botWanderTargetsRef.current.set(bot.clientId, targetPosition);
            }
          } else if (bot.hasSword && nearestTarget) {
            clearBotFleeStarts(botFleeStartsRef.current, bot.clientId);
            botWanderTargetsRef.current.delete(bot.clientId);
            targetPosition = nearestTarget.position;
          } else {
            clearBotFleeStarts(botFleeStartsRef.current, bot.clientId);
            const currentWanderTarget = botWanderTargetsRef.current.get(bot.clientId);
            const needsNewTarget =
              !currentWanderTarget ||
              Math.hypot(currentWanderTarget.x - bot.position.x, currentWanderTarget.y - bot.position.y) < 18 ||
              collidesCharacterWithBounds(currentWanderTarget, obstacleBounds);

            if (needsNewTarget) {
              const wanderAngle = avoidReverseAngle(
                ((hashText(`${bot.clientId}:${Math.floor(now / 9000)}`) % 360) * Math.PI) / 180,
                botLastAnglesRef.current.get(bot.clientId),
                `${bot.clientId}:${now}:wander`,
              );
              botLastAnglesRef.current.set(bot.clientId, wanderAngle);
              const nextWanderTarget = getOpenDirectionalSegmentTarget(bot.position, wanderAngle, obstacleBounds, `${bot.clientId}:${now}:wander`);

              botWanderTargetsRef.current.set(bot.clientId, nextWanderTarget);
              targetPosition = nextWanderTarget;
            } else {
              targetPosition = currentWanderTarget;
            }
          }

          const dx = targetPosition.x - bot.position.x;
          const dy = targetPosition.y - bot.position.y;
          const distance = Math.hypot(dx, dy);
          const finalPosition = getPathAwareStepPosition(bot.position, distance > 0 ? targetPosition : bot.position, movementSpeed, obstacleBounds, `${bot.clientId}:${now}`);
          const movedDistance = Math.hypot(finalPosition.x - bot.position.x, finalPosition.y - bot.position.y);
          const previousStuck = botStuckRef.current.get(bot.clientId);
          const stuckTicks = movedDistance < 2 ? (previousStuck?.ticks ?? 0) + 1 : 0;
          const isStuck = stuckTicks >= 3;

          if (isStuck) {
            const escapeAngle = avoidReverseAngle(Math.atan2(bot.position.y - targetPosition.y, bot.position.x - targetPosition.x), botLastAnglesRef.current.get(bot.clientId), `${bot.clientId}:${now}:stuck`);
            const escapeTarget = getOpenDirectionalSegmentTarget(bot.position, escapeAngle, obstacleBounds, `${bot.clientId}:${now}:stuck`, botSideEscapeDistance);
            botWanderTargetsRef.current.set(bot.clientId, escapeTarget);
            botLastAnglesRef.current.set(bot.clientId, escapeAngle);
            botStuckRef.current.delete(bot.clientId);
            targetPosition = escapeTarget;
          } else {
            botStuckRef.current.set(bot.clientId, { position: finalPosition, ticks: stuckTicks });
          }

          const attackDistance = bot.hasSword && nearestTarget ? Math.hypot(nearestTarget.position.x - finalPosition.x, nearestTarget.position.y - finalPosition.y) : Number.POSITIVE_INFINITY;
          const finalTargetPosition = bot.hasSword && nearestTarget ? nearestTarget.position : targetPosition;

          return {
            ...bot,
            position: finalPosition,
            direction: getDirectionToward(finalPosition, finalTargetPosition),
            swordSwinging: bot.hasSword && attackDistance <= botAttackDistance && Math.floor(now / botSwingInterval) % 2 === 0,
            updatedAt: now,
          };
        });
      });
    }, 160);

    return () => window.clearInterval(timer);
  }, [arenaMode, duelState, gameStopped, hiddenArenaObjects, phase, zombies]);

  useEffect(() => {
    if (gameStopped || phase !== 'arena' || isDead) return;
    if (Date.now() < invulnerableUntilRef.current) return;

    fireHazards.forEach((hazard) => {
      if (damagedFireIdsRef.current.has(hazard.id)) return;
      if (!collidesWithFire(hazard)) return;

      damagedFireIdsRef.current.add(hazard.id);
      damagePlayer(fireDamage);
    });
  }, [fireHazards, gameStopped, isDead, phase, position]);

  useEffect(() => {
    if (gameStopped || phase !== 'arena' || isDead) return;
    const now = Date.now();
    if (now < invulnerableUntilRef.current) return;

    doomsdayStrikes.forEach((strike) => {
      if (now < strike.hitAt) return;
      if (damagedDoomsdayIdsRef.current.has(strike.id)) return;
      if (!collidesWithDoomsdayStrike(strike)) return;

      damagedDoomsdayIdsRef.current.add(strike.id);
      damagePlayer(doomsdayDamage);
    });
  }, [doomsdayStrikes, gameStopped, isDead, phase, position]);

  useEffect(() => {
    if (gameStopped || phase !== 'arena') return;
    const now = Date.now();
    const playerInvulnerable = now < invulnerableUntilRef.current;

    const activeKingZombies = isZombieKingAlive(zombieKing) ? kingZombies : [];

    [...zombies, ...activeKingZombies].forEach((zombie) => {
      if (killedZombieIdsRef.current.has(zombie.id)) return;

      const killedByFire = fireHazards.some((hazard) => collidesZombieWithFire(zombie, hazard));
      const killedByDoomsday = doomsdayStrikes.some((strike) => now >= strike.hitAt && collidesZombieWithDoomsdayStrike(zombie, strike));

      if (killedByFire || killedByDoomsday) {
        killedZombieIdsRef.current.add(zombie.id);
        return;
      }

      if (playerInvulnerable || isDead || damagedZombieIdsRef.current.has(zombie.id) || !collidesWithZombie(zombie)) return;

      damagedZombieIdsRef.current.add(zombie.id);
      killedZombieIdsRef.current.add(zombie.id);
      damagePlayer(zombieDamage);
    });
  }, [doomsdayStrikes, fireHazards, gameStopped, isDead, kingZombies, phase, position, zombieKing, zombies]);

  useEffect(() => {
    if (gameStopped || phase !== 'arena') return;

    const activeKingZombies = isZombieKingAlive(zombieKing) ? kingZombies : [];

    [...zombies, ...activeKingZombies].forEach((zombie) => {
      if (killedZombieIdsRef.current.has(zombie.id)) return;

      bots.forEach((bot) => {
        if (bot.isDead || !botCanTakeEventDamage(bot.clientId) || damagedZombieIdsRef.current.has(`${zombie.id}:${bot.clientId}`)) return;
        if (!boxesOverlap(getZombieBox(zombie), getCharacterBox(bot.position))) return;

        damagedZombieIdsRef.current.add(`${zombie.id}:${bot.clientId}`);
        killedZombieIdsRef.current.add(zombie.id);
        damageBot(bot.clientId, zombieDamage);
      });
    });
  }, [bots, gameStopped, kingZombies, phase, zombieKing, zombies]);

  useEffect(() => {
    if (gameStopped || phase !== 'arena') return;
    const now = Date.now();

    bots.forEach((bot) => {
      if (bot.isDead || !botCanTakeEventDamage(bot.clientId, now)) return;

      fireHazards.forEach((hazard) => {
        const hitId = `${bot.clientId}:${hazard.id}`;
        if (damagedBotFireIdsRef.current.has(hitId)) return;
        if (!collidesCharacterWithFire(bot.position, hazard)) return;

        damagedBotFireIdsRef.current.add(hitId);
        damageBot(bot.clientId, fireDamage);
      });

      doomsdayStrikes.forEach((strike) => {
        const hitId = `${bot.clientId}:${strike.id}`;
        if (now < strike.hitAt || damagedBotDoomsdayIdsRef.current.has(hitId)) return;
        if (!collidesCharacterWithDoomsdayStrike(bot.position, strike)) return;

        damagedBotDoomsdayIdsRef.current.add(hitId);
        damageBot(bot.clientId, doomsdayDamage);
      });
    });
  }, [bots, doomsdayStrikes, fireHazards, gameStopped, phase]);

  useEffect(() => {
    if (gameStopped || phase !== 'arena') return;

    if (hasSword && swordSwinging) {
      const swingId = `${swordSwingStartedAtRef.current}:${direction}`;
      const swordBox = getSwordHitBox(position, direction);

      bots.forEach((bot) => {
        if (bot.isDead) return;
        if (arenaMode === 'duel' && duelState && !duelState.fighters.includes(bot.clientId)) return;

        const hitId = `${bot.clientId}:${swingId}`;
        if (damagedBotSwingIdsRef.current.has(hitId)) return;
        if (!boxesOverlap(swordBox, getCharacterBox(bot.position))) return;

        damagedBotSwingIdsRef.current.add(hitId);
        damageBot(bot.clientId, swordDamage);
      });
    }

    const now = Date.now();
    bots.forEach((bot) => {
      if (bot.isDead || !bot.hasSword || !bot.swordSwinging) return;
      const botSwordBox = getSwordHitBox(bot.position, bot.direction);

      if (!isDead && now >= invulnerableUntilRef.current && (arenaMode === 'main' || playerInActiveDuel) && boxesOverlap(botSwordBox, getCharacterBox(position))) {
        const hitId = `${bot.clientId}:${clientId}`;
        if (now - (stickmanHitAtRef.current.get(hitId) ?? 0) >= botSwingInterval) {
          stickmanHitAtRef.current.set(hitId, now);
          damagePlayer(swordDamage);
        }
      }

      bots.forEach((targetBot) => {
        if (targetBot.clientId === bot.clientId || targetBot.isDead) return;
        if (arenaMode === 'duel' && duelState && (!duelState.fighters.includes(bot.clientId) || !duelState.fighters.includes(targetBot.clientId))) return;
        if (!boxesOverlap(botSwordBox, getCharacterBox(targetBot.position))) return;

        const hitId = `${bot.clientId}:${targetBot.clientId}`;
        if (now - (stickmanHitAtRef.current.get(hitId) ?? 0) < botSwingInterval) return;

        stickmanHitAtRef.current.set(hitId, now);
        damageBot(targetBot.clientId, swordDamage);
      });
    });
  }, [arenaMode, bots, clientId, direction, duelState, gameStopped, hasSword, isDead, phase, playerInActiveDuel, position, swordSwinging]);

  useEffect(() => {
    if (gameStopped || !duelState) return;

    const fighters = duelState.fighters.map((fighterId) => getStickmanById(fighterId)).filter((fighter): fighter is PlayerSnapshot | BotSnapshot => Boolean(fighter));
    const aliveFighters = fighters.filter((fighter) => !fighter.isDead);

    if (aliveFighters.length === 1) {
      finishDuel(aliveFighters[0].clientId);
    } else if (aliveFighters.length === 0) {
      setArenaMode('main');
      setDuelState(null);
    }
  }, [bots, duelState, gameStopped, health, isDead]);

  useEffect(() => {
    if (gameStopped) {
      pressedKeys.current.clear();
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
        event.preventDefault();
        pressedKeys.current.add(key);
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      pressedKeys.current.delete(event.key.toLowerCase());
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const timer = window.setInterval(() => {
      const keys = pressedKeys.current;
      let dx = 0;
      let dy = 0;

      if (keys.has('arrowup') || keys.has('w')) dy -= movementStep;
      if (keys.has('arrowdown') || keys.has('s')) dy += movementStep;
      if (keys.has('arrowleft') || keys.has('a')) dx -= movementStep;
      if (keys.has('arrowright') || keys.has('d')) dx += movementStep;

      if (dx === 0 && dy === 0) return;
      if (!canMove) return;

      setDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'front' : 'back');
      setPosition((current) => {
        const bounds = getWorldMovementBounds();
        const next = {
          x: clamp(current.x + dx, bounds.minX, bounds.maxX),
          y: clamp(current.y + dy, bounds.minY, bounds.maxY),
        };

        return collidesWithObstacle(next) || collidesWithPlayer(next) ? current : next;
      });
    }, 80);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.clearInterval(timer);
      if (swordTimerRef.current) window.clearTimeout(swordTimerRef.current);
    };
  }, [canMove, gameStopped, hiddenArenaObjects, movementStep, phase]);

  useEffect(() => {
    if (isFrozen) pressedKeys.current.clear();
  }, [isFrozen]);

  useEffect(() => {
    if (phase !== 'arena' || equippedItem !== 'gun' || !isZombieKingAlive(zombieKing)) {
      setTargetedZombieId(null);
    }
  }, [equippedItem, phase, zombieKing]);

  useEffect(() => {
    if (gameStopped) return;

    if (phase !== 'lobby') {
      setShopOpen(false);
      setShopDismissed(false);
      return;
    }

    const nearShop = isNearShop(position);
    if (nearShop && !shopDismissed) setShopOpen(true);
    if (!nearShop) {
      setShopOpen(false);
      setShopDismissed(false);
    }
  }, [gameStopped, phase, position, shopDismissed]);

  function getFrameScale() {
    const frame = frameRef.current;

    return {
      x: (frame?.clientWidth ?? worldWidth) / worldWidth,
      y: (frame?.clientHeight ?? worldHeight) / worldHeight,
    };
  }

  function worldToScreen(nextPosition: Position) {
    const scale = getFrameScale();

    return {
      x: nextPosition.x * scale.x,
      y: nextPosition.y * scale.y,
    };
  }

  function screenToWorld(screenPosition: Position) {
    const scale = getFrameScale();

    return {
      x: screenPosition.x / scale.x,
      y: screenPosition.y / scale.y,
    };
  }

  function scaleBoundsToScreen(bounds: Bounds) {
    const scale = getFrameScale();

    return {
      x: bounds.x * scale.x,
      y: bounds.y * scale.y,
      width: bounds.width * scale.x,
      height: bounds.height * scale.y,
    };
  }

  function getWorldMovementBounds() {
    return {
      minX: 34,
      maxX: worldWidth - 34,
      minY: 88,
      maxY: worldHeight - 34,
    };
  }

  function getSpawnPosition(nextPhase: GamePhase, nextClientId = clientId, clientIds = roomPlayerIdsRef.current) {
    const preferred = getSpawnSlot(nextPhase, nextClientId, clientIds);

    return {
      x: clamp(preferred.x, 34, worldWidth - 34),
      y: clamp(preferred.y, 88, worldHeight - 34),
    };
  }

  function getActiveArenaObstacleBounds() {
    if (arenaMode === 'duel') return [];
    return getActiveObjectBounds(hiddenArenaObjects);
  }

  function collidesWithObstacle(nextPosition: Position) {
    const playerBox = {
      left: nextPosition.x - 23,
      right: nextPosition.x + 23,
      top: nextPosition.y - 66,
      bottom: nextPosition.y + 12,
    };

    if (phase === 'lobby') {
      const playerFeetBox = {
        left: nextPosition.x - 18,
        right: nextPosition.x + 18,
        top: nextPosition.y - 6,
        bottom: nextPosition.y + 12,
      };

      return lobbyObstacleBounds.some((bounds) => {
        return (
          playerFeetBox.left < bounds.x + bounds.width &&
          playerFeetBox.right > bounds.x &&
          playerFeetBox.top < bounds.y + bounds.height &&
          playerFeetBox.bottom > bounds.y
        );
      });
    }

    const activeObstacleBounds = phase === 'arena' ? getActiveArenaObstacleBounds() : [];

    return activeObstacleBounds.some((bounds) => {
      return (
        playerBox.left < bounds.x + bounds.width &&
        playerBox.right > bounds.x &&
        playerBox.top < bounds.y + bounds.height &&
        playerBox.bottom > bounds.y
      );
    });
  }

  function collidesWithPlayer(nextPosition: Position) {
    void nextPosition;
    return false;
  }

  function getPlayerBox(nextPosition = position) {
    return getCharacterBox(nextPosition);
  }

  function getCharacterBox(nextPosition: Position) {
    return {
      left: nextPosition.x - 23,
      right: nextPosition.x + 23,
      top: nextPosition.y - 66,
      bottom: nextPosition.y + 12,
    };
  }

  function boxesOverlap(first: { left: number; right: number; top: number; bottom: number }, second: { left: number; right: number; top: number; bottom: number }) {
    return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
  }

  function getSwordHitBox(origin: Position, nextDirection: Direction) {
    const reach = 72;
    const halfWidth = 24;

    if (nextDirection === 'left') {
      return {
        left: origin.x - reach,
        right: origin.x - 12,
        top: origin.y - 58,
        bottom: origin.y + halfWidth,
      };
    }

    if (nextDirection === 'right') {
      return {
        left: origin.x + 12,
        right: origin.x + reach,
        top: origin.y - 58,
        bottom: origin.y + halfWidth,
      };
    }

    if (nextDirection === 'back') {
      return {
        left: origin.x - halfWidth,
        right: origin.x + halfWidth,
        top: origin.y - reach - 30,
        bottom: origin.y - 34,
      };
    }

    return {
      left: origin.x - halfWidth,
      right: origin.x + halfWidth,
      top: origin.y - 34,
      bottom: origin.y + reach,
    };
  }

  function getFireBounds(hazard: FireHazard) {
    return hazard.bounds || getBaseObjectBounds(hazard.objectId);
  }

  function getDoomsdayDisplayStrike(strike: DoomsdayStrike) {
    const scale = getFrameScale();
    const position = worldToScreen(strike);
    const radiusScale = Math.min(scale.x, scale.y);

    return {
      ...strike,
      x: position.x,
      y: position.y,
      radius: strike.radius * radiusScale,
    };
  }

  function collidesWithFire(hazard: FireHazard) {
    return collidesCharacterWithFire(position, hazard);
  }

  function collidesCharacterWithFire(characterPosition: Position, hazard: FireHazard) {
    const bounds = getFireBounds(hazard);
    if (!bounds) return false;

    const characterBox = getCharacterBox(characterPosition);
    const fireBox = {
      left: bounds.x - 10,
      right: bounds.x + bounds.width + 10,
      top: bounds.y - 10,
      bottom: bounds.y + bounds.height + 10,
    };

    return (
      characterBox.left < fireBox.right &&
      characterBox.right > fireBox.left &&
      characterBox.top < fireBox.bottom &&
      characterBox.bottom > fireBox.top
    );
  }

  function collidesWithDoomsdayStrike(strike: DoomsdayStrike) {
    return collidesCharacterWithDoomsdayStrike(position, strike);
  }

  function collidesCharacterWithDoomsdayStrike(characterPosition: Position, strike: DoomsdayStrike) {
    const characterBox = getCharacterBox(characterPosition);
    const closestX = clamp(strike.x, characterBox.left, characterBox.right);
    const closestY = clamp(strike.y, characterBox.top, characterBox.bottom);
    const distanceX = strike.x - closestX;
    const distanceY = strike.y - closestY;

    return distanceX * distanceX + distanceY * distanceY <= strike.radius * strike.radius;
  }

  function getZombieBox(zombie: Zombie) {
    return {
      left: zombie.position.x - 23,
      right: zombie.position.x + 23,
      top: zombie.position.y - 66,
      bottom: zombie.position.y + 12,
    };
  }

  function collidesWithZombie(zombie: Zombie) {
    const playerBox = getPlayerBox();
    const zombieBox = getZombieBox(zombie);

    return (
      playerBox.left < zombieBox.right &&
      playerBox.right > zombieBox.left &&
      playerBox.top < zombieBox.bottom &&
      playerBox.bottom > zombieBox.top
    );
  }

  function collidesZombieWithFire(zombie: Zombie, hazard: FireHazard) {
    const bounds = getFireBounds(hazard);
    if (!bounds) return false;

    const zombieBox = getZombieBox(zombie);
    const fireBox = {
      left: bounds.x - 10,
      right: bounds.x + bounds.width + 10,
      top: bounds.y - 10,
      bottom: bounds.y + bounds.height + 10,
    };

    return (
      zombieBox.left < fireBox.right &&
      zombieBox.right > fireBox.left &&
      zombieBox.top < fireBox.bottom &&
      zombieBox.bottom > fireBox.top
    );
  }

  function collidesZombieWithDoomsdayStrike(zombie: Zombie, strike: DoomsdayStrike) {
    const zombieBox = getZombieBox(zombie);
    const closestX = clamp(strike.x, zombieBox.left, zombieBox.right);
    const closestY = clamp(strike.y, zombieBox.top, zombieBox.bottom);
    const distanceX = strike.x - closestX;
    const distanceY = strike.y - closestY;

    return distanceX * distanceX + distanceY * distanceY <= strike.radius * strike.radius;
  }

  function isNearShop(nextPosition: Position) {
    const shopBox = {
      left: 421 - 58,
      right: 421 + 238 + 58,
      top: 98 - 64,
      bottom: 98 + 144 + 70,
    };

    return (
      nextPosition.x >= shopBox.left &&
      nextPosition.x <= shopBox.right &&
      nextPosition.y >= shopBox.top &&
      nextPosition.y <= shopBox.bottom
    );
  }

  function move(dx: number, dy: number) {
    if (!canMove) return;

    setDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'front' : 'back');
    setPosition((current) => {
      const bounds = getWorldMovementBounds();
      const next = {
        x: clamp(current.x + dx, bounds.minX, bounds.maxX),
        y: clamp(current.y + dy, bounds.minY, bounds.maxY),
      };

      return collidesWithObstacle(next) || collidesWithPlayer(next) ? current : next;
    });
  }

  function formatTime(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  function swingSword() {
    if (gameStopped || isDead || isFrozen || (arenaMode === 'duel' && !playerInActiveDuel)) return;

    setSwordSwinging(false);
    if (swordTimerRef.current) window.clearTimeout(swordTimerRef.current);

    window.requestAnimationFrame(() => {
      swordSwingStartedAtRef.current = Date.now();
      setSwordSwinging(true);
      swordTimerRef.current = window.setTimeout(() => {
        setSwordSwinging(false);
      }, 520);
    });
  }

  function getGunTargetAtWorld(targetPosition: Position) {
    const kingAlive = isZombieKingAlive(zombieKing);
    if (phase !== 'arena' || equippedItem !== 'gun' || !kingAlive || !zombieKing || isDead) return undefined;

    const shootableZombies = [
      ...kingZombies.filter((zombie) => !killedZombieIdsRef.current.has(zombie.id) && (zombie.health ?? 0) > 0),
      zombieKing,
    ];

    return shootableZombies
      .map((zombie) => ({
        zombie,
        distance: Math.hypot(zombie.position.x - targetPosition.x, zombie.position.y - targetPosition.y),
      }))
      .filter(({ zombie, distance }) => distance <= (zombie.kind === 'king' ? 86 : 58))
      .sort((a, b) => a.distance - b.distance)[0]?.zombie;
  }

  function updateGunTarget(screenPosition: Position) {
    if (gameStopped) {
      setTargetedZombieId(null);
      return;
    }

    const hitZombie = getGunTargetAtWorld(screenToWorld(screenPosition));
    setTargetedZombieId(hitZombie?.id ?? null);
  }

  function shootGunAt(screenPosition: Position) {
    const kingAlive = isZombieKingAlive(zombieKing);
    if (gameStopped || phase !== 'arena' || equippedItem !== 'gun' || !kingAlive || !zombieKing || isDead) return;

    const hitZombie = getGunTargetAtWorld(screenToWorld(screenPosition));

    if (!hitZombie) return;

    if (hitZombie.kind === 'king') {
      damageZombieKing(gunDamage);
    } else {
      damageKingZombie(hitZombie.id, gunDamage);
    }
  }

  const activeFireObjectIds = new Set(fireHazards.map((hazard) => hazard.objectId).filter(Boolean));
  const destroyedObjectMarkers =
    phase === 'arena' && arenaMode === 'main'
      ? hiddenArenaObjects
          .filter((objectId) => !activeFireObjectIds.has(objectId))
          .map((objectId) => {
            const bounds = getBaseObjectBounds(objectId);
            return bounds ? { objectId, bounds: scaleBoundsToScreen(bounds) } : null;
          })
          .filter((marker): marker is { objectId: string; bounds: Bounds } => Boolean(marker))
      : [];
  const audioDeck = (
    <>
      <audio ref={menuMusicRef} src={menuMusicSrc} preload="auto" />
      <audio ref={lobbyMusicRef} src={lobbyMusicSrc} preload="auto" />
      <audio ref={arenaMusicRef} src={arenaMusicSrc} preload="auto" onEnded={() => setArenaMusicIndex(1)} />
      <audio ref={arenaSecondMusicRef} src={arenaSecondMusicSrc} preload="auto" onEnded={() => setArenaMusicIndex(0)} />
    </>
  );

  if (menuOpen) {
    return (
      <>
        {audioDeck}
        <section className="main-menu" aria-label="Main menu">
          <div className="main-menu-scene">
            <div className="main-menu-sun" />
            <div className="main-menu-ground" />
            <div className="main-menu-stickman">
              <span className="head" />
              <span className="torso" />
              <span className="arm left-arm" />
              <span className="arm right-arm" />
              <span className="leg left-leg" />
              <span className="leg right-leg" />
            </div>
          </div>
          <div className="main-menu-content">
            <h1>Absolute cineWHAT?</h1>
            <div className="main-menu-buttons" role="group" aria-label="Menu actions">
              <button type="button" onClick={startFromMenu}>
                Play
              </button>
              <button type="button" className={menuPanel === 'gamemods' ? 'active' : ''} onClick={() => setMenuPanel('gamemods')}>
                Gamemods
              </button>
              <button type="button" className={menuPanel === 'settings' ? 'active' : ''} onClick={() => setMenuPanel('settings')}>
                Settings
              </button>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      {audioDeck}
      <section className="lobby">
      <div className="lobby-topbar">
        <div>
          <p className="eyebrow">Classic lobby</p>
          <h2>{phase === 'lobby' ? 'Spawn Plaza' : arenaMode === 'duel' ? 'Battle To Death' : 'Brickbattle Arena'}</h2>
        </div>
        <div className="round-info">
          <p className="round-label">{phase === 'lobby' ? 'Teleporting in' : 'Arena time'}</p>
          <p className="round-timer">{formatTime(timeLeft)}</p>
        </div>
        {phase === 'arena' && (
          <button type="button" className="pause-toggle" onClick={togglePause}>
            {isPaused ? 'Resume' : 'Pause'}
          </button>
        )}
        {phase === 'arena' && isPaused && (
          <button type="button" className="leave-toggle" onClick={leaveArenaToLobby}>
            Leave
          </button>
        )}
        {phase !== 'arena' && (
          <button
            type="button"
            className="menu-toggle"
            onClick={() => {
              pressedKeys.current.clear();
              setMenuPanel('main');
              setMenuOpen(true);
            }}
          >
            Menu
          </button>
        )}
      </div>

      {phase === 'arena' && deathMessage && (
        <div className="death-announcement" role="status" aria-live="assertive">
          {deathMessage}
        </div>
      )}

      {phase === 'arena' && serverAnnouncement && (
        <div className="server-announcement" role="status" aria-live="polite">
          <span>Arena Event</span>
          <p>{serverAnnouncement}</p>
        </div>
      )}

      {phase === 'arena' && isPaused && (
        <div className="pause-announcement" role="status" aria-live="polite">
          Paused
        </div>
      )}

      {phase === 'arena' && (
        <div className="player-inventory" aria-label="Player inventory">
          <span>Inventory</span>
          {hasSword && (
            <button type="button" className={equippedItem === 'sword' ? 'active' : ''} onClick={() => setEquippedItem('sword')}>
              Sword
            </button>
          )}
          {isZombieKingAlive(zombieKing) && (
            <button type="button" className={equippedItem === 'gun' ? 'active' : ''} onClick={() => setEquippedItem('gun')}>
              Gun
            </button>
          )}
        </div>
      )}

      <div
        ref={frameRef}
        className={`game-frame ${phase} ${arenaMode} ${targetedZombieId ? 'targeting-zombie' : equippedItem === 'gun' && phase === 'arena' ? 'gun-equipped' : ''}`}
        aria-label="2D classic map"
        onPointerMove={(event) => {
          if (phase !== 'arena' || equippedItem !== 'gun') return;
          const rect = event.currentTarget.getBoundingClientRect();
          updateGunTarget({ x: event.clientX - rect.left, y: event.clientY - rect.top });
        }}
        onPointerLeave={() => setTargetedZombieId(null)}
        onPointerDown={(event) => {
          if (phase !== 'arena' || (arenaMode !== 'main' && !playerInActiveDuel)) return;
          if (equippedItem === 'gun') {
            const rect = event.currentTarget.getBoundingClientRect();
            shootGunAt({ x: event.clientX - rect.left, y: event.clientY - rect.top });
          } else {
            swingSword();
          }
        }}
      >
        {phase === 'lobby' ? (
          <>
            <div className="spawn-pad">
              <span>SPAWN</span>
            </div>

            <div className="tower tower-left solid-obstacle">
              <span />
              <span />
              <span />
            </div>
            <div className="tower tower-right solid-obstacle">
              <span />
              <span />
              <span />
            </div>
            <div className="tower tower-purple solid-obstacle">
              <span />
              <span />
              <span />
            </div>
            <div className="tower tower-yellow solid-obstacle">
              <span />
              <span />
              <span />
            </div>

            <div className="tree tree-one solid-obstacle" />
            <div className="tree tree-two solid-obstacle" />
            <div className="tree tree-three solid-obstacle" />
            <div className="tree tree-four solid-obstacle" />

            <div className="shop-building solid-obstacle">
              <div className="shop-title">SHOP</div>
              <div className="shop-awning">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="shop-display">
                <div className="shop-stickman">
                  <span className="head" />
                  <span className="torso" />
                  <span className="arm left-arm" />
                  <span className="arm right-arm" />
                  <span className="leg left-leg" />
                  <span className="leg right-leg" />
                </div>
                <span className="shop-crate" />
              </div>
            </div>
          </>
        ) : arenaMode === 'main' ? (
          <>
            <div className="arena-center">
              <span>ARENA</span>
            </div>
            {!hiddenArenaObjects.includes('fort-red') && (
              <div className="arena-fort fort-red solid-obstacle">
                <span />
                <span />
              </div>
            )}
            {!hiddenArenaObjects.includes('fort-blue') && (
              <div className="arena-fort fort-blue solid-obstacle">
                <span />
                <span />
              </div>
            )}
            {!hiddenArenaObjects.includes('column-one') && <div className="arena-column column-one solid-obstacle" />}
            {!hiddenArenaObjects.includes('column-two') && <div className="arena-column column-two solid-obstacle" />}
            {!hiddenArenaObjects.includes('column-three') && <div className="arena-column column-three solid-obstacle" />}
            {!hiddenArenaObjects.includes('arena-tree-two') && <div className="arena-tree arena-tree-two" />}
            {!hiddenArenaObjects.includes('arena-tree-three') && <div className="arena-tree arena-tree-three" />}
            {!hiddenArenaObjects.includes('arena-tree-four') && <div className="arena-tree arena-tree-four" />}
          </>
        ) : (
          <div className="arena-center">
            <span>DUEL</span>
          </div>
        )}

        {phase === 'arena' &&
          arenaMode === 'main' &&
          doomsdayStrikes.map((strike) => {
            const displayStrike = getDoomsdayDisplayStrike(strike);
            const hasHit = Date.now() >= strike.hitAt;

            return (
              <div
                key={strike.id}
                className={`doomsday-strike ${hasHit ? 'hit' : ''}`}
                style={{
                  left: `${displayStrike.x}px`,
                  top: `${displayStrike.y}px`,
                  width: `${displayStrike.radius * 2}px`,
                  height: `${displayStrike.radius * 2}px`,
                }}
              />
            );
          })}

        {destroyedObjectMarkers.map(({ objectId, bounds }) => (
          <div
            key={`destroyed-${objectId}`}
            className="destroyed-object-effect"
            style={{
              left: `${bounds.x + bounds.width / 2}px`,
              top: `${bounds.y + bounds.height / 2}px`,
              width: `${Math.max(42, bounds.width + 18)}px`,
              height: `${Math.max(34, bounds.height + 12)}px`,
            }}
          >
            <span />
            <span />
            <span />
          </div>
        ))}

        {phase === 'arena' &&
          arenaMode === 'main' &&
          fireHazards.map((hazard) => {
            const bounds = getFireBounds(hazard);
            if (!bounds) return null;
            const screenBounds = scaleBoundsToScreen(bounds);

            return (
              <div
                key={hazard.id}
                className="fire-hazard"
                style={{
                  left: `${screenBounds.x + screenBounds.width / 2}px`,
                  top: `${screenBounds.y + screenBounds.height / 2}px`,
                  width: `${Math.max(42, screenBounds.width + 18)}px`,
                  height: `${Math.max(42, screenBounds.height + 18)}px`,
                }}
              >
                <span />
                <span />
                <span />
              </div>
            );
          })}

        {phase === 'arena' &&
          zombies
            .filter((zombie) => !killedZombieIdsRef.current.has(zombie.id))
            .map((zombie) => <ZombieAvatar key={zombie.id} zombie={zombie} position={worldToScreen(zombie.position)} isTargeted={zombie.id === targetedZombieId} />)}

        {phase === 'arena' &&
          isZombieKingAlive(zombieKing) &&
          kingZombies
            .filter((zombie) => !killedZombieIdsRef.current.has(zombie.id) && (zombie.health ?? 0) > 0)
            .map((zombie) => <ZombieAvatar key={zombie.id} zombie={zombie} position={worldToScreen(zombie.position)} isTargeted={zombie.id === targetedZombieId} />)}

        {phase === 'arena' && isZombieKingAlive(zombieKing) && zombieKing && (
          <ZombieAvatar zombie={zombieKing} position={worldToScreen(zombieKing.position)} isTargeted={zombieKing.id === targetedZombieId} />
        )}

        {phase === 'arena' &&
          bots
            .filter((bot) => arenaMode === 'main' || duelState?.fighters.includes(bot.clientId))
            .map((bot) => <PlayerAvatar key={bot.clientId} player={bot} position={worldToScreen(bot.position)} />)}

        {(phase === 'lobby' || arenaMode === 'main' || playerInActiveDuel) && (
          <PlayerAvatar player={playerSnapshot} position={worldToScreen(playerSnapshot.position)} isLocal equippedItem={equippedItem} />
        )}
      </div>

      {shopOpen && (
        <div className="shop-ui" role="dialog" aria-label="Shop">
          <div className="shop-ui-header">
            <h3>SHOP</h3>
            <button
              type="button"
              aria-label="Close shop"
              onClick={() => {
                setShopOpen(false);
                setShopDismissed(true);
              }}
            >
              X
            </button>
          </div>
          <div className="shop-grid">
            {shopItems.map((item) => (
              <div className="shop-card" key={item}>
                <div className="shop-card-title">{item}</div>
                <button type="button">Buy</button>
                <div className="coin-stack">
                  <span className="cash" />
                  <span className="bag">$</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mobile-controls" aria-label="Movement controls">
        <button type="button" onClick={() => move(0, -movementStep)}>
          Up
        </button>
        <div>
          <button type="button" onClick={() => move(-movementStep, 0)}>
            Left
          </button>
          <button type="button" onClick={() => move(0, movementStep)}>
            Down
          </button>
          <button type="button" onClick={() => move(movementStep, 0)}>
            Right
          </button>
        </div>
      </div>
      </section>
    </>
  );
}
