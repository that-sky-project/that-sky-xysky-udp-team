import { PacketIds } from '../../PacketIds.js';

export class DisconnectPacket {
  static id = PacketIds.Disconnect;
  static name = 'DisconnectPacket';

  static decode(reader) {
    const reason = reader.remaining >= 1 ? reader.readUInt8() : 0;
    return { reason };
  }

  static encode(writer, packet) {
    writer.writeUInt8(packet.reason ?? 0);
  }
}
