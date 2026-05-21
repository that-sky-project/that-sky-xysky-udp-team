import { PacketIds } from '../PacketIds.js';
import { TgcUuid } from '../types/TgcUuid.js';
import { NetVersion } from '../types/NetVersion.js';
import { NetAddress } from '../types/NetAddress.js';
import { ProtocolError } from '../../utils/errors.js';

const MAX_JOIN_LEVEL_DATA_BYTES = 0x2000;

function decodeMove(reader) {
  const address = NetAddress.decode(reader);
  const moveNonce = reader.readUInt64();
  const splitType = reader.readUInt8();
  const playerCount = reader.readUInt32();
  const players = [];

  for (let index = 0; index < playerCount; index += 1) {
    players.push(TgcUuid.decode(reader));
  }

  return {
    address,
    moveNonce,
    splitType,
    playerCount,
    players
  };
}

export class JoinGamePacket {
  static id = PacketIds.JoinGame;
  static name = 'JoinGamePacket';

  static decode(reader) {
    const uuid = TgcUuid.decode(reader);

    reader.skip(16);
    reader.skip(32);

    const move = decodeMove(reader);

    const joinToken = reader.readUInt32();
    const joinState = reader.readUInt8();
    const joinFlags = reader.readUInt32();
    const joinSignature = reader.readBytes(16);
    const serverVersion = reader.readUInt16();
    const clientVersion = reader.readUInt16();
    const rpcHash = reader.readUInt32();

    const netVersion = NetVersion.decode(reader);

    const levelChangeCount = reader.readUInt8();
    const levelId = reader.readUInt32();
    const levelSummary = reader.readBytes(64);
    const localPlayerId = reader.readUInt32();
    const currentPlayerId = reader.readUInt32();
    const levelDataLength = reader.readUInt16();
    if (levelDataLength > MAX_JOIN_LEVEL_DATA_BYTES) {
      throw new ProtocolError('join level data too large', {
        levelDataLength,
        max: MAX_JOIN_LEVEL_DATA_BYTES
      });
    }
    const levelData = reader.readBytes(levelDataLength);
    const moving = Boolean(reader.readUInt8());
    const hasTransferAddress = Boolean(reader.readUInt8());
    const mergeState = reader.readUInt8();
    const transferAddress = NetAddress.decode(reader);
    const moveResult = reader.readUInt32();

    return {
      uuid,
      move,
      joinToken,
      joinState,
      joinFlags,
      joinSignature,
      serverVersion,
      clientVersion,
      rpcHash,
      netVersion,
      levelChangeCount,
      levelId,
      levelSummary,
      levelState: levelSummary,
      localPlayerId,
      currentPlayerId,
      levelData,
      moving,
      hasTransferAddress,
      mergeState,
      mergeFlags: mergeState,
      transferAddress,
      moveResult
    };
  }
}
