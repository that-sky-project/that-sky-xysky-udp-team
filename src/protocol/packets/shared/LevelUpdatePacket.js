import { PacketIds } from '../../PacketIds.js';
import { NetVersion } from '../../types/NetVersion.js';

export class LevelUpdatePacket {
  static id = PacketIds.LevelUpdate;
  static name = 'LevelUpdatePacket';

  static decode(reader) {
    return {
      levelChangeCount: reader.readUInt8(),
      netVersion: NetVersion.decode(reader),
      levelStatus: reader.readUInt8(),
      levelId: reader.readUInt32(),
      levelSummary: reader.readBytes(64),
      trailingState: reader.readUInt8()
    };
  }

  static encode(writer, packet) {
    writer.writeUInt8(packet.levelChangeCount ?? 0);
    const netVersion = packet.netVersion instanceof NetVersion
      ? packet.netVersion
      : new NetVersion(Array.isArray(packet.netVersion) ? packet.netVersion : packet.netVersion?.values ?? []);
    netVersion.encode(writer);
    writer.writeUInt8(packet.levelStatus ?? packet.unknown2 ?? 0);
    writer.writeUInt32(packet.levelId);
    writer.writeBytes(packet.levelSummary ?? packet.unknown3 ?? Buffer.alloc(64));
    writer.writeUInt8(packet.trailingState ?? packet.unknown4 ?? 0);
  }
}
