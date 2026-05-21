import { PacketIds } from '../protocol/PacketCodec.js';
import { performance } from 'node:perf_hooks';

export class PacketDispatcher {
  constructor({ joinService, levelService, gameMessageService, moveService, broadcaster, logger, clock = monotonicSeconds }) {
    this.joinService = joinService;
    this.levelService = levelService;
    this.gameMessageService = gameMessageService;
    this.moveService = moveService;
    this.broadcaster = broadcaster;
    this.logger = logger;
    this.clock = clock;
  }

  dispatch(session, packet) {
    switch (packet.id) {
      case PacketIds.JoinGame:
        this.joinService.join(session, packet.payload);
        return;

      case PacketIds.NetTimePing:
        this.handlePing(session, packet.payload);
        return;

      case PacketIds.LevelUpdate:
        this.levelService.changeLevel(session, packet.payload);
        return;

      case PacketIds.GameMsg:
        this.gameMessageService.handle(session, packet.payload);
        return;

      case PacketIds.MoveResult:
        this.moveService.handleMoveResult(session, packet.payload);
        return;

      case PacketIds.CancelMove:
        this.moveService.cancelPlayerMove(this.moveService.players.getBySession(session), packet.payload.reason);
        this.logger.debug({ sessionId: session.id, reason: packet.payload.reason }, 'client cancelled move');
        return;

      case PacketIds.Disconnect:
        this.logger.debug({ sessionId: session.id }, 'client requested disconnect');
        return;

      default:
        this.logger.debug({ id: packet.id, name: packet.name }, 'packet handler not implemented');
    }
  }

  handlePing(session, payload) {
    const recv = this.clock();
    this.broadcaster.send(session, {
      id: PacketIds.NetTimePong,
      payload: {
        requestId: payload.requestId,
        serverRecvTime: recv,
        serverSendTime: this.clock()
      }
    });
  }
}

function monotonicSeconds() {
  return performance.now() / 1000;
}
