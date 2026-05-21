import { BinaryReader } from './binary/BinaryReader.js';
import { BinaryWriter } from './binary/BinaryWriter.js';
import { PacketIds } from './PacketIds.js';
import { DisconnectPacket } from './packets/DisconnectPacket.js';
import { EnterGamePacket } from './packets/EnterGamePacket.js';
import { JoinGamePacket } from './packets/JoinGamePacket.js';
import { LevelUpdatePacket } from './packets/LevelUpdatePacket.js';
import { MoveGamePacket } from './packets/MoveGamePacket.js';
import { MoveResultPacket } from './packets/MoveResultPacket.js';
import { CancelMovePacket } from './packets/CancelMovePacket.js';
import { GameMsgPacket } from './packets/GameMsgPacket.js';
import { NetTimePingPacket } from './packets/NetTimePingPacket.js';
import { NetTimePongPacket } from './packets/NetTimePongPacket.js';
import { PlayerChangeLevelPacket } from './packets/PlayerChangeLevelPacket.js';
import { PlayerLeftPacket } from './packets/PlayerLeftPacket.js';
import { ProtocolError } from '../utils/errors.js';

const packetTypes = new Map();

export function registerPacket(packetType) {
  packetTypes.set(packetType.id, packetType);
}

[
  DisconnectPacket,
  EnterGamePacket,
  JoinGamePacket,
  LevelUpdatePacket,
  MoveGamePacket,
  MoveResultPacket,
  CancelMovePacket,
  GameMsgPacket,
  NetTimePingPacket,
  NetTimePongPacket,
  PlayerChangeLevelPacket,
  PlayerLeftPacket
].forEach(registerPacket);

export class PacketCodec {
  decodeClient(buffer) {
    const reader = new BinaryReader(buffer);
    const token = reader.readUInt32();
    const id = reader.readUInt8();
    const sequence = reader.readUInt8();
    const packetType = packetTypes.get(id);

    if (!packetType?.decode) {
      throw new ProtocolError('unknown client packet', { id });
    }

    const payload = packetType.decode(reader, { fromServer: false });
    return {
      id,
      name: packetType.name,
      token,
      sequence,
      payload
    };
  }

  encodeServer(packet) {
    const packetType = packetTypes.get(packet.id);
    if (!packetType?.encode) {
      throw new ProtocolError('unknown server packet', { id: packet.id });
    }

    const payloadWriter = new BinaryWriter();
    packetType.encode(payloadWriter, packet.payload ?? {}, { fromServer: true });

    const payload = payloadWriter.toBuffer();
    const writer = new BinaryWriter(payload.length + 3);
    writer.writeUInt8(packet.id);
    writer.writeUInt16(payload.length);
    writer.writeBytes(payload);
    return writer.toBuffer();
  }
}

export { PacketIds };
