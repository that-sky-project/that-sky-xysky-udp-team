import { ProtocolError } from '../../utils/errors.js';

export class BinaryReader {
  constructor(buffer) {
    this.buffer = Buffer.from(buffer);
    this.offset = 0;
  }

  get remaining() {
    return this.buffer.length - this.offset;
  }

  ensure(size) {
    if (this.remaining < size) {
      throw new ProtocolError('packet buffer underflow', {
        offset: this.offset,
        need: size,
        remaining: this.remaining
      });
    }
  }

  skip(size) {
    this.ensure(size);
    this.offset += size;
  }

  readUInt8() {
    this.ensure(1);
    return this.buffer.readUInt8(this.offset++);
  }

  readUInt16() {
    this.ensure(2);
    const value = this.buffer.readUInt16LE(this.offset);
    this.offset += 2;
    return value;
  }

  readUInt32() {
    this.ensure(4);
    const value = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  readUInt64() {
    this.ensure(8);
    const value = this.buffer.readBigUInt64LE(this.offset);
    this.offset += 8;
    return value;
  }

  readDouble() {
    this.ensure(8);
    const value = this.buffer.readDoubleLE(this.offset);
    this.offset += 8;
    return value;
  }

  readBytes(size) {
    this.ensure(size);
    const value = this.buffer.subarray(this.offset, this.offset + size);
    this.offset += size;
    return value;
  }
}
