import { z } from 'zod';

const numberFromEnv = (fallback) => z.coerce.number().int().positive().default(fallback);
const booleanFromEnv = (fallback) => z.preprocess(value => {
  if (typeof value !== 'string') return value;
  if (value.toLowerCase() === 'true' || value === '1') return true;
  if (value.toLowerCase() === 'false' || value === '0') return false;
  return value;
}, z.boolean().default(fallback));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  LOG_PRETTY: booleanFromEnv(false),

  ROOM_ID: z.string().default('main'),
  ROOM_HOST: z.string().default('0.0.0.0'),
  ROOM_PORT: numberFromEnv(19132),
  ROOM_MAX_PEERS: numberFromEnv(64),
  ROOM_CHANNELS: numberFromEnv(2),
  ROOM_TICK_RATE: numberFromEnv(10),
  ROOM_MAX_PACKET_BYTES: numberFromEnv(16384),
  ROOM_BAD_PACKET_LIMIT: numberFromEnv(8),

  HTTP_HOST: z.string().default('0.0.0.0'),
  HTTP_PORT: numberFromEnv(19132),
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
      channels: parsed.ROOM_CHANNELS,
      tickRate: parsed.ROOM_TICK_RATE,
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
    if (!Array.isArray(parsed)) throw new Error('MOVE_TARGETS must be a JSON array');
    return parsed;
  } catch (error) {
    throw new Error(`invalid MOVE_TARGETS: ${error.message}`);
  }
}
