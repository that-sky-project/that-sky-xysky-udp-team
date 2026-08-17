let nextSessionId = 1;

export class ConnectionSession {
  constructor({ peerId, roomId }) {
    this.id = nextSessionId++;
    this.peerId = peerId;
    this.roomId = roomId;
    this.connectedAt = Date.now();
    this.lastPacketAt = this.connectedAt;
    this.player = null;
    this.closed = false;
    this.badPackets = 0;
    this._sessionSeq = 0;
    this._packetSeq = new Map();
  }

  /**
   * Allocate the next session_seq and packet_seq for packet type `typeId`.
   * Returns { sessionSeq: u32, packetSeq: u08 } for the outbound header.
   */
  nextOutboundSeq(typeId) {
    this._sessionSeq = (this._sessionSeq + 1) >>> 0;
    const prev = this._packetSeq.get(typeId) ?? 0;
    const seq = (prev + 1) & 0xff;
    this._packetSeq.set(typeId, seq);
    return { sessionSeq: this._sessionSeq, packetSeq: seq };
  }

  markPacket(now = Date.now()) {
    this.lastPacketAt = now;
  }

  attachPlayer(player) {
    this.player = player;
  }

  close() {
    this.closed = true;
  }

  registerBadPacket() {
    this.badPackets += 1;
    return this.badPackets;
  }

  toApi() {
    return {
      id: this.id,
      roomId: this.roomId,
      peerId: this.peerId.toString(),
      connectedAt: this.connectedAt,
      lastPacketAt: this.lastPacketAt,
      playerId: this.player?.id,
      badPackets: this.badPackets
    };
  }
}
