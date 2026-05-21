import { PacketIds } from '../protocol/PacketCodec.js';
import { GameMsgType } from '../protocol/packets/GameMsgPacket.js';
import { decodeNetLevelDataMsg, encodeNetLevelDataMsg } from '../protocol/types/NetLevelDataMsg.js';

export class GameMessageService {
  constructor({ players, levels, broadcaster, logger }) {
    this.players = players;
    this.levels = levels;
    this.broadcaster = broadcaster;
    this.logger = logger;
    this.latestAcks = new Map();
  }

  warn(meta, message) {
    if (typeof this.logger?.warn === 'function') {
      this.logger.warn(meta, message);
    } else {
      this.logger?.debug?.(meta, message);
    }
  }

  handle(session, payload) {
    const source = this.players.getBySession(session);
    if (!source) {
      return;
    }

    source.touch();

    if (payload.type === GameMsgType.NetRpc) {
      source.lastRpc = {
        bytes: payload.rpcData.length,
        updatedAt: Date.now()
      };
      this.forwardToLevel(source, session, {
        ...payload,
        sourcePlayer: source.id
      });
      return;
    }

    if (payload.type === 4 || payload.type === GameMsgType.MusicSync || payload.type === GameMsgType.NetLevelElectionNominee) {
      source.lastOpaqueGameMsg = {
        type: payload.type,
        bytes: payload.payloadBytes?.length ?? 0,
        updatedAt: Date.now()
      };
      this.forwardToLevel(source, session, {
        ...payload,
        sourcePlayer: source.id
      });
      return;
    }

    if (payload.type === GameMsgType.PlayerStateDelta) {
      const decoded = source.playerDelta.read(payload.snapshot, payload.payload);
      if (!decoded.ok) {
        this.logger.debug({ playerId: source.id, reason: decoded.reason }, 'ignored player snapshot delta');
        return;
      }
      this.ackSnapshotRead(source, decoded);

      const playerPayload = Buffer.concat([
        Buffer.from([source.id]),
        this.uint32Buffer(decoded.data.length),
        decoded.data
      ]);

      this.forwardSnapshotToLevel(source, session, GameMsgType.PlayerStateDelta, playerPayload);
      return;
    }

    if (payload.type === GameMsgType.NetLevelData) {
      if (!this.levels.isAuthority(source, source.levelId)) {
        this.warn({
          playerId: source.id,
          levelId: source.levelId,
          authorityPlayerId: this.levels.getAuthority(source.levelId)?.id
        }, 'ignored level data from non-authority player');
        return;
      }

      const decoded = source.levelDelta.read(payload.snapshot, payload.payload);
      if (!decoded.ok) {
        this.warn({
          playerId: source.id,
          levelId: source.levelId,
          reason: decoded.reason,
          sequence: payload.snapshot?.sequence,
          base: payload.snapshot?.base,
          payloadBytes: payload.payload?.length ?? 0
        }, 'ignored level snapshot delta');
        return;
      }
      this.ackSnapshotRead(source, decoded);

      this.logger.debug({
        playerId: source.id,
        levelId: source.levelId,
        dataBytes: decoded.data?.length ?? 0,
        dataHex: decoded.data?.toString('hex') ?? 'none'
      }, 'received NetLevelData raw');

      let levelDataMsg;
      try {
        levelDataMsg = decodeNetLevelDataMsg(decoded.data, {
          skipHeaderBytes: 0,
          maxDataBytes: 7500
        });
      } catch (error) {
        this.warn({
          err: error,
          errMessage: error.message,
          playerId: source.id,
          levelId: source.levelId,
          dataBytes: decoded.data?.length ?? 0,
          dataHex: decoded.data?.slice(0, 32).toString('hex') ?? 'none'
        }, 'ignored invalid level data stream');
        return;
      }

      if (levelDataMsg.trailingBytes !== 0) {
        const isAllZero = decoded.data.every(b => b === 0);
        if (isAllZero) {
          this.logger.debug({
            playerId: source.id,
            levelId: source.levelId,
            packetLevelId: levelDataMsg.levelId,
            trailingBytes: levelDataMsg.trailingBytes,
            dataLength: levelDataMsg.dataLength
          }, 'received empty level data snapshot (all zeros)');
          return;
        }
        this.warn({
          playerId: source.id,
          levelId: source.levelId,
          packetLevelId: levelDataMsg.levelId,
          electedPlayer: levelDataMsg.electedPlayer,
          trailingBytes: levelDataMsg.trailingBytes,
          dataLength: levelDataMsg.dataLength,
          levelHash: levelDataMsg.levelHash
        }, 'ignored level data stream with trailing bytes');
        return;
      }

      if (levelDataMsg.levelId === 0) {
        this.warn({
          playerId: source.id,
          levelId: source.levelId,
          packetLevelId: levelDataMsg.levelId,
          dataBytes: decoded.data?.length ?? 0,
          dataHex: decoded.data?.slice(0, 16).toString('hex') ?? 'none'
        }, 'ignored level data with invalid levelId (0)');
        return;
      }

      if (
        source.netVersion?.levelHash !== undefined &&
        levelDataMsg.levelHash !== 0 &&
        levelDataMsg.levelHash !== source.netVersion.levelHash
      ) {
        this.warn({
          playerId: source.id,
          levelId: source.levelId,
          packetLevelId: levelDataMsg.levelId,
          electedPlayer: levelDataMsg.electedPlayer,
          levelHash: levelDataMsg.levelHash,
          expectedLevelHash: source.netVersion.levelHash,
          dataBytes: decoded.data?.length ?? 0,
          dataHex: decoded.data?.slice(0, 32).toString('hex') ?? 'none'
        }, 'ignored level data with mismatched level hash');
        return;
      }

      const levelId = source.levelId;
      this.levels.saveLevelData(levelId, {
        mergeState: levelDataMsg.mergeState ?? 0,
        unknown1: levelDataMsg.unknown1 ?? 0,
        unknown2: levelDataMsg.unknown2 ?? 0,
        unknown3: levelDataMsg.unknown3 ?? 0,
        levelHash: levelDataMsg.levelHash ?? 0,
        unknown4: levelDataMsg.unknown4 ?? 0,
        unknown5: levelDataMsg.unknown5 ?? 0,
        unknown6: levelDataMsg.unknown6 ?? 0,
        unknown7: levelDataMsg.unknown7 ?? 0,
        dataLength: levelDataMsg.dataLength ?? levelDataMsg.levelData?.length ?? 0,
        payload: levelDataMsg.levelData,
        updatedAt: Date.now(),
        authorityPlayerId: source.id
      });

      const outgoingData = Buffer.from(decoded.data);
      outgoingData[0] = source.id;
      const forwarded = this.forwardSnapshotToLevel(source, session, GameMsgType.NetLevelData, outgoingData, { levelId });
      this.logger.debug({
        playerId: source.id,
        levelId,
        packetLevelId: levelDataMsg.levelId,
        dataBytes: outgoingData.length,
        levelDataBytes: levelDataMsg.levelData?.length ?? 0,
        forwarded
      }, 'forwarded level data');
      return;
    }

    if (payload.type === GameMsgType.NetLevelDataElect) {
      this.forwardToLevel(source, session, {
        ...payload,
        sourcePlayer: source.id
      });
      return;
    }

    if (payload.type === GameMsgType.NetLevelDataHeartbeat) {
      if (payload.levelId !== source.levelId) {
        this.logger.debug({
          playerId: source.id,
          playerLevelId: source.levelId,
          heartbeatLevelId: payload.levelId
        }, 'ignored level heartbeat for non-current level');
        return;
      }

      if (!this.levels.getAuthority(source.levelId)) {
        this.levels.setAuthority(source.levelId, source, { reason: 'heartbeat_no_authority' });
      }
      return;
    }

    if (payload.type === GameMsgType.NetLevelDataRevoke) {
      this.handleRevoke(source, session, payload);
      return;
    }

    if (payload.type === GameMsgType.NetLevelDataRevokeAck) {
      this.logger.debug({
        playerId: source.id,
        snapshot: payload.snapshot,
        payloadBytes: payload.payloadBytes?.length ?? 0
      }, 'received level data revoke ack');
      return;
    }

    if (payload.type === GameMsgType.SnapshotAck) {
      this.latestAcks.set(source.id, {
        playerAckSeq: payload.playerAckSeq,
        levelAckSeq: payload.levelAckSeq,
        updatedAt: Date.now()
      });
      source.playerDelta.ack(payload.playerAckSeq);
      source.levelDelta.ack(payload.levelAckSeq);
    }
  }

