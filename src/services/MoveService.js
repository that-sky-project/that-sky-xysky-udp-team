import { PacketIds } from '../protocol/PacketIds.js';

export class MoveService {
  constructor({ players, rooms, broadcaster, transport, logger }) {
    this.players = players;
    this.rooms = rooms;
    this.broadcaster = broadcaster;
    this.transport = transport;
    this.logger = logger;
    this.pendingMoves = new Map();
    this.moveHistory = new Map();
  }

  movePlayer(player, targetRoom, { disconnect = true } = {}) {
    if (!player || !targetRoom) {
      return false;
    }

    const moveId = this.createMoveId(player, targetRoom);
    const moveNonce = this.createMoveNonce(player, targetRoom);
    this.pendingMoves.set(moveId, {
      moveId,
      playerId: player.id,
      playerUuid: player.uuid?.toString?.(),
      playerLevelId: player.levelId,
      targetRoomId: targetRoom.id,
      targetAddress: targetRoom.address?.toApi?.() ?? targetRoom.address,
      moveNonce,
      splitType: 0,
      status: 'pending',
      createdAt: Date.now()
    });

    this.broadcaster.send(player.session, {
      id: PacketIds.MoveGame,
      payload: {
        address: targetRoom.address,
        players: [player],
        moveNonce,
        splitType: 0
      }
    });

    this.logger.info({
      playerId: player.id,
      targetRoomId: targetRoom.id,
      target: targetRoom.address.toApi()
    }, 'player move requested');

    if (disconnect) {
      this.transport.disconnect(player.session.peerId, 'later', 2);
    }

    return true;
  }

  moveLevel(levelId, targetRoom) {
    const players = this.players.listInLevel(Number(levelId));
    let moved = 0;

    for (const player of players) {
      if (this.movePlayer(player, targetRoom)) {
        moved += 1;
      }
    }

    return moved;
  }

  cancelPlayerMove(player, reason = 0) {
    if (!player) {
      return false;
    }

    this.broadcaster.send(player.session, {
      id: PacketIds.CancelMove,
      payload: {
        reason
      }
    });

    for (const [moveId, move] of this.pendingMoves.entries()) {
      if (move.playerId === player.id) {
        const updated = {
          ...move,
          status: 'cancelled',
          cancelReason: reason,
          cancelledAt: Date.now()
        };
        this.pendingMoves.delete(moveId);
        this.moveHistory.set(moveId, updated);
      }
    }

    return true;
  }

  handleMoveResult(session, payload) {
    const player = this.players.getBySession(session);
    if (!player) {
      return;
    }

    const result = payload?.result ?? payload?.payloadBytes?.[0] ?? 0;
    const matched = this.findPendingByPlayer(player.id);
    if (matched) {
      const updated = {
        ...matched,
        status: result === 0 ? 'acknowledged' : 'failed',
        result,
        acknowledgedAt: Date.now()
      };
      this.pendingMoves.delete(matched.moveId);
      this.moveHistory.set(matched.moveId, updated);
    }

    this.logger.debug({
      playerId: player.id,
      result,
      payloadBytes: payload.payloadBytes?.length ?? 0
    }, 'received move result');
  }

  createMoveId(player, targetRoom) {
    return `${player.id}:${targetRoom.id}:${Date.now()}`;
  }

  listPending() {
    return Array.from(this.pendingMoves.values());
  }

  listHistory() {
    return Array.from(this.moveHistory.values());
  }

  findPendingByPlayer(playerId) {
    for (const move of this.pendingMoves.values()) {
      if (move.playerId === playerId && move.status === 'pending') {
        return move;
      }
    }

    return undefined;
  }

  createMoveNonce(player, targetRoom) {
    const high = BigInt(player.id & 0xff);
    const low = BigInt((targetRoom.id?.toString?.().length ?? 0) & 0xff);
    return (BigInt(Date.now()) << 16n) ^ (high << 8n) ^ low;
  }
}
