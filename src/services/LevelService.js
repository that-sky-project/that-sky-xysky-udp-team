import { PacketIds } from '../protocol/PacketCodec.js';

export class LevelService {
  constructor({ players, levels, broadcaster, logger, onAuthorityChanged }) {
    this.players = players;
    this.levels = levels;
    this.broadcaster = broadcaster;
    this.logger = logger;
    this.onAuthorityChanged = onAuthorityChanged;
  }

  changeLevel(session, payload) {
    const player = this.players.getBySession(session);
    if (!player) {
      return;
    }

    const oldLevelId = player.levelId;
    player.changeLevel(payload.levelId, payload.levelChangeCount, payload.netVersion);

    this.rebalanceAuthority(oldLevelId);
    const authority = this.rebalanceAuthority(player.levelId);
    if (authority && authority !== player) {
      this.onAuthorityChanged?.(player, authority);
    }

    this.broadcaster.broadcast({
      id: PacketIds.PlayerChangedLevel,
      payload: {
        playerId: player.id,
        levelId: player.levelId
      }
    }, { exceptSession: session, playerOnly: true });

    this.logger.debug({
      playerId: player.id,
      oldLevelId,
      levelId: player.levelId,
      authorityPlayerId: authority?.id
    }, 'player changed level');
  }

  rebalanceAuthority(levelId) {
    const current = this.levels.getAuthority(levelId);
    const players = this.players.listInLevel(levelId);

    if (current && players.includes(current)) {
      return current;
    }

    const previousAuthorityPlayerId = current?.id;
    const next = players[0];
    if (next) {
      this.levels.setAuthority(levelId, next, {
        previousAuthorityPlayerId,
        reason: current ? 'authority_left_level' : 'level_rebalance'
      });
      for (const player of players) {
        this.onAuthorityChanged?.(player, next);
      }
      return next;
    }

    this.levels.reset(levelId, { reason: 'level_empty' });
    return undefined;
  }
}