  handleRevoke(source, sourceSession, payload) {
    const levelId = payload.levelId ?? source.levelId;
    const authority = this.levels.getAuthority(levelId);
    const levelPlayers = this.players.listInLevel(levelId);

    if (authority && authority !== source) {
      this.logger.debug({
        sourcePlayerId: source.id,
        levelId,
        authorityPlayerId: authority.id
      }, 'ignored revoke from non-authority player');
      this.sendRevokeAck(source, authority, levelId);
      return;
    }

    this.levels.revokeAuthority(levelId, { reason: 'client_revoke' });
    const next = levelPlayers.find(player => player !== source);

    if (next) {
      this.levels.setAuthority(levelId, next, {
        previousAuthorityPlayerId: source.id,
        reason: 'client_revoke_migration'
      });
      for (const player of levelPlayers) {
        this.sendElect(player, next, this.levels.loadLevelData(levelId));
      }
    } else {
      this.levels.reset(levelId, { reason: 'client_revoke_level_empty' });
    }

    this.forwardToLevel(source, sourceSession, {
      type: GameMsgType.NetLevelDataRevoke,
      sourcePlayer: source.id,
      levelChangeCount: source.levelChangeCount,
      levelId,
      playerId: source.id,
      reason: payload.reason ?? 0
    });

    this.sendRevokeAck(source, next ?? source, levelId);
  }

