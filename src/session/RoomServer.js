import { PacketCodec, PacketIds } from '../protocol/PacketCodec.js';
import { ConnectionManager } from './ConnectionManager.js';
import { PlayerStore } from '../domain/PlayerStore.js';
import { LevelStateStore } from '../domain/LevelStateStore.js';
import { RoomDirectory } from '../domain/RoomDirectory.js';
import { EnetServer } from '../transport/EnetServer.js';
import { BroadcastService } from '../services/BroadcastService.js';
import { JoinService } from '../services/JoinService.js';
import { LevelService } from '../services/LevelService.js';
import { GameMessageService } from '../services/GameMessageService.js';
import { MoveService } from '../services/MoveService.js';
import { PacketDispatcher } from './PacketDispatcher.js';
import { TickLoop } from './TickLoop.js';

export class RoomServer {
  constructor({ config, logger, metrics }) {
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;
    this.codec = new PacketCodec();
    this.sessions = new ConnectionManager({ roomId: config.id });
    this.players = new PlayerStore({ maxPlayers: config.maxPlayers });
    this.levels = new LevelStateStore({ roomId: config.id, logger });
    this.rooms = new RoomDirectory();
    this.transport = new EnetServer({
      host: config.host,
      port: config.port,
      maxPeers: config.maxPeers,
      channels: config.channels,
      logger
    });

    this.broadcaster = new BroadcastService({
      codec: this.codec,
      transport: this.transport,
      sessions: this.sessions,
      metrics
    });

    this.joinService = new JoinService({
      players: this.players,
      levels: this.levels,
      broadcaster: this.broadcaster,
      logger,
      metrics,
      onAuthorityChanged: (target, authority) => this.gameMessageService?.sendElect(target, authority, this.levels.loadLevelData(authority.levelId))
    });

    this.levelService = new LevelService({
      players: this.players,
      levels: this.levels,
      broadcaster: this.broadcaster,
      logger,
      onAuthorityChanged: (target, authority) => this.gameMessageService?.sendElect(target, authority, this.levels.loadLevelData(authority.levelId))
    });

    this.gameMessageService = new GameMessageService({
      players: this.players,
      levels: this.levels,
      broadcaster: this.broadcaster,
      logger
    });

    this.moveService = new MoveService({
      players: this.players,
      rooms: this.rooms,
      broadcaster: this.broadcaster,
      transport: this.transport,
      logger
    });

    this.dispatcher = new PacketDispatcher({
      joinService: this.joinService,
      levelService: this.levelService,
      gameMessageService: this.gameMessageService,
      moveService: this.moveService,
      broadcaster: this.broadcaster,
      logger
    });

    for (const target of config.moveTargets) {
      this.rooms.register(target);
    }

    this.tickLoop = new TickLoop({
      tickRate: config.tickRate,
      logger,
      onTick: () => this.onTick()
    });
  }

  async start() {
    this.transport.on('peer:connect', peerId => this.onPeerConnect(peerId));
    this.transport.on('peer:message', (peerId, data) => this.onPeerMessage(peerId, data));
    this.transport.on('peer:disconnect', (peerId, data) => this.onPeerDisconnect(peerId, data));

    await this.transport.start();
    this.tickLoop.start();
  }

  async stop() {
    this.tickLoop.stop();
    await this.transport.stop();
  }

  onPeerConnect(peerId) {
    if (this.sessions.size >= this.config.maxPeers) {
      this.transport.disconnect(peerId, 'now');
      return;
    }

    const session = this.sessions.add(peerId);
    session.joinTimer = setTimeout(() => {
      if (!session.player && !session.closed) {
        this.metrics.disconnects.inc({ reason: 'join_timeout' });
        this.transport.disconnect(peerId, 'later');
      }
    }, this.config.joinTimeoutMs);

    this.metrics.connectedPeers.set(this.sessions.size);
    this.logger.debug({ peerId: peerId.toString(), sessionId: session.id }, 'peer connected');
  }

  onPeerMessage(peerId, data, channel = 0) {
    const session = this.sessions.get(peerId);
    if (!session || session.closed) {
      return;
    }

    const now = Date.now();
    session.markPacket(now);
    this.metrics.packetBytes.inc({ direction: 'client' }, data.length);

    if (data.length > this.config.maxPacketBytes) {
      this.rejectSessionPacket(session, 'packet_too_large');
      return;
    }

    try {
      const packet = this.codec.decodeClient(data);
      this.metrics.packets.inc({ direction: 'client', type: packet.name });
      this.logClientPacket(session, peerId, channel, data, packet);
      const endTimer = this.metrics.packetDuration.startTimer({ type: packet.name });
      try {
        this.dispatcher.dispatch(session, packet);
      } finally {
        endTimer();
      }
    } catch (error) {
      this.rejectSessionPacket(session, error.name ?? 'decode_error');
      this.logger.warn({
        err: error,
        peerId: peerId.toString(),
        sessionId: session.id,
        channel,
        rawPacket: formatPacketBytes(data)
      }, 'failed to process packet');
    }
  }

  logClientPacket(session, peerId, channel, data, packet) {
    const logData = {
      peerId: peerId.toString(),
      sessionId: session.id,
      channel,
      rawPacket: formatPacketBytes(data),
      packet: formatPacket(packet)
    };

    if (packet.id === PacketIds.JoinGame) {
      this.logger.info(logData, 'client join packet decoded');
      return;
    }

    this.logger.debug(logData, 'client packet decoded');
  }

