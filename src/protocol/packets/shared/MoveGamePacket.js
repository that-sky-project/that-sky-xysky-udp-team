import { PacketIds } from '../../PacketIds.js';
import { NetAddress } from '../../types/NetAddress.js';
import { TgcUuid } from '../../types/TgcUuid.js';

export class MoveGamePacket {
  static id = PacketIds.MoveGame;
  static name = 'MoveGamePacket';

  static encode(writer, packet) {
    writer.pad(32);

    const address = packet.address instanceof NetAddress
      ? packet.address
      : new NetAddress(packet.address);
    address.encode(writer);
    writer.writeUInt64(packet.moveNonce ?? packet.unknownLong ?? 0n);
    writer.writeUInt8(packet.splitType ?? packet.flags ?? 0);
    writer.writeUInt32(packet.players?.length ?? 0);

    for (const player of packet.players ?? []) {
      player.uuid.encode(writer);
    }

    writer.writeUInt32(packet.u32Field ?? 0);
    writer.writeUInt8(packet.u08Field ?? 0);
    writer.writeUInt32(packet.u32Field2 ?? 0);
    writer.writeUInt8(packet.isSplit ? 1 : 0);

    const destUuid = packet.destinationUuid instanceof TgcUuid
      ? packet.destinationUuid
      : new TgcUuid(packet.destinationUuid != null ? packet.destinationUuid : Buffer.alloc(16));
    destUuid.encode(writer);
  }

  static decode(reader) {
    const rawBytes32 = reader.readBytes(32);

    const address = NetAddress.decode(reader);
    const moveNonce = reader.readUInt64();
    const splitType = reader.readUInt8();
    const playerCount = reader.readUInt32();
    const players = [];
    for (let i = 0; i < playerCount; i++) {
      players.push(TgcUuid.decode(reader));
    }

    const u32Field = reader.readUInt32();
    const u08Field = reader.readUInt8();
    const u32Field2 = reader.readUInt32();
    const isSplit = reader.readUInt8() !== 0;
    const destinationUuid = TgcUuid.decode(reader);

    return {
      rawBytes32,
      address,
      moveNonce,
      splitType,
      players,
      u32Field,
      u08Field,
      u32Field2,
      isSplit,
      destinationUuid
    };
  }
}
