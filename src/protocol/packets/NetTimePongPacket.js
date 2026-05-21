import { PacketIds } from '../PacketIds.js';

export class NetTimePongPacket {
  static id = PacketIds.NetTimePong;
  static name = 'NetTimePongPacket';

  static decode(reader) {
    return {
      requestId: reader.readUInt16(),
      serverRecvTime: reader.readDouble(),
      serverSendTime: reader.readDouble()
    };
  }

  static encode(writer, packet) {
    writer.writeUInt16(packet.requestId);
    writer.writeDouble(packet.serverRecvTime);
    writer.writeDouble(packet.serverSendTime);
  }
}
