import { PacketIds } from '../PacketIds.js';

export class PlayerChangeLevelPacket {
  static id = PacketIds.PlayerChangedLevel;
  static name = 'PlayerChangeLevelPacket';

  static encode(writer, packet) {
    writer.writeUInt8(packet.playerId);
    writer.writeUInt32(packet.levelId);
  }
}
