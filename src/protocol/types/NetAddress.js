import { ProtocolError } from '../../utils/errors.js';

export class NetAddress {
  constructor({ host = '127.0.0.1', port = 0 } = {}) {
    this.host = host;
    this.port = port;
  }

  static fromBytes(bytes) {
    return new NetAddress({
      host: `${bytes[0]}.${bytes[1]}.${bytes[2]}.${bytes[3]}`,
      port: bytes.readUInt16LE(4)
    });
  }

  static decode(reader) {
    return NetAddress.fromBytes(reader.readBytes(6));
  }

  encode(writer) {
    const parts = this.host.split('.').map(part => Number(part));
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
      throw new ProtocolError('invalid IPv4 address', { host: this.host });
    }

    writer.writeUInt8(parts[0]);
    writer.writeUInt8(parts[1]);
    writer.writeUInt8(parts[2]);
    writer.writeUInt8(parts[3]);
    writer.writeUInt16(this.port);
  }

  toApi() {
    return {
      host: this.host,
      port: this.port
    };
  }
}
