export class Snapshot {
  constructor(sequence = 0, data = Buffer.alloc(0)) {
    this.sequence = sequence & 0xff;
    this.data = Buffer.from(data);
  }

  clone() {
    return new Snapshot(this.sequence, this.data);
  }

  createDelta(base) {
    if (!base?.data?.length) {
      return Buffer.from(this.data);
    }

    const sourceLength = this.data.length;
    const baseLength = base.data.length;
    const minLength = Math.min(sourceLength, baseLength);
    const output = Buffer.allocUnsafe(sourceLength * 2);
    let cursor = 0;
    let index = 0;

    while (index < sourceLength) {
      let zeroRun = 0;
      while (index < minLength && this.data[index] === base.data[index] && zeroRun < 255) {
        index += 1;
        zeroRun += 1;
      }

      if (zeroRun > 0) {
        output[cursor++] = 0;
        output[cursor++] = zeroRun;
      }

      while (index < sourceLength && (index >= baseLength || this.data[index] !== base.data[index])) {
        output[cursor++] = index < baseLength
          ? this.data[index] ^ base.data[index]
          : this.data[index];
        index += 1;
      }
    }

    return output.subarray(0, cursor);
  }

  static applyDelta(base, sequence, delta) {
    if (!base?.data) {
      return new Snapshot(sequence, Buffer.from(delta));
    }

    let decodedLength = 0;
    for (let index = 0; index < delta.length; index += 1) {
      if (delta[index] === 0 && index + 1 < delta.length) {
        decodedLength += delta[index + 1];
        index += 1;
      } else {
        decodedLength += 1;
      }
    }

    const output = Buffer.alloc(decodedLength);
    base.data.copy(output, 0, 0, Math.min(base.data.length, output.length));
    let baseIndex = 0;

    for (let index = 0; index < delta.length; index += 1) {
      if (delta[index] === 0 && index + 1 < delta.length) {
        baseIndex += delta[index + 1];
        index += 1;
      } else {
        const baseValue = baseIndex < base.data.length ? base.data[baseIndex] : 0;
        output[baseIndex++] = delta[index] ^ baseValue;
      }
    }

    return new Snapshot(sequence, output);
  }
}
