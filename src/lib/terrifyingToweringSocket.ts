import { io, type Socket } from 'socket.io-client';

export type TowerDecorationState = {
  roofColor: string;
  bodyColor: string;
  windowColor: string;
  updatedBy: string;
  updatedAt: number;
};

export type TowerRemotePlayer = {
  clientId: string;
  userId: string;
  nickname: string;
  position: {
    x: number;
    y: number;
  };
  direction: 'front' | 'back' | 'left' | 'right';
  connected: boolean;
  updatedAt: number;
  decorations: TowerDecorationState;
  slot: number;
  status: 'ready' | 'alive' | 'waiting';
  hp: number;
  hasSword: boolean;
  hasPizza: boolean;
  hasWarp: boolean;
  frozenUntil: number;
  isFat: boolean;
};

export type TowerServerEvent = {
  id: string;
  message: string;
  selectedAt: number;
};

export type TowerSnapshot = {
  roomId: string;
  phase: 'lobby' | 'arena';
  players: TowerRemotePlayer[];
  decorations: TowerDecorationState;
  currentEvent: TowerServerEvent;
  roundStartedAt: number;
  nextEventAt: number;
  eventSlot: number;
  winnerId: string;
  winnerName: string;
  effects: {
    loweredTowers: Array<{ slot: number; until: number }>;
    hiddenTowers: Array<{ slot: number; until: number }>;
    bombs: Array<{ id: string; slot: number; x: number; y: number; spawnedAt: number; explodesAt: number }>;
    explosions: Array<{ id: string; x: number; y: number; startedAt: number; endsAt: number }>;
    doomsdayStrikes: Array<{ id: string; slot: number; warningAt: number; hitAt: number; endsAt: number }>;
    missiles: Array<{ id: string; targetClientId: string; launchedAt: number; hitAt: number }>;
  };
  activePlayerCount: number;
  maxPlayers: number;
  serverTime: number;
};

type ServerToClientEvents = {
  'tower:joined': (payload: { selfId: string; roomId: string; snapshot: TowerSnapshot }) => void;
  'tower:snapshot': (snapshot: TowerSnapshot) => void;
  'tower:event': (event: TowerServerEvent) => void;
  'tower:decoration': (decorations: TowerDecorationState) => void;
};

type ClientToServerEvents = {
  'tower:join': (payload: { clientId: string; userId: string; nickname: string; decorations: Pick<TowerDecorationState, 'roofColor' | 'bodyColor' | 'windowColor'> }) => void;
  'tower:input': (input: { left: boolean; right: boolean; airborne: boolean }) => void;
  'tower:decoration': (decorations: Pick<TowerDecorationState, 'roofColor' | 'bodyColor' | 'windowColor'>) => void;
  'tower:leave': (ack?: () => void) => void;
  'tower:die': () => void;
  'tower:warp': (payload: { targetClientId: string }) => void;
  'tower:sword': () => void;
};

export type TowerSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createTerrifyingToweringSocket() {
  const url = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

  return io(url, {
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 2500,
    transports: ['websocket', 'polling'],
  }) as TowerSocket;
}