  sendRevoke(target, authority, levelId, reason = 0) {
    this.broadcaster.send(target.session, {
      id: PacketIds.GameMsg,
      payload: {
        type: GameMsgType.NetLevelDataRevoke,
        levelChangeCount: target.levelChangeCount,
        sourcePlayer: authority?.id ?? 0,
        playerId: authority?.id ?? 0,
        reason
      }
    });
  }

  sendRevokeAck(target, authority, levelId) {
    const levelPayload = this.createLevelElectPayload(authority ?? target, this.levels.loadLevelData(levelId));
    const frame = target.levelDelta.write(levelPayload);

    if (!frame) {
      this.logger.debug({
        playerId: target.id,
        levelId
      }, 'skipped level data revoke ack because snapshot frame was too large');
      return;
    }

    if (frame.base === 0 && frame.sequence === 0) {
      this.logger.debug({
        playerId: target.id,
        levelId
      }, 'skipped level data revoke ack because writer stayed in raw recovery state');
      return;
    }

    this.broadcaster.send(target.session, {
      id: PacketIds.GameMsg,
      payload: {
        type: GameMsgType.NetLevelDataRevokeAck,
        levelChangeCount: target.levelChangeCount,
        sourcePlayer: authority?.id ?? 0,
        snapshot: {
          sequence: frame.sequence,
          base: frame.base,
          checksum: frame.checksum
        },
        payload: frame.payload
      }
    });
  }

