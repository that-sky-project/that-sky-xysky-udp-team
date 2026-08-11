import { z } from 'zod';

const numberFromEnv = (fallback) => z.coerce.number().int().positive().default(fallback);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  LOG_PRETTY: z.coerce.boolean().default(false),

  ROOM_ID: z.string().default('main'),
  ROOM_HOST: z.string().default('0.0.0.0'),
  ROOM_PORT: numberFromEnv(25565),
  ROOM_MAX_PEERS: numberFromEnv(32),
  ROOM_MAX_PLAYERS: numberFromEnv(8),
  ROOM_CHANNELS: numberFromEnv(2),
  ROOM_TICK_RATE: numberFromEnv(5),
  ROOM_JOIN_TIMEOUT_MS: numberFromEnv(1000),
  ROOM_MAX_PACKET_BYTES: numberFromEnv(16384),
  ROOM_BAD_PACKET_LIMIT: numberFromEnv(8),

  HTTP_HOST: z.string().default('0.0.0.0'),
  HTTP_PORT: numberFromEnv(25565),
  MOVE_TARGETS: z.string().default('[]')
});

export function loadConfig(env) {
  const parsed = envSchema.parse(env);

  return {
    env: parsed.NODE_ENV,
    logging: {
      level: parsed.LOG_LEVEL,
      pretty: parsed.LOG_PRETTY || parsed.NODE_ENV === 'development'
    },
    room: {
      id: parsed.ROOM_ID,
      host: parsed.ROOM_HOST,
      port: parsed.ROOM_PORT,
      maxPeers: parsed.ROOM_MAX_PEERS,
      maxPlayers: parsed.ROOM_MAX_PLAYERS,
      channels: parsed.ROOM_CHANNELS,
      tickRate: parsed.ROOM_TICK_RATE,
      joinTimeoutMs: parsed.ROOM_JOIN_TIMEOUT_MS,
      maxPacketBytes: parsed.ROOM_MAX_PACKET_BYTES,
      badPacketLimit: parsed.ROOM_BAD_PACKET_LIMIT,
      moveTargets: parseMoveTargets(parsed.MOVE_TARGETS)
    },
    http: {
      host: parsed.HTTP_HOST,
      port: parsed.HTTP_PORT
    }
  };
}

function parseMoveTargets(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
