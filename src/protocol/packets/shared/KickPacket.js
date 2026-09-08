import { PacketIds } from '../../PacketIds.js';

export class KickPacket {
  static id = PacketIds.Kick;
  static name = 'KickPacket';

  // Wire format (Server→Client):
  //   [length: u32 LE][data: u08[length]]
  //
  // The reason is a length-prefixed UTF-8 string, max 256 bytes.
  // Reversed from sub_140e148d0 / sub_140037d00.
  static decode(reader) {
    const length = reader.readUInt32();
    const data = reader.readBytes(length);
    return { reason: data.toString('utf8') };
  }

  static encode(writer, packet) {
    const reason = packet.reason ?? '';
    const data = Buffer.from(String(reason), 'utf8').subarray(0, 256);
    writer.writeUInt32(data.length);
    writer.writeBytes(data);
  }
}
