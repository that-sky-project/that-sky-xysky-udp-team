import { PacketIds } from '../PacketIds.js';

export class EnterGamePacket {
  static id = PacketIds.EnterGame;
  static name = 'EnterGamePacket';

  static encode(writer, packet) {
    writer.writeUInt8(packet.players.length);

    for (const player of packet.players) {
      writer.writeUInt8(player.netId);
      player.uuid.encode(writer);
      writer.pad(16);
      writer.writeUInt32(player.levelId);
    }
  }
}
