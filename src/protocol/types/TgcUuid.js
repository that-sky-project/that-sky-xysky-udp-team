import { ProtocolError } from '../../utils/errors.js';

export class TgcUuid {
  constructor(bytes = Buffer.alloc(16)) {
    if (bytes.length !== 16) {
      throw new ProtocolError('TgcUuid must be 16 bytes', { length: bytes.length });
    }

    this.bytes = Buffer.from(bytes);
  }

  static decode(reader) {
    return new TgcUuid(reader.readBytes(16));
  }

  encode(writer) {
    writer.writeBytes(this.bytes);
  }

  toString() {
    return [
      this.bytes.subarray(0, 4).toString('hex'),
      this.bytes.subarray(4, 6).toString('hex'),
      this.bytes.subarray(6, 8).toString('hex'),
      this.bytes.subarray(8, 10).toString('hex'),
      this.bytes.subarray(10, 16).toString('hex')
    ].join('-');
  }
}
