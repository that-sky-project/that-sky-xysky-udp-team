export class BroadcastService {
  constructor({ codec, transport, sessions, metrics }) {
    this.codec = codec;
    this.transport = transport;
    this.sessions = sessions;
    this.metrics = metrics;
  }

  send(session, packet, options) {
    const buffer = this.codec.encodeServer(packet);
    this.metrics?.packetBytes?.inc({ direction: 'server' }, buffer.length);
    this.transport.send(session.peerId, buffer, options);
  }

  broadcast(packet, { exceptSession, playerOnly = true } = {}) {
    const buffer = this.codec.encodeServer(packet);
    this.broadcastEncoded(buffer, { exceptSession, playerOnly });
  }

  broadcastEncoded(buffer, { exceptSession, playerOnly = true } = {}) {
    this.metrics?.packetBytes?.inc({ direction: 'server' }, buffer.length);

    for (const session of this.sessions.list()) {
      if (session.closed || session === exceptSession) {
        continue;
      }

      if (playerOnly && !session.player) {
        continue;
      }

      this.transport.send(session.peerId, buffer);
    }
  }
}
