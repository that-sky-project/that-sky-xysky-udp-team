import { PacketCodec } from '../protocol/PacketCodec.js';
import { PacketIds } from '../protocol/PacketIds.js';
import { GameMsgType } from '../protocol/packets/shared/GameMsgPacket.js';
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
import { PeerEventHandler } from './PeerEventHandler.js';
import { TickLoop } from './TickLoop.js';
import { registerAllHandlers } from './handlers/index.js';

export class RoomServer {
  constructor({ config, logger, metrics }) {
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;

    this.codec = new PacketCodec();
    this.sessions = new ConnectionManager({ roomId: config.id });
    this.players = new PlayerStore();
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
      metrics
    });

    this.levelService = new LevelService({
      players: this.players,
      levels: this.levels,
      broadcaster: this.broadcaster,
      logger
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

    this.levels.onAuthorityElected((levelId, authority, targetPlayer) => {
      if (targetPlayer) {
        this.gameMessageService.sendElect(targetPlayer, authority, this.levels.loadLevelData(levelId));
      } else {
        for (const player of this.players.listInLevel(levelId)) {
          this.gameMessageService.sendElect(player, authority, this.levels.loadLevelData(levelId));
        }
      }
    });

    const context = Object.freeze({
      joinService: this.joinService,
      levelService: this.levelService,
      gameMessageService: this.gameMessageService,
      moveService: this.moveService,
      broadcaster: this.broadcaster,
      logger,
      clock: () => Date.now()
    });

    this.dispatcher = new PacketDispatcher({ context });
    registerAllHandlers(this.dispatcher);

    this.peerHandler = new PeerEventHandler({
      config,
      sessions: this.sessions,
      codec: this.codec,
      dispatcher: this.dispatcher,
      players: this.players,
      levelService: this.levelService,
      broadcaster: this.broadcaster,
      transport: this.transport,
      metrics,
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
    this.transport.on('peer:connect',    peerId => this.peerHandler.onConnect(peerId));
    this.transport.on('peer:message',    (peerId, data) => this.peerHandler.onMessage(peerId, data));
    this.transport.on('peer:disconnect', (peerId, data) => this.peerHandler.onDisconnect(peerId, data));

    await this.transport.start();
    this.tickLoop.start();
  }

  async stop() {
    this.tickLoop.stop();
    await this.transport.stop();
  }


  kickPlayer(playerId, reason = 0) {
    const player = this.players.getById(Number(playerId));
    if (!player) {
      return false;
    }

    const reasonStr = typeof reason === 'string' ? reason : String(reason);
    this.broadcaster.send(player.session, {
      id: PacketIds.Kick,
      payload: { reason: reasonStr }
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
          type: GameMsgType.NetRpc,
          levelChangeCount: player.lvSeq,
          sourcePlayer: 0,
          playerId,
          rpcData: data
        }
      });
    }
  }

  revokeLevelAuthority(levelId, reason = 0) {
    const nLevelId = Number(levelId);
    const revokedAuthority = this.levels.getAuthority(nLevelId);
    if (!revokedAuthority) {
      return false;
    }

    this.levels.revokeAuthority(nLevelId, { reason: `server_revoke:${reason}` });
    const { authority: nextAuthority } = this.levelService.rebalanceAuthority(nLevelId, {
      notify: false,
      excludePlayer: revokedAuthority
    });

    this.gameMessageService.sendRevokeAndElect(
      nLevelId,
      revokedAuthority,
      nextAuthority,
      this.levels.loadLevelData(nLevelId),
      reason
    );

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
      ? this.rooms.getById(roomId)
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
      ? this.rooms.getById(roomId)
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
    this.gameMessageService.syncPlayerStates();
    this.gameMessageService.syncLevelData();
    this.gameMessageService.sendSnapshotAcks();
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
