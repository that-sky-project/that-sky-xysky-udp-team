import { PacketIds } from '../../protocol/PacketIds.js';
import { handleJoin } from './handleJoin.js';
import { handlePing } from './handlePing.js';
import { handleLevelUpdate } from './handleLevelUpdate.js';
import { handleGameMsg } from './handleGameMsg.js';
import { handleMoveResult } from './handleMoveResult.js';
import { handleCancelMove } from './handleCancelMove.js';
import { handleDisconnect } from './handleDisconnect.js';

export function registerAllHandlers(dispatcher) {
  dispatcher
    .register(PacketIds.JoinGame,    handleJoin)
    .register(PacketIds.NetTimePing, handlePing)
    .register(PacketIds.LevelUpdate, handleLevelUpdate)
    .register(PacketIds.GameMsg,     handleGameMsg)
    .register(PacketIds.MoveResult,  handleMoveResult)
    .register(PacketIds.CancelMove,  handleCancelMove)
    .register(PacketIds.Disconnect,  handleDisconnect);
}
