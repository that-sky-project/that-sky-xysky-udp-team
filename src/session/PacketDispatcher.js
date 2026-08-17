export class PacketDispatcher {
  constructor({ context }) {
    this.handlers = new Map();
    this.context = context;
  }

  register(packetId, handlerFn) {
    this.handlers.set(packetId, handlerFn);
    return this;
  }

  dispatch(session, packet) {
    const handler = this.handlers.get(packet.id);
    if (!handler) {
      this.context.logger.debug({ id: packet.id, name: packet.name }, 'packet handler not implemented');
      return;
    }
    handler(session, packet.payload, this.context);
  }
}
