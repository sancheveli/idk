import { useEffect, useMemo, useRef, useState } from 'react';

type LobbyProps = {
  nickname: string;
  userId: string;
};

type Position = {
  x: number;
  y: number;
};

type GamePhase = 'lobby' | 'arena';
type Direction = 'front' | 'back' | 'left' | 'right';
type ServerEvent =
  | 'You will get a sword'
  | 'Something will explode'
  | 'SURVIVE THE DOOMSDAY'
  | 'Zombie apocalypse'
  | 'You must battle to death'
  | 'FREEZE'
  | 'You will find out you are rapid'
  | 'You will get your leg lost'
  | 'You will turn blue'
  | 'You will turn red'
  | 'You will turn green';
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
  battleNpcs: BattleNpc[];
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
};
type BattleNpc = {
  id: string;
  spawnedAt: number;
  position: Position;
  targetClientId: string;
  direction: Direction;
  swordSwinging: boolean;
};
type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};
type BoundsResolver = Bounds | ((width: number, height: number) => Bounds);

const baseStep = 14;
const rapidStep = 24;
const worldWidth = 1080;
const worldHeight = 560;
const lobbyDuration = 30;
const arenaDuration = 180;
const roundDuration = lobbyDuration + arenaDuration;
const eventInterval = 10;
const arenaEventSlots = Math.floor(arenaDuration / eventInterval) - 1;
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
const shopItems = ['1,000 Coins', '10,000 Coins', '25,000 Coins', '50,000 Coins', '75,000 Coins', '100,000 Coins'];
const serverAnnouncements: ServerEvent[] = [
  'You will get a sword',
  'Something will explode',
  'SURVIVE THE DOOMSDAY',
  'Zombie apocalypse',
  'You must battle to death',
  'FREEZE',
  'You will find out you are rapid',
  'You will get your leg lost',
  'You will turn blue',
  'You will turn red',
  'You will turn green',
];
const explosiveObjects = ['arena-wall-top', 'arena-wall-bottom', 'arena-wall-left', 'arena-wall-right', 'fort-red', 'fort-blue', 'column-one', 'column-two', 'column-three'];
const fireDuration = 12000;
const fireDamage = 30;
const doomsdayDamage = 60;
const doomsdayInterval = 2000;
const doomsdayWarningDuration = 1000;
const doomsdayPostHitDuration = 900;
const doomsdayRadius = 84;
const doomsdayBaseWidth = 1080;
const doomsdayBaseHeight = 560;
const zombieDamage = 50;
const zombieSpeed = 28;
const battleNpcMaxHealth = 75;
const battleNpcDamage = 10;
const battleNpcSpeed = 34;
const battleNpcSwingInterval = 900;
const freezeDuration = 20000;
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
};
const lobbyObstacleBounds: Bounds[] = [
  { x: 421, y: 98, width: 238, height: 144 },
  { x: 60, y: 316, width: 98, height: 190 },
  { x: 922, y: 316, width: 98, height: 190 },
  { x: 220, y: 40, width: 98, height: 186 },
  { x: 762, y: 334, width: 98, height: 154 },
  { x: 281, y: 374, width: 80, height: 122 },
  { x: 724, y: 382, width: 80, height: 122 },
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

function hashText(text: string) {
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function getDeterministicEvent(serverId: string, roundNumber: number, eventSlot: number, excludedEvents: ServerEvent[] = []) {
  if (eventSlot === getDeterministicDoomsdaySlot(serverId, roundNumber)) return 'SURVIVE THE DOOMSDAY';
  if (eventSlot === getDeterministicZombieSlot(serverId, roundNumber)) return 'Zombie apocalypse';
  if (eventSlot === getDeterministicBattleNpcSlot(serverId, roundNumber)) return 'You must battle to death';

  const reservedEvents: ServerEvent[] = ['SURVIVE THE DOOMSDAY', 'Zombie apocalypse', 'You must battle to death'];
  const unavailableEvents = new Set<ServerEvent>([...reservedEvents, ...excludedEvents]);
  const availableEvents = serverAnnouncements.filter((event) => !unavailableEvents.has(event));
  const eventIndex = hashText(`${serverId}:${roundNumber}:${eventSlot}:event`) % availableEvents.length;
  return availableEvents[eventIndex];
}

function getDeterministicDoomsdaySlot(serverId: string, roundNumber: number) {
  return (hashText(`${serverId}:${roundNumber}:doom-slot`) % arenaEventSlots) + 1;
}

function getDeterministicZombieSlot(serverId: string, roundNumber: number) {
  const doomsdaySlot = getDeterministicDoomsdaySlot(serverId, roundNumber);
  const zombieSlot = (hashText(`${serverId}:${roundNumber}:zombie-slot`) % arenaEventSlots) + 1;
  return zombieSlot === doomsdaySlot ? (zombieSlot % arenaEventSlots) + 1 : zombieSlot;
}

function getDeterministicBattleNpcSlot(serverId: string, roundNumber: number) {
  const reservedSlots = new Set([getDeterministicDoomsdaySlot(serverId, roundNumber), getDeterministicZombieSlot(serverId, roundNumber)]);
  let battleSlot = (hashText(`${serverId}:${roundNumber}:battle-npc-slot`) % arenaEventSlots) + 1;

  while (reservedSlots.has(battleSlot)) {
    battleSlot = (battleSlot % arenaEventSlots) + 1;
  }

  return battleSlot;
}

function getDeterministicExplosiveObject(serverId: string, roundNumber: number, eventSlot: number, usedObjects: string[]) {
  const availableObjects = explosiveObjects.filter((object) => !usedObjects.includes(object));
  if (availableObjects.length === 0) return undefined;

  const objectIndex = hashText(`${serverId}:${roundNumber}:${eventSlot}:explode`) % availableObjects.length;
  return availableObjects[objectIndex];
}

function getBaseObjectBounds(objectId: string) {
  const boundsResolver = desktopFireBounds[objectId];
  return typeof boundsResolver === 'function' ? boundsResolver(doomsdayBaseWidth, doomsdayBaseHeight) : boundsResolver;
}

function getFallbackFireBounds(serverId: string, roundNumber: number, eventSlot: number) {
  const xHash = hashText(`${serverId}:${roundNumber}:${eventSlot}:fallback-fire-x`);
  const yHash = hashText(`${serverId}:${roundNumber}:${eventSlot}:fallback-fire-y`);

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
  return !collidesCharacterWithBounds(getZombiePathWorldPosition(cell), obstacleBounds);
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

function getDeterministicDoomsdayTarget(serverId: string, roundNumber: number, eventSlot: number, strikeIndex: number, usedObjects: string[]) {
  const availableObjects = explosiveObjects.filter((objectId) => !usedObjects.includes(objectId));
  if (availableObjects.length === 0) return undefined;

  const targetIndex = hashText(`${serverId}:${roundNumber}:${eventSlot}:${strikeIndex}:doom-target`) % availableObjects.length;
  return availableObjects[targetIndex];
}

function getDeterministicDoomsdayStrike(
  serverId: string,
  roundNumber: number,
  eventSlot: number,
  strikeIndex: number,
  startedAt: number,
  usedObjects: string[],
): DoomsdayStrike {
  const targetObject = getDeterministicDoomsdayTarget(serverId, roundNumber, eventSlot, strikeIndex, usedObjects);
  const targetBounds = targetObject ? getBaseObjectBounds(targetObject) : undefined;
  const xHash = hashText(`${serverId}:${roundNumber}:${eventSlot}:${strikeIndex}:doom-x`);
  const yHash = hashText(`${serverId}:${roundNumber}:${eventSlot}:${strikeIndex}:doom-y`);
  const x = targetBounds ? targetBounds.x + targetBounds.width / 2 : 70 + (xHash % 940);
  const y = targetBounds ? targetBounds.y + targetBounds.height / 2 : 95 + (yHash % 395);

  return {
    id: `${roundNumber}-${eventSlot}-${strikeIndex}`,
    x,
    y,
    radius: doomsdayRadius,
    startedAt,
    hitAt: startedAt + doomsdayWarningDuration,
  };
}

function getDeterministicTarget(clientIds: string[], serverId: string, roundNumber: number, eventSlot: number) {
  if (clientIds.length === 0) return '';
  const targetIndex = hashText(`${serverId}:${roundNumber}:${eventSlot}:target`) % clientIds.length;
  return clientIds[targetIndex];
}

function getPlayerByClientId(players: PlayerSnapshot[], clientId: string) {
  return players.find((player) => player.clientId === clientId);
}

function getDeterministicZombieSpawn(serverId: string, roundNumber: number, eventSlot: number, targetClientId: string, clientIds: string[]) {
  const targetSpawn = getSpawnSlot('arena', targetClientId, clientIds);
  const angleHash = hashText(`${serverId}:${roundNumber}:${eventSlot}:${targetClientId}:zombie-angle`);
  const distanceHash = hashText(`${serverId}:${roundNumber}:${eventSlot}:${targetClientId}:zombie-distance`);
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

function getDeterministicBattleNpcSpawn(serverId: string, roundNumber: number, eventSlot: number, targetClientId: string, clientIds: string[]) {
  const targetSpawn = getSpawnSlot('arena', targetClientId, clientIds);
  const side = hashText(`${serverId}:${roundNumber}:${eventSlot}:${targetClientId}:battle-side`) % 4;
  const distance = 124;
  const offsets = [
    { x: distance, y: 0 },
    { x: -distance, y: 0 },
    { x: 0, y: distance },
    { x: 0, y: -distance },
  ];
  const offset = offsets[side];

  return {
    x: clamp(targetSpawn.x + offset.x, 34, worldWidth - 34),
    y: clamp(targetSpawn.y + offset.y, 88, worldHeight - 34),
  };
}

function getDirectionToward(from: Position, to: Position): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'front' : 'back';
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
    battleNpcs: [],
  };
}

function getRoundSnapshot(serverId: string, roomStartedAt: number, now: number, players: PlayerSnapshot[]): RoundSnapshot {
  const elapsedSeconds = Math.max(0, Math.floor((now - roomStartedAt) / 1000));
  const totalSeconds = elapsedSeconds;
  const roundNumber = Math.floor(totalSeconds / roundDuration);
  const roundSecond = totalSeconds % roundDuration;
  const clientIds = players.map((player) => player.clientId).sort();

  if (roundSecond < lobbyDuration) {
    return {
      phase: 'lobby',
      timeLeft: lobbyDuration - roundSecond,
      roundEndsAt: now + (lobbyDuration - roundSecond) * 1000,
      hiddenArenaObjects: [],
      serverAnnouncement: '',
      arenaElapsed: 0,
      roundNumber,
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
      battleNpcs: [],
    };
  }

  const arenaElapsed = roundSecond - lobbyDuration;
  const eventSlot = Math.floor(arenaElapsed / eventInterval);
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
  const battleNpcs: BattleNpc[] = [];
  let serverAnnouncement = eventSlot > 0 ? 'Arena events starting...' : '';
  let doomsdayUsed = false;

  for (let slot = 1; slot <= eventSlot; slot += 1) {
    const event = getDeterministicEvent(serverId, roundNumber, slot, doomsdayUsed ? ['SURVIVE THE DOOMSDAY'] : []);
    serverAnnouncement = event;

    if (event === 'Something will explode') {
      const explodedObject = getDeterministicExplosiveObject(serverId, roundNumber, slot, hiddenArenaObjects);
      const fallbackBounds = getFallbackFireBounds(serverId, roundNumber, slot);

      if (explodedObject) {
        const bounds = getBaseObjectBounds(explodedObject) ?? fallbackBounds;

        hiddenArenaObjects.push(explodedObject);
        fireHazards.push({
          id: `${roundNumber}-${slot}-${explodedObject}`,
          objectId: explodedObject,
          bounds,
          startedAt: roomStartedAt + (lobbyDuration + slot * eventInterval) * 1000,
        });
      } else {
        fireHazards.push({
          id: `${roundNumber}-${slot}-fallback-fire`,
          objectId: '',
          bounds: fallbackBounds,
          startedAt: roomStartedAt + (lobbyDuration + slot * eventInterval) * 1000,
        });
      }
    }

    if (event === 'SURVIVE THE DOOMSDAY') {
      doomsdayUsed = true;
      const eventStartedAt = roomStartedAt + (lobbyDuration + slot * eventInterval) * 1000;
      const strikesPerEvent = Math.floor(eventInterval * 1000 / doomsdayInterval);
      const targetedDoomsdayObjects: string[] = [];

      for (let strikeIndex = 0; strikeIndex < strikesPerEvent; strikeIndex += 1) {
        const strikeStartedAt = eventStartedAt + strikeIndex * doomsdayInterval;
        const usedObjects = [...hiddenArenaObjects, ...targetedDoomsdayObjects];
        const targetObject = getDeterministicDoomsdayTarget(serverId, roundNumber, slot, strikeIndex, usedObjects);
        if (targetObject) targetedDoomsdayObjects.push(targetObject);

        const strike = getDeterministicDoomsdayStrike(serverId, roundNumber, slot, strikeIndex, strikeStartedAt, usedObjects);
        const isVisible = slot === eventSlot && now >= strike.startedAt && now < strike.hitAt + doomsdayPostHitDuration;
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

    if (event === 'Zombie apocalypse') {
      const eventStartedAt = roomStartedAt + (lobbyDuration + slot * eventInterval) * 1000;

      if (now >= eventStartedAt) {
        const activeObstacleBounds = getActiveObjectBounds(hiddenArenaObjects);

        clientIds.forEach((targetClientId) => {
          const targetPlayer = getPlayerByClientId(players, targetClientId);
          const targetPosition = targetPlayer?.phase === 'arena' && !targetPlayer.isDead ? targetPlayer.position : getSpawnSlot('arena', targetClientId, clientIds);
          const spawn = getDeterministicZombieSpawn(serverId, roundNumber, slot, targetClientId, clientIds);
          const zombiePosition = getZombiePosition(spawn, targetPosition, now - eventStartedAt, activeObstacleBounds);

          zombies.push({
            id: `${roundNumber}-${slot}-${targetClientId}`,
            spawnedAt: eventStartedAt,
            position: zombiePosition,
            targetClientId,
          });
        });
      }
    }

    if (event === 'You must battle to death') {
      const eventStartedAt = roomStartedAt + (lobbyDuration + slot * eventInterval) * 1000;

      if (now >= eventStartedAt) {
        const activeObstacleBounds = getActiveObjectBounds(hiddenArenaObjects);

        clientIds.forEach((targetClientId) => {
          const targetPlayer = getPlayerByClientId(players, targetClientId);
          const targetPosition = targetPlayer?.phase === 'arena' && !targetPlayer.isDead ? targetPlayer.position : getSpawnSlot('arena', targetClientId, clientIds);
          const spawn = getDeterministicBattleNpcSpawn(serverId, roundNumber, slot, targetClientId, clientIds);
          const npcPosition = getPathChasePosition(spawn, targetPosition, now - eventStartedAt, activeObstacleBounds, battleNpcSpeed);

          battleNpcs.push({
            id: `${roundNumber}-${slot}-${targetClientId}`,
            spawnedAt: eventStartedAt,
            position: npcPosition,
            targetClientId,
            direction: getDirectionToward(npcPosition, targetPosition),
            swordSwinging: Math.floor((now - eventStartedAt) / battleNpcSwingInterval) % 2 === 0,
          });
        });
      }
    }

    const targetClientId = getDeterministicTarget(clientIds, serverId, roundNumber, slot);

    if (event === 'You will get a sword' && targetClientId) {
      targetedEffects.sword.push(targetClientId);
    }

    if (event === 'You will find out you are rapid' && targetClientId) {
      targetedEffects.rapid.push(targetClientId);
    }

    if (event === 'You will get your leg lost' && targetClientId) {
      targetedEffects.missingRightLeg.push(targetClientId);
    }

    if (event === 'You will turn blue' && targetClientId) {
      targetedEffects.red = targetedEffects.red.filter((clientId) => clientId !== targetClientId);
      targetedEffects.green = targetedEffects.green.filter((clientId) => clientId !== targetClientId);
      targetedEffects.blue.push(targetClientId);
    }

    if (event === 'You will turn red' && targetClientId) {
      targetedEffects.blue = targetedEffects.blue.filter((clientId) => clientId !== targetClientId);
      targetedEffects.green = targetedEffects.green.filter((clientId) => clientId !== targetClientId);
      targetedEffects.red.push(targetClientId);
    }

    if (event === 'You will turn green' && targetClientId) {
      targetedEffects.blue = targetedEffects.blue.filter((clientId) => clientId !== targetClientId);
      targetedEffects.red = targetedEffects.red.filter((clientId) => clientId !== targetClientId);
      targetedEffects.green.push(targetClientId);
    }

    if (event === 'FREEZE' && targetClientId) {
      const eventStartedAt = roomStartedAt + (lobbyDuration + slot * eventInterval) * 1000;
      if (now >= eventStartedAt + freezeDuration) continue;

      targetedEffects.frozen.push(targetClientId);
      targetedEffects.frozenIds.push(`${roundNumber}-${slot}-${targetClientId}`);
    }
  }

  return {
    phase: 'arena',
    timeLeft: arenaDuration - arenaElapsed,
    roundEndsAt: now + (arenaDuration - arenaElapsed) * 1000,
    hiddenArenaObjects,
    serverAnnouncement,
    arenaElapsed,
    roundNumber,
    targetedEffects,
    fireHazards: fireHazards.filter((hazard) => now - hazard.startedAt < fireDuration),
    doomsdayStrikes,
    zombies,
    battleNpcs,
  };
}

function getSpawnSlot(nextPhase: GamePhase, clientId: string, clientIds: string[]) {
  const spawnSlots = nextPhase === 'lobby' ? lobbySpawnSlots : arenaSpawnSlots;
  const sortedClientIds = clientIds.length > 0 ? [...clientIds].sort() : [clientId];
  const slotIndex = Math.max(0, sortedClientIds.indexOf(clientId)) % spawnSlots.length;
  return spawnSlots[slotIndex];
}

function PlayerAvatar({ player, position, isLocal }: { player: PlayerSnapshot; position: Position; isLocal?: boolean }) {
  if (player.phase === 'arena' && player.isDead) return null;

  return (
    <div
      className={`player ${isLocal ? 'current-player' : 'remote-player'} ${player.direction} ${
        player.isBlue ? 'blue-player' : ''
      } ${player.isRed ? 'red-player' : ''} ${player.isGreen ? 'green-player' : ''} ${
        player.isFrozen ? 'frozen-player' : ''
      } ${player.missingRightLeg ? 'missing-right-leg' : ''}`}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
    >
      <div className="nameplate">{player.nickname}</div>
      {player.phase === 'arena' && (
        <div className="health-bar" aria-label="Health">
          <span style={{ width: `${player.health}%` }} />
        </div>
      )}
      <div className="stickman">
        <span className="head" />
        <span className="torso" />
        <span className="arm left-arm" />
        <span className="arm right-arm" />
        <span className="leg left-leg" />
        <span className="leg right-leg" />
        {player.phase === 'arena' && player.hasSword && (
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
      </div>
    </div>
  );
}

function ZombieAvatar({ position }: { position: Position }) {
  return (
    <div className="zombie" style={{ left: `${position.x}px`, top: `${position.y}px` }}>
      <div className="zombie-stickman">
        <span className="head" />
        <span className="torso" />
        <span className="arm left-arm" />
        <span className="arm right-arm" />
        <span className="leg left-leg" />
        <span className="leg right-leg" />
      </div>
    </div>
  );
}

function BattleNpcAvatar({ npc, position, health }: { npc: BattleNpc; position: Position; health: number }) {
  return (
    <div className={`player battle-npc ${npc.direction}`} style={{ left: `${position.x}px`, top: `${position.y}px` }}>
      <div className="nameplate">Brawler</div>
      <div className="health-bar" aria-label="NPC health">
        <span style={{ width: `${(health / battleNpcMaxHealth) * 100}%` }} />
      </div>
      <div className="stickman">
        <span className="head" />
        <span className="torso" />
        <span className="arm left-arm" />
        <span className="arm right-arm" />
        <span className="leg left-leg" />
        <span className="leg right-leg" />
        <button type="button" className={`classic-sword ${npc.swordSwinging ? 'swing' : ''}`} aria-label="NPC sword" tabIndex={-1}>
          <span className="sword-blade" />
          <span className="sword-guard" />
          <span className="sword-handle" />
        </button>
      </div>
    </div>
  );
}

export function Lobby({ nickname, userId }: LobbyProps) {
  const clientId = useMemo(() => getClientId(userId), [userId]);
  const joinedAtRef = useRef(Date.now());
  const [phase, setPhase] = useState<GamePhase>('lobby');
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
  const [battleNpcs, setBattleNpcs] = useState<BattleNpc[]>([]);
  const [battleNpcHealth, setBattleNpcHealth] = useState<Record<string, number>>({});
  const [health, setHealth] = useState(100);
  const [isDead, setIsDead] = useState(false);
  const [roomStartedAt, setRoomStartedAt] = useState(joinedAtRef.current);
  const [roundSeed, setRoundSeed] = useState(0);
  const [spawnPlaced, setSpawnPlaced] = useState(false);
  const pressedKeys = useRef(new Set<string>());
  const frameRef = useRef<HTMLDivElement | null>(null);
  const swordTimerRef = useRef<number | null>(null);
  const swordSwingStartedAtRef = useRef(0);
  const playerSnapshotRef = useRef<PlayerSnapshot | null>(null);
  const damagedFireIdsRef = useRef(new Set<string>());
  const damagedDoomsdayIdsRef = useRef(new Set<string>());
  const killedZombieIdsRef = useRef(new Set<string>());
  const damagedZombieIdsRef = useRef(new Set<string>());
  const zombiePositionCacheRef = useRef(new Map<string, Position>());
  const zombiePositionUpdatedAtRef = useRef(Date.now());
  const battleNpcPositionCacheRef = useRef(new Map<string, Position>());
  const battleNpcPositionUpdatedAtRef = useRef(Date.now());
  const damagedBattleNpcSwingIdsRef = useRef(new Set<string>());
  const damagedBattleNpcFireIdsRef = useRef(new Set<string>());
  const damagedBattleNpcDoomsdayIdsRef = useRef(new Set<string>());
  const battleNpcHitAtRef = useRef(new Map<string, number>());
  const frozenUntilRef = useRef(0);
  const handledFreezeIdsRef = useRef(new Set<string>());
  const gameStateRef = useRef<GameStateSnapshot>({
    phase: 'lobby',
    roundEndsAt: Date.now() + lobbyDuration * 1000,
    hiddenArenaObjects: [],
    serverAnnouncement: '',
  });
  const movementStep = isRapid && phase === 'arena' ? rapidStep : baseStep;
  const canMove = !isDead && !isFrozen;

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
  const roomPlayerIds = useMemo(() => [clientId], [clientId]);
  const roomPlayerIdsRef = useRef(roomPlayerIds);
  const visibleBattleNpcs = useMemo(
    () => battleNpcs.filter((npc) => (battleNpcHealth[npc.id] ?? battleNpcMaxHealth) > 0),
    [battleNpcHealth, battleNpcs],
  );

  useEffect(() => {
    playerSnapshotRef.current = playerSnapshot;
  }, [playerSnapshot]);

  useEffect(() => {
    roomPlayerIdsRef.current = roomPlayerIds;
  }, [roomPlayerIds]);

  useEffect(() => {
    if (phase !== 'arena') return;

    setBattleNpcHealth((current) => {
      let changed = false;
      const next = { ...current };

      battleNpcs.forEach((npc) => {
        if (next[npc.id] === undefined) {
          next[npc.id] = battleNpcMaxHealth;
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [battleNpcs, phase]);

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

  function applyRoundSnapshot(nextSnapshot: RoundSnapshot) {
    const phaseChanged = gameStateRef.current.phase !== nextSnapshot.phase;
    const enteringLobby = phaseChanged && nextSnapshot.phase === 'lobby';

    gameStateRef.current = {
      phase: nextSnapshot.phase,
      roundEndsAt: nextSnapshot.roundEndsAt,
      hiddenArenaObjects: nextSnapshot.hiddenArenaObjects,
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
      damagedFireIdsRef.current.clear();
      damagedDoomsdayIdsRef.current.clear();
      killedZombieIdsRef.current.clear();
      damagedZombieIdsRef.current.clear();
      handledFreezeIdsRef.current.clear();
      damagedBattleNpcSwingIdsRef.current.clear();
      damagedBattleNpcFireIdsRef.current.clear();
      damagedBattleNpcDoomsdayIdsRef.current.clear();
      battleNpcHitAtRef.current.clear();
      battleNpcPositionCacheRef.current.clear();
      setBattleNpcHealth({});
    }

    setPhase(nextSnapshot.phase);
    setTimeLeft(nextSnapshot.timeLeft);
    setRoundEndsAt(nextSnapshot.roundEndsAt);
    setHiddenArenaObjects(nextSnapshot.hiddenArenaObjects);
    setFireHazards(nextSnapshot.fireHazards);
    setDoomsdayStrikes(nextSnapshot.doomsdayStrikes);
    setZombies(getSmoothedZombies(nextSnapshot.zombies, nextSnapshot.hiddenArenaObjects, nextSnapshot.phase));
    setBattleNpcs(getSmoothedBattleNpcs(nextSnapshot.battleNpcs, nextSnapshot.hiddenArenaObjects, nextSnapshot.phase));
    setServerAnnouncement(nextSnapshot.serverAnnouncement);
    setHasSword(!enteringLobby && !isDead && nextSnapshot.targetedEffects.sword.includes(clientId));
    setIsRapid(!enteringLobby && !isDead && nextSnapshot.targetedEffects.rapid.includes(clientId));
    setMissingRightLeg(!enteringLobby && !isDead && nextSnapshot.targetedEffects.missingRightLeg.includes(clientId));
    setIsBlue(!enteringLobby && !isDead && nextSnapshot.targetedEffects.blue.includes(clientId));
    setIsRed(!enteringLobby && !isDead && nextSnapshot.targetedEffects.red.includes(clientId));
    setIsGreen(!enteringLobby && !isDead && nextSnapshot.targetedEffects.green.includes(clientId));
    if (enteringLobby || isDead) {
      frozenUntilRef.current = 0;
      setIsFrozen(false);
    } else if (nextSnapshot.targetedEffects.frozen.includes(clientId)) {
      const newFreezeId = nextSnapshot.targetedEffects.frozenIds.find((freezeId) => !handledFreezeIdsRef.current.has(freezeId));

      if (newFreezeId) {
        handledFreezeIdsRef.current.add(newFreezeId);
        frozenUntilRef.current = Date.now() + freezeDuration;
      }
      setIsFrozen(Date.now() < frozenUntilRef.current);
    } else {
      setIsFrozen(Date.now() < frozenUntilRef.current);
    }
  }

  function damagePlayer(amount: number) {
    if (phase !== 'arena' || isDead) return;

    setHealth((current) => {
      const nextHealth = Math.max(0, current - amount);
      if (nextHealth <= 0) {
        setIsDead(true);
        setSwordSwinging(false);
        pressedKeys.current.clear();
      }
      return nextHealth;
    });
  }

  function damageBattleNpc(npcId: string, amount: number) {
    setBattleNpcHealth((current) => ({
      ...current,
      [npcId]: Math.max(0, (current[npcId] ?? battleNpcMaxHealth) - amount),
    }));
  }

  function getRoomPlayerSnapshots() {
    const localSnapshot = playerSnapshotRef.current;
    return localSnapshot ? [localSnapshot] : [];
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

  function getSmoothedBattleNpcs(nextNpcs: BattleNpc[], hiddenObjectIds: string[], nextPhase: GamePhase) {
    if (nextPhase !== 'arena') {
      battleNpcPositionCacheRef.current.clear();
      battleNpcPositionUpdatedAtRef.current = Date.now();
      return nextNpcs;
    }

    const now = Date.now();
    const elapsedMs = Math.min(350, Math.max(0, now - battleNpcPositionUpdatedAtRef.current));
    const obstacleBounds = getActiveObjectBounds(hiddenObjectIds);
    const activeNpcIds = new Set(nextNpcs.map((npc) => npc.id));
    const nextCache = new Map<string, Position>();

    nextNpcs.forEach((npc) => {
      const previousPosition = battleNpcPositionCacheRef.current.get(npc.id);
      const nextPosition = previousPosition
        ? getPathChasePosition(previousPosition, npc.position, elapsedMs, obstacleBounds, battleNpcSpeed)
        : npc.position;

      nextCache.set(npc.id, nextPosition);
    });

    battleNpcPositionCacheRef.current.forEach((_position, npcId) => {
      if (!activeNpcIds.has(npcId)) battleNpcPositionCacheRef.current.delete(npcId);
    });

    battleNpcPositionCacheRef.current = nextCache;
    battleNpcPositionUpdatedAtRef.current = now;

    return nextNpcs.map((npc) => {
      const nextPosition = nextCache.get(npc.id) ?? npc.position;

      return {
        ...npc,
        position: nextPosition,
        direction: getDirectionToward(nextPosition, position),
      };
    });
  }

  useEffect(() => {
    function applyCurrentRoundSnapshot() {
      const now = Date.now();
      const snapshot = getRoundSnapshot(`local-game-${roundSeed}`, roomStartedAt, now, getRoomPlayerSnapshots());

      if (snapshot.phase === 'lobby') {
        applyRoundSnapshot(snapshot);
        return;
      }

      const arenaPlayers = getRoomPlayerSnapshots().filter((player) => player.phase === 'arena');
      const allArenaPlayersDead = arenaPlayers.length > 0 && arenaPlayers.every((player) => player.isDead);

      if (allArenaPlayersDead) {
        setRoomStartedAt(now);
        setRoundSeed((current) => current + 1);
        applyRoundSnapshot(getLobbySnapshot(snapshot.roundNumber + 1, now, now));
        return;
      }

      applyRoundSnapshot(snapshot);
    }

    applyCurrentRoundSnapshot();
    const timer = window.setInterval(() => {
      applyCurrentRoundSnapshot();
    }, 250);

    return () => window.clearInterval(timer);
  }, [isDead, phase, roomStartedAt, roundSeed]);

  useEffect(() => {
    if (phase !== 'arena' || isDead) return;

    fireHazards.forEach((hazard) => {
      if (damagedFireIdsRef.current.has(hazard.id)) return;
      if (!collidesWithFire(hazard)) return;

      damagedFireIdsRef.current.add(hazard.id);
      damagePlayer(fireDamage);
    });
  }, [fireHazards, isDead, phase, position]);

  useEffect(() => {
    if (phase !== 'arena' || isDead) return;
    const now = Date.now();

    doomsdayStrikes.forEach((strike) => {
      if (now < strike.hitAt) return;
      if (damagedDoomsdayIdsRef.current.has(strike.id)) return;
      if (!collidesWithDoomsdayStrike(strike)) return;

      damagedDoomsdayIdsRef.current.add(strike.id);
      damagePlayer(doomsdayDamage);
    });
  }, [doomsdayStrikes, isDead, phase, position]);

  useEffect(() => {
    if (phase !== 'arena') return;
    const now = Date.now();

    zombies.forEach((zombie) => {
      if (killedZombieIdsRef.current.has(zombie.id)) return;

      const killedByFire = fireHazards.some((hazard) => collidesZombieWithFire(zombie, hazard));
      const killedByDoomsday = doomsdayStrikes.some((strike) => now >= strike.hitAt && collidesZombieWithDoomsdayStrike(zombie, strike));

      if (killedByFire || killedByDoomsday) {
        killedZombieIdsRef.current.add(zombie.id);
        return;
      }

      if (isDead || damagedZombieIdsRef.current.has(zombie.id) || !collidesWithZombie(zombie)) return;

      damagedZombieIdsRef.current.add(zombie.id);
      killedZombieIdsRef.current.add(zombie.id);
      damagePlayer(zombieDamage);
    });
  }, [doomsdayStrikes, fireHazards, isDead, phase, position, zombies]);

  useEffect(() => {
    if (phase !== 'arena') return;
    const now = Date.now();

    visibleBattleNpcs.forEach((npc) => {
      fireHazards.forEach((hazard) => {
        const hitId = `${npc.id}:${hazard.id}`;
        if (damagedBattleNpcFireIdsRef.current.has(hitId)) return;
        if (!collidesCharacterWithFire(npc.position, hazard)) return;

        damagedBattleNpcFireIdsRef.current.add(hitId);
        damageBattleNpc(npc.id, fireDamage);
      });

      doomsdayStrikes.forEach((strike) => {
        const hitId = `${npc.id}:${strike.id}`;
        if (now < strike.hitAt || damagedBattleNpcDoomsdayIdsRef.current.has(hitId)) return;
        if (!collidesCharacterWithDoomsdayStrike(npc.position, strike)) return;

        damagedBattleNpcDoomsdayIdsRef.current.add(hitId);
        damageBattleNpc(npc.id, doomsdayDamage);
      });
    });
  }, [doomsdayStrikes, fireHazards, phase, visibleBattleNpcs]);

  useEffect(() => {
    if (phase !== 'arena') return;

    if (hasSword && swordSwinging) {
      const swingId = `${swordSwingStartedAtRef.current}:${direction}`;
      const swordBox = getSwordHitBox(position, direction);

      visibleBattleNpcs.forEach((npc) => {
        const hitId = `${npc.id}:${swingId}`;
        if (damagedBattleNpcSwingIdsRef.current.has(hitId)) return;
        if (!boxesOverlap(swordBox, getCharacterBox(npc.position))) return;

        damagedBattleNpcSwingIdsRef.current.add(hitId);
        damageBattleNpc(npc.id, battleNpcDamage);
      });
    }

    if (isDead) return;

    const now = Date.now();
    visibleBattleNpcs.forEach((npc) => {
      if (!npc.swordSwinging) return;
      if (!boxesOverlap(getSwordHitBox(npc.position, npc.direction), getCharacterBox(position))) return;
      if (now - (battleNpcHitAtRef.current.get(npc.id) ?? 0) < battleNpcSwingInterval) return;

      battleNpcHitAtRef.current.set(npc.id, now);
      damagePlayer(battleNpcDamage);
    });
  }, [direction, hasSword, isDead, phase, position, swordSwinging, visibleBattleNpcs]);

  useEffect(() => {
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
  }, [canMove, hiddenArenaObjects, movementStep, phase]);

  useEffect(() => {
    if (isFrozen) pressedKeys.current.clear();
  }, [isFrozen]);

  useEffect(() => {
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
  }, [phase, position, shopDismissed]);

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
    if (isDead) return;

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

  return (
    <section className="lobby">
      <div className="lobby-topbar">
        <div>
          <p className="eyebrow">Classic lobby</p>
          <h2>{phase === 'lobby' ? 'Spawn Plaza' : 'Brickbattle Arena'}</h2>
        </div>
        <div className="round-info">
          <p className="round-label">{phase === 'lobby' ? 'Teleporting in' : 'Round ends in'}</p>
          <p className="round-timer">{formatTime(timeLeft)}</p>
        </div>
      </div>

      {phase === 'arena' && serverAnnouncement && (
        <div className="server-announcement" role="status" aria-live="polite">
          <span>Arena Event</span>
          <p>{serverAnnouncement}</p>
        </div>
      )}

      <div
        ref={frameRef}
        className={`game-frame ${phase}`}
        aria-label="2D classic map"
        onPointerDown={() => {
          if (phase === 'arena') swingSword();
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
        ) : (
          <>
            <div className="arena-center">
              <span>ARENA</span>
            </div>
            {!hiddenArenaObjects.includes('arena-wall-top') && <div className="arena-wall arena-wall-top solid-obstacle" />}
            {!hiddenArenaObjects.includes('arena-wall-bottom') && <div className="arena-wall arena-wall-bottom solid-obstacle" />}
            {!hiddenArenaObjects.includes('arena-wall-left') && <div className="arena-wall arena-wall-left solid-obstacle" />}
            {!hiddenArenaObjects.includes('arena-wall-right') && <div className="arena-wall arena-wall-right solid-obstacle" />}
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
          </>
        )}

        {phase === 'arena' &&
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

        {phase === 'arena' &&
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
            .map((zombie) => <ZombieAvatar key={zombie.id} position={worldToScreen(zombie.position)} />)}

        {phase === 'arena' &&
          visibleBattleNpcs.map((npc) => (
            <BattleNpcAvatar
              key={npc.id}
              npc={npc}
              position={worldToScreen(npc.position)}
              health={battleNpcHealth[npc.id] ?? battleNpcMaxHealth}
            />
          ))}

        <PlayerAvatar player={playerSnapshot} position={worldToScreen(playerSnapshot.position)} isLocal />
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
  );
}
