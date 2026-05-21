import { PacketIds } from '../PacketIds.js';

export class DisconnectPacket {
  static id = PacketIds.Disconnect;
  static name = 'DisconnectPacket';

  static decode() {
    return {};
  }

  static encode() {}
}