  rejectSessionPacket(session, reason) {
    const count = session.registerBadPacket();
    this.metrics.packetErrors.inc({ reason });

    if (count >= this.config.badPacketLimit) {
      this.metrics.disconnects.inc({ reason: 'bad_packet_limit' });
      this.transport.disconnect(session.peerId, 'later');
    }
  }

  onPeerDisconnect(peerId, data) {
    const session = this.sessions.remove(peerId);
    if (!session) {
      return;
    }

    const player = this.players.removeBySession(session);
    if (player) {
      this.levelService.rebalanceAuthority(player.levelId);
      this.broadcaster.broadcast({
        id: PacketIds.PlayerLeft,
        payload: {
          playerId: player.id,
          reason: 0
        }
      }, { playerOnly: true });
    }

    this.metrics.connectedPeers.set(this.sessions.size);
    this.metrics.onlinePlayers.set(this.players.size);
    this.metrics.disconnects.inc({ reason: String(data ?? 'normal') });

    this.logger.debug({
      peerId: peerId.toString(),
      playerId: player?.id
    }, 'peer disconnected');
  }

  kickPlayer(playerId, reason = 0) {
    const player = this.players.getById(Number(playerId));
    if (!player) {
      return false;
    }

    this.broadcaster.send(player.session, {
      id: PacketIds.Disconnect,
      payload: {}
    });
    this.transport.disconnect(player.session.peerId, 'later', reason);
    return true;
  }

  broadcastRpc({ levelId, playerId = 0, rpcData }) {
    const data = Buffer.isBuffer(rpcData)
      ? rpcData
      : Buffer.from(String(rpcData ?? ''), 'utf8');

    for (const player of this.players.list()) {
      if (levelId !== undefined && player.levelId !== Number(levelId)) {
        continue;
      }

      this.broadcaster.send(player.session, {
        id: PacketIds.GameMsg,
        payload: {
          type: 2,
          levelChangeCount: player.levelChangeCount,
          sourcePlayer: 0,
          playerId,
          rpcData: data
        }
      });
    }
  }

  revokeLevelAuthority(levelId, reason = 0) {
    const authority = this.levels.getAuthority(Number(levelId));
    if (!authority) {
      return false;
    }

    this.levels.revokeAuthority(Number(levelId), { reason: `server_revoke:${reason}` });
    for (const player of this.players.listInLevel(Number(levelId))) {
      this.gameMessageService.sendRevoke(player, authority, Number(levelId), reason);
    }

    this.levelService.rebalanceAuthority(Number(levelId));
    return true;
  }

  registerMoveTarget(room) {
    return this.rooms.register(room);
  }

  unregisterMoveTarget(roomId) {
    return this.rooms.unregister(roomId);
  }

  movePlayerToRoom(playerId, roomId = undefined) {
    const player = this.players.getById(Number(playerId));
    if (!player) {
      return { ok: false, reason: 'player_not_found' };
    }

    const target = roomId
      ? this.rooms.rooms.get(String(roomId))
      : this.rooms.findTarget({ levelId: player.levelId });

    if (!target) {
      this.moveService.cancelPlayerMove(player, 1);
      return { ok: false, reason: 'target_not_found' };
    }

    return {
      ok: this.moveService.movePlayer(player, target),
      targetRoomId: target.id
    };
  }

  moveLevelToRoom(levelId, roomId = undefined) {
    const target = roomId
      ? this.rooms.rooms.get(String(roomId))
      : this.rooms.findTarget({ levelId });

    if (!target) {
      return { ok: false, reason: 'target_not_found' };
    }

    return {
      ok: true,
      moved: this.moveService.moveLevel(levelId, target),
      targetRoomId: target.id
    };
  }

  onTick() {
    this.metrics.connectedPeers.set(this.sessions.size);
    this.metrics.onlinePlayers.set(this.players.size);
  }

  getStatus() {
    return {
      host: this.config.host,
      roomId: this.config.id,
      port: this.config.port,
      peers: this.sessions.size,
      players: this.players.size,
      tickRate: this.config.tickRate,
      limits: {
        maxPacketBytes: this.config.maxPacketBytes,
        badPacketLimit: this.config.badPacketLimit
      },
      moveTargets: this.rooms.list(),
      pendingMoves: this.moveService.listPending(),
      moveHistory: this.moveService.listHistory()
    };
  }
}

function formatPacketBytes(data) {
  const buffer = Buffer.from(data);
  return {
    bytes: buffer.length,
    hex: buffer.toString('hex'),
    base64: buffer.toString('base64'),
    header: readClientPacketHeader(buffer)
  };
}

function readClientPacketHeader(buffer) {
  return {
    token: buffer.length >= 4 ? buffer.readUInt32LE(0) : null,
    id: buffer.length >= 5 ? buffer.readUInt8(4) : null,
    sequence: buffer.length >= 6 ? buffer.readUInt8(5) : null,
    payloadBytes: Math.max(0, buffer.length - 6)
  };
}

function formatPacket(packet) {
  return {
    id: packet.id,
    name: packet.name,
    token: packet.token,
    sequence: packet.sequence,
    payload: sanitizeForLog(packet.payload)
  };
}

function sanitizeForLog(value, depth = 0) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Buffer.isBuffer(value)) {
    return {
      type: 'Buffer',
      bytes: value.length,
      hex: value.subarray(0, 256).toString('hex'),
      truncated: value.length > 256
    };
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeForLog(item, depth + 1));
  }

  if (typeof value === 'object') {
    if (depth >= 4) {
      return '[max-depth]';
    }

    if (value.bytes && Buffer.isBuffer(value.bytes) && typeof value.toString === 'function') {
      return value.toString();
    }

    const output = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = sanitizeForLog(item, depth + 1);
    }
    return output;
  }

  return value;
}