  sendElect(target, authority, initialData = undefined) {
    const levelPayload = this.createLevelElectPayload(authority, initialData);
    const frame = target.levelDelta.write(levelPayload);

    if (!frame) {
      this.logger.debug({
        targetPlayerId: target.id,
        authorityPlayerId: authority?.id,
        levelId: authority?.levelId,
        levelPayloadLength: levelPayload?.length ?? 0
      }, 'sendElect skipped: frame too large');
      return;
    }

    this.logger.debug({
      targetPlayerId: target.id,
      authorityPlayerId: authority?.id,
      levelId: authority?.levelId,
      electedPlayer: authority?.id,
      hasInitialData: levelPayload?.hasInitialData,
      levelDataLength: levelPayload?.levelData?.length ?? 0,
      frameSeq: frame.sequence,
      frameBase: frame.base
    }, 'sending NetLevelDataElect');

    this.broadcaster.send(target.session, {
      id: PacketIds.GameMsg,
      payload: {
        type: GameMsgType.NetLevelDataElect,
        levelChangeCount: target.levelChangeCount,
        sourcePlayer: 0,
        snapshot: {
          sequence: frame.sequence,
          base: frame.base,
          checksum: frame.checksum
        },
        payload: frame.payload
      }
    });
  }

  forwardToLevel(source, sourceSession, payload) {
    for (const target of this.players.listInLevel(source.levelId)) {
      if (target === source || target.session === sourceSession) {
        continue;
      }

      const outgoing = {
        ...payload,
        levelChangeCount: target.levelChangeCount
      };

      this.broadcaster.send(target.session, {
        id: PacketIds.GameMsg,
        payload: outgoing
      });
    }
  }

  forwardSnapshotToLevel(source, sourceSession, type, data, { levelId = source.levelId } = {}) {
    let forwarded = 0;
    let dropped = 0;

    for (const target of this.players.listInLevel(levelId)) {
      if (target === source || target.session === sourceSession) {
        continue;
      }

      const state = type === GameMsgType.PlayerStateDelta
        ? target.playerDelta
        : target.levelDelta;
      const frame = state.write(data);

      if (!frame) {
        dropped += 1;
        this.warn({
          sourcePlayerId: source.id,
          targetPlayerId: target.id,
          levelId,
          type,
          dataBytes: data?.length ?? 0
        }, 'dropped snapshot forward because frame was too large');
        continue;
      }

      this.broadcaster.send(target.session, {
        id: PacketIds.GameMsg,
        payload: {
          type,
          levelChangeCount: target.levelChangeCount,
          sourcePlayer: source.id,
          snapshot: {
            sequence: frame.sequence,
            base: frame.base,
            checksum: frame.checksum
          },
          payload: frame.payload
        }
      });
      forwarded += 1;
    }

    if (type === GameMsgType.NetLevelData && forwarded === 0) {
      this.logger.debug({
        sourcePlayerId: source.id,
        levelId,
        playersInLevel: this.players.listInLevel(levelId).map(player => player.id),
        dropped
      }, 'level data had no receiver in level');
    }

    return forwarded;
  }

  uint32Buffer(value) {
    const buffer = Buffer.allocUnsafe(4);
    buffer.writeUInt32LE(value >>> 0, 0);
    return buffer;
  }

  ackSnapshotRead(target, decoded) {
    if (!decoded.ack) {
      return;
    }

    this.broadcaster.send(target.session, {
      id: PacketIds.GameMsg,
      payload: {
        type: GameMsgType.SnapshotAck,
        levelChangeCount: target.levelChangeCount,
        sourcePlayer: 0,
        playerAckSeq: target.playerDelta.latestSequence(),
        levelAckSeq: target.levelDelta.latestSequence()
      }
    });
  }

  createLevelElectPayload(authority, initialData) {
    const data = Buffer.from(initialData?.payload ?? initialData?.levelData ?? Buffer.alloc(0));
    const cached = this.levels.loadLevelData(authority.levelId);
    const payload = cached?.payload ? Buffer.from(cached.payload) : data;
    return encodeNetLevelDataMsg({
      electedPlayer: authority.id,
      levelId: authority.levelId,
      hasInitialData: payload.length > 0,
      levelData: payload,
      ...(cached ?? {})
    });
  }
}
