import { PacketIds } from '../PacketIds.js';

export class CancelMovePacket {
  static id = PacketIds.CancelMove;
  static name = 'CancelMovePacket';

  static decode(reader) {
    return {
      reason: reader.readUInt8(),
      payloadBytes: reader.readBytes(reader.remaining)
    };
  }

  static encode(writer, packet) {
    writer.writeUInt8(packet.reason ?? packet.payloadBytes?.[0] ?? 0);
    if (packet.payloadBytes?.length > 1) {
      writer.writeBytes(packet.payloadBytes.subarray(1));
    }
  }
}
