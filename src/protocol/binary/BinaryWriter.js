export class BinaryWriter {
  constructor(initialSize = 256) {
    this.buffer = Buffer.allocUnsafe(initialSize);
    this.offset = 0;
  }

  ensure(size) {
    const required = this.offset + size;
    if (required <= this.buffer.length) {
      return;
    }

    let nextSize = this.buffer.length;
    while (nextSize < required) {
      nextSize *= 2;
    }

    const next = Buffer.allocUnsafe(nextSize);
    this.buffer.copy(next, 0, 0, this.offset);
    this.buffer = next;
  }

  writeUInt8(value) {
    this.ensure(1);
    this.buffer.writeUInt8(value & 0xff, this.offset++);
  }

  writeUInt16(value) {
    this.ensure(2);
    this.buffer.writeUInt16LE(value & 0xffff, this.offset);
    this.offset += 2;
  }

  writeUInt32(value) {
    this.ensure(4);
    this.buffer.writeUInt32LE(value >>> 0, this.offset);
    this.offset += 4;
  }

  writeUInt64(value) {
    this.ensure(8);
    this.buffer.writeBigUInt64LE(BigInt(value), this.offset);
    this.offset += 8;
  }

  writeDouble(value) {
    this.ensure(8);
    this.buffer.writeDoubleLE(Number(value), this.offset);
    this.offset += 8;
  }

  writeBytes(value) {
    const buffer = Buffer.from(value);
    this.ensure(buffer.length);
    buffer.copy(this.buffer, this.offset);
    this.offset += buffer.length;
  }

  pad(size) {
    this.ensure(size);
    this.buffer.fill(0, this.offset, this.offset + size);
    this.offset += size;
  }

  toBuffer() {
    return Buffer.from(this.buffer.subarray(0, this.offset));
  }
}
