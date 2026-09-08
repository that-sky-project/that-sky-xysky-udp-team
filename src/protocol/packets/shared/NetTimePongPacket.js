import { PacketIds } from '../../PacketIds.js';

export class NetTimePongPacket {
  static id = PacketIds.NetTimePong;
  static name = 'NetTimePongPacket';

  // Wire format (Server→Client):
  //   [requestId: u16][serverRecvTime: f64][serverSendTime: f64]
  //
  // serverRecvTime — Unix timestamp (seconds, f64) when the server received
  //                  the corresponding NetTimePing.
  // serverSendTime — Unix timestamp (seconds, f64) when the server sends
  //                  the NetTimePong response.
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
    writer.writeDouble(packet.serverSendTime ?? packet.serverRecvTime ?? 0);
  }
}
