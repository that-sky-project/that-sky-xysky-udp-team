import { PacketIds } from '../protocol/PacketIds.js';
import { GameMsgType } from '../protocol/packets/shared/GameMsgPacket.js';
import {
  decodeNetLevelDataMsg,
  encodeNetLevelDataMsg,
  MAX_LEVEL_DATA_PAYLOAD_BYTES
} from '../protocol/types/NetLevelDataMsg.js';
import { BinaryWriter } from '../protocol/binary/BinaryWriter.js';
import { netRpcRouter } from '../protocol/packets/shared/netRpc/index.js';

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

    source.lvSeq = payload.levelChangeCount & 0xff;
    source.levelChangeCount = source.lvSeq;
    source.touch();

    if (payload.type === GameMsgType.NetRpc) {
      source.lastRpc = {
        bytes: payload.rpcData.length,
        updatedAt: Date.now()
      };

      const rpcData = netRpcRouter.process(payload.rpcData, { source, logger: this.logger });

      this.forwardToLevel(source, session, {
        ...payload,
        rpcData,
        sourcePlayer: source.id
      });
      return;
    }

    if (
      payload.type === GameMsgType.Critters ||
      payload.type === GameMsgType.Affinity ||
      payload.type === GameMsgType.MusicSync ||
      payload.type === GameMsgType.NetLevelElectionNominee
    ) {
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
      this.logger.debug({
        pkt: 'snap-in', dir: 'C->S', type: 'pla',
        pid: source.id,
        save_seq: payload.snapshot?.sequence,
        base_seq: payload.snapshot?.base,
        chk: payload.snapshot?.checksum,
        payloadBytes: payload.payload?.length ?? 0,
        ok: decoded.ok,
        reason: decoded.ok ? undefined : decoded.reason
      }, '[SNAP]');
      if (!decoded.ok) {
        return;
      }
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
      this.logger.debug({
        pkt: 'snap-in', dir: 'C->S', type: 'lev',
        pid: source.id, levelId: source.levelId,
        save_seq: payload.snapshot?.sequence,
        base_seq: payload.snapshot?.base,
        chk: payload.snapshot?.checksum,
        payloadBytes: payload.payload?.length ?? 0,
        ok: decoded.ok,
        reason: decoded.ok ? undefined : decoded.reason
      }, '[SNAP]');
      if (!decoded.ok) {
        return;
      }

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
          maxDataBytes: MAX_LEVEL_DATA_PAYLOAD_BYTES
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

      if (levelDataMsg.levelId !== source.levelId) {
        this.warn({
          playerId: source.id,
          playerLevelId: source.levelId,
          packetLevelId: levelDataMsg.levelId
        }, 'ignored level data for non-current level');
        return;
      }

      const levelId = source.levelId;
      this.levels.saveLevelData(levelId, {
        levelId: levelDataMsg.levelId,
        hasInitialData: levelDataMsg.hasInitialData,
        hasInitialDataRaw: levelDataMsg.hasInitialDataRaw,
        mergeState: levelDataMsg.mergeState ?? 0,
        unknown1: levelDataMsg.unknown1 ?? 0,
        unknown2: levelDataMsg.unknown2 ?? 0,
        unknown3: levelDataMsg.unknown3 ?? 0,
        levelHash: levelDataMsg.levelHash ?? 0,
        unknown4: levelDataMsg.unknown4 ?? 0,
        unknown5: levelDataMsg.unknown5 ?? 0,
        unknown6: levelDataMsg.unknown6 ?? 0,
        dataLength: levelDataMsg.dataLength ?? levelDataMsg.levelData?.length ?? 0,
        payload: levelDataMsg.levelData,
        updatedAt: Date.now(),
        authorityPlayerId: source.id
      });

      this.logger.debug({
        playerId: source.id,
        levelId,
        packetLevelId: levelDataMsg.levelId,
        dataBytes: decoded.data.length,
        levelDataBytes: levelDataMsg.levelData?.length ?? 0
      }, 'stored level data for tick sync');
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
    if (levelId !== source.levelId) {
      this.warn({
        playerId: source.id,
        playerLevelId: source.levelId,
        packetLevelId: levelId
      }, 'ignored level revoke for non-current level');
      return;
    }

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
    } else {
      this.logger.debug({
        levelId,
        playerId: source.id
      }, 'retained level data after sole player revoked authority');
    }

    this.sendRevokeAck(source, next ?? source, levelId);
  }

  sendRevokeAndElect(levelId, revokedAuthority, nextAuthority, initialData, reason = 0) {
    const levelPlayers = this.players.listInLevel(levelId);
    for (const target of levelPlayers) {
      this.broadcaster.send(target.session, {
        id: PacketIds.GameMsg,
        payload: {
          type: GameMsgType.NetLevelDataRevoke,
          levelChangeCount: target.lvSeq,
          sourcePlayer: revokedAuthority?.id ?? 0,
          playerId: revokedAuthority?.id ?? 0,
          levelId
        }
      });
      if (nextAuthority) {
        this.sendElect(target, nextAuthority, initialData);
      }
    }
  }

  sendRevoke(target, authority, levelId, reason = 0) {
    this.broadcaster.send(target.session, {
      id: PacketIds.GameMsg,
      payload: {
        type: GameMsgType.NetLevelDataRevoke,
        levelChangeCount: target.lvSeq,
        sourcePlayer: authority?.id ?? 0,
        playerId: authority?.id ?? 0,
        levelId
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

    this.broadcaster.send(target.session, {
      id: PacketIds.GameMsg,
      payload: {
        type: GameMsgType.NetLevelDataRevokeAck,
        levelChangeCount: target.lvSeq,
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
    let cached = this.levels.loadLevelData(authority.levelId);
    if (!cached) {
      const initialPayload = Buffer.from(initialData?.payload ?? initialData?.levelData ?? Buffer.alloc(0));
      cached = this.levels.saveLevelData(authority.levelId, {
        ...(initialData ?? {}),
        levelId: authority.levelId,
        payload: initialPayload,
        authorityPlayerId: authority.id
      });
    }

    target.levelDelta.writer.forceKeyframe();
    const levelPayload = this.createLevelElectPayload(authority, cached);
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
        levelChangeCount: target.lvSeq,
        sourcePlayer: 0,
        snapshot: {
          sequence: frame.sequence,
          base: frame.base,
          checksum: frame.checksum
        },
        payload: frame.payload
      }
    });
    target.clearLevelDataRevision?.();
  }

  forwardToLevel(source, sourceSession, payload) {
    for (const target of this.players.listInLevel(source.levelId)) {
      if (target === source || target.session === sourceSession) {
        continue;
      }

      const outgoing = {
        ...payload,
        levelChangeCount: target.lvSeq
      };

      this.broadcaster.send(target.session, {
        id: PacketIds.GameMsg,
        payload: outgoing
      });
    }
  }

  syncLevelData() {
    for (const target of this.players.list()) {
      const levelId = target.levelId;
      if (levelId == null) continue;

      const authority = this.levels.getAuthority(levelId);
      if (!authority) continue;
      if (authority === target) continue;

      const levelData = this.levels.loadLevelData(levelId);
      if (!levelData) continue;
      if (target.hasLevelDataRevision?.(levelId, levelData.revision)) continue;

      const outgoing = encodeNetLevelDataMsg({
        ...levelData,
        electedPlayer: authority.id,
        levelId: levelData.levelId,
        hasInitialData: levelData.hasInitialData,
        levelData: levelData.payload ?? Buffer.alloc(0)
      });

      const frame = target.levelDelta.write(outgoing);
      if (!frame) continue;

      this.broadcaster.send(target.session, {
        id: PacketIds.GameMsg,
        payload: {
          type: GameMsgType.NetLevelData,
          levelChangeCount: target.lvSeq,
          sourcePlayer: 0,
          snapshot: {
            sequence: frame.sequence,
            base:     frame.base,
            checksum: frame.checksum
          },
          payload: frame.payload
        }
      });
      target.markLevelDataRevision?.(levelId, levelData.revision);
    }
  }

  syncPlayerStates() {
    for (const target of this.players.list()) {
      const levelId = target.levelId;
      if (levelId == null) continue;

      const parts = [];
      let totalBytes = 0;

      for (const peer of this.players.listInLevel(levelId)) {
        if (peer === target) continue;
        const raw = peer.playerDelta.rawState;
        if (!raw || raw.length === 0) continue;
        totalBytes += 1 + 4 + raw.length;
        parts.push({ id: peer.id, raw });
      }

      if (parts.length === 0) continue;

      const writer = new BinaryWriter(totalBytes);
      for (const { id, raw } of parts) {
        writer.writeUInt8(id);
        writer.writeUInt32(raw.length);
        writer.writeBytes(raw);
      }
      const aggregated = writer.toBuffer();

      const frame = target.playerDelta.write(aggregated);
      if (!frame) {
        this.warn({
          targetPlayerId: target.id,
          levelId,
          peerCount: parts.length,
          aggregatedBytes: totalBytes
        }, 'syncPlayerStates: dropped frame too large');
        continue;
      }

      this.broadcaster.send(target.session, {
        id: PacketIds.GameMsg,
        payload: {
          type: GameMsgType.PlayerStateDelta,
          levelChangeCount: target.lvSeq,
          sourcePlayer: 0,
          snapshot: {
            sequence: frame.sequence,
            base:     frame.base,
            checksum: frame.checksum
          },
          payload: frame.payload
        }
      });
    }
  }

  sendSnapshotAcks() {
    for (const target of this.players.list()) {
      this.broadcaster.send(target.session, {
        id: PacketIds.GameMsg,
        payload: {
          type: GameMsgType.SnapshotAck,
          levelChangeCount: target.lvSeq,
          sourcePlayer: 0,
          playerAckSeq: target.playerDelta.readAckSequence ?? 1,
          levelAckSeq: target.levelDelta.readAckSequence ?? 1
        }
      });
    }
  }

  createLevelElectPayload(authority, initialData) {
    const data = Buffer.from(initialData?.payload ?? initialData?.levelData ?? Buffer.alloc(0));
    const cached = this.levels.loadLevelData(authority.levelId);
    const payload = cached?.payload ? Buffer.from(cached.payload) : data;
    return encodeNetLevelDataMsg({
      ...(cached ?? {}),
      electedPlayer: authority.id,
      levelId: cached?.levelId ?? authority.levelId,
      hasInitialData: cached?.hasInitialData ?? initialData?.hasInitialData ?? payload.length > 0,
      levelData: payload
    });
  }
}
