import { PacketIds } from '../protocol/PacketIds.js';

export class LevelService {
  constructor({ players, levels, broadcaster, logger }) {
    this.players = players;
    this.levels = levels;
    this.broadcaster = broadcaster;
    this.logger = logger;
  }

  changeLevel(session, payload) {
    const player = this.players.getBySession(session);
    if (!player) {
      return;
    }

    const oldLevelId = player.levelId;
    const changedLevel = oldLevelId !== payload.levelId;
    player.changeLevel(payload.levelId, payload.netVersion);

    if (changedLevel) {
      const remainingPlayers = this.players.listInLevel(oldLevelId);
      if (remainingPlayers.length === 0) {
        this.levels.reset(oldLevelId, { reason: 'level_empty_after_change' });
      } else if (this.levels.getAuthority(oldLevelId) === player) {
        this.levels.revokeAuthority(oldLevelId, { reason: 'authority_left_level' });
      }
    }

    let authority = this.levels.getAuthority(player.levelId);
    if (!authority) {
      authority = player;
      this.levels.setAuthority(player.levelId, player, {
        reason: 'level_update_no_authority',
        targetPlayer: player
      });
    } else {
      for (const handler of this.levels._authorityElectedHandlers) {
        handler(player.levelId, authority, player);
      }
    }

    if (!changedLevel) {
      return;
    }

    const changedLevelPacket = {
      id: PacketIds.PlayerChangedLevel,
      payload: { playerId: player.id, levelId: player.levelId }
    };
    for (const target of this.players.listInLevel(oldLevelId)) {
      if (target.session !== session) {
        this.broadcaster.send(target.session, changedLevelPacket);
      }
    }
    for (const target of this.players.listInLevel(player.levelId)) {
      if (target.session !== session) {
        this.broadcaster.send(target.session, changedLevelPacket);
      }
    }

    this.logger.debug({
      playerId: player.id,
      oldLevelId,
      levelId: player.levelId,
      authorityPlayerId: authority?.id
    }, 'player changed level');
  }

  releaseAuthority(player, reason = 'player_disconnected') {
    if (!player) {
      return;
    }

    if (this.players.listInLevel(player.levelId).length === 0) {
      this.levels.reset(player.levelId, { reason: 'level_empty_after_disconnect' });
    } else if (this.levels.getAuthority(player.levelId) === player) {
      this.levels.revokeAuthority(player.levelId, { reason });
    }
  }

  rebalanceAuthority(levelId, { notify = true, excludePlayer } = {}) {
    const current = this.levels.getAuthority(levelId);
    const levelPlayers = this.players.listInLevel(levelId);

    if (current && levelPlayers.includes(current) && current !== excludePlayer) {
      return { authority: current };
    }

    const previousAuthorityPlayerId = current?.id;
    const next = levelPlayers.find(player => player !== excludePlayer);
    if (next) {
      this.levels.setAuthority(levelId, next, {
        previousAuthorityPlayerId,
        reason: current ? 'authority_left_level' : 'level_rebalance',
        notify
      });
      return { authority: next };
    }

    if (levelPlayers.length === 0) {
      this.levels.reset(levelId, { reason: 'level_empty' });
    }
    return { authority: undefined };
  }
}
