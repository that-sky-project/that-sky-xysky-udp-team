import { PacketIds } from '../../PacketIds.js';

export class EnterGamePacket {
  static id = PacketIds.EnterGame;
  static name = 'EnterGamePacket';

  // Wire format (Server→Client):
  //   [player_count: compressed int 0..8]
  //   per player (stride 37 bytes):
  //     [net_player_id: u08]       (player's assigned ID, 0-based)
  //     [player_uuid: u08[16]]
  //     [session_token: u08[16]]   (zeroed — server has no per-player token)
  //     [level_id: u32 LE]         (FNV-1a hash of the level the player is in)
  //
  // Reversed from sub_140e14760 in the game binary.
  static encode(writer, packet) {
    const players = packet.players ?? [];

    // compressed int 0..8: values 0–127 fit in a single byte (MSB = 0).
    writer.writeUInt8(players.length & 0x7f);

    for (const player of players) {
      // net_player_id byte — the player's assigned ID (0-based, matching
      // client-side NetPlayerBarn session_id counter).
      writer.writeUInt8(player.netId ?? player.id ?? 0);
      // 16-byte player UUID
      player.uuid.encode(writer);
      // 16-byte session token (zeroed — not known server-side)
      writer.pad(16);
      // level_id: FNV-1a hash of the level name the player is currently in.
      writer.writeUInt32(player.levelId ?? 0);
    }
  }
}
