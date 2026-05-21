import { PacketIds } from '../PacketIds.js';
import { NetAddress } from '../types/NetAddress.js';

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
  }
}
