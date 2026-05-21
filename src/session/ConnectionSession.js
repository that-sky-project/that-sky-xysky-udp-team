let nextSessionId = 1;

export class ConnectionSession {
  constructor({ peerId, roomId }) {
    this.id = nextSessionId++;
    this.peerId = peerId;
    this.roomId = roomId;
    this.connectedAt = Date.now();
    this.lastPacketAt = this.connectedAt;
    this.player = null;
    this.joinTimer = null;
    this.closed = false;
    this.badPackets = 0;
  }

  markPacket(now = Date.now()) {
    this.lastPacketAt = now;
  }

  attachPlayer(player) {
    this.player = player;
  }

  close() {
    this.closed = true;
    if (this.joinTimer) {
      clearTimeout(this.joinTimer);
      this.joinTimer = null;
    }
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
