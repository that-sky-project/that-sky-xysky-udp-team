import { PacketIds } from '../../PacketIds.js';

export class NetTimePingPacket {
  static id = PacketIds.NetTimePing;
  static name = 'NetTimePingPacket';

  static decode(reader) {
    return {
      requestId: reader.readUInt16()
    };
  }

  static encode(writer, packet) {
    writer.writeUInt16(packet.requestId);
  }
}
