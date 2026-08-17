import { PacketIds } from '../../PacketIds.js';

export class MoveResultPacket {
  static id = PacketIds.MoveResult;
  static name = 'MoveResultPacket';

  static decode(reader) {
    return {
      result: reader.readUInt8(),
      payloadBytes: reader.readBytes(reader.remaining)
    };
  }

  static encode(writer, packet) {
    writer.writeUInt8(packet.result ?? packet.payloadBytes?.[0] ?? 0);
    if (packet.payloadBytes?.length > 1) {
      writer.writeBytes(packet.payloadBytes.subarray(1));
    }
  }
}
