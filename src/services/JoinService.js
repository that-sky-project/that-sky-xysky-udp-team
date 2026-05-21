import { PacketIds } from '../protocol/PacketCodec.js';

export class JoinService {
  constructor({ players, levels, broadcaster, logger, metrics, onAuthorityChanged }) {
    this.players = players;
    this.levels = levels;
    this.broadcaster = broadcaster;
    this.logger = logger;
    this.metrics = metrics;
    this.onAuthorityChanged = onAuthorityChanged;
  }

  join(session, payload) {
    const player = this.players.add({
      session,
      uuid: payload.uuid,
      levelId: payload.levelId,
      netVersion: payload.netVersion
    });

    session.attachPlayer(player);

    this.metrics.onlinePlayers.set(this.players.size);

    this.broadcaster.broadcast({
      id: PacketIds.EnterGame,
      payload: {
        players: this.players.list().map(current => ({
          netId: current.id,
          uuid: current.uuid,
          levelId: current.levelId
        }))
      }
    }, { playerOnly: true });

    const authority = this.levels.getAuthority(player.levelId);
    if (!authority) {
      this.levels.setAuthority(player.levelId, player, { reason: 'join_first_player' });
      this.onAuthorityChanged?.(player, player);
    } else {
      this.onAuthorityChanged?.(player, authority);
    }

    this.logger.info({
      peerId: session.peerId.toString(),
      playerId: player.id,
      uuid: player.uuid.toString(),
      levelId: player.levelId
    }, 'player joined');

    return player;
  }
}
