import { PacketIds } from '../../PacketIds.js';

export class PlayerLeftPacket {
  static id = PacketIds.PlayerLeft;
  static name = 'PlayerLeftPacket';

  static decode(reader) {
    return {
      playerId: reader.readUInt8(),
      reason: reader.readUInt8()
    };
  }

  static encode(writer, packet) {
    writer.writeUInt8(packet.playerId);
    writer.writeUInt8(packet.reason ?? 0);
  }
}
