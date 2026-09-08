import { BinaryReader } from '../binary/BinaryReader.js';
import { BinaryWriter } from '../binary/BinaryWriter.js';

export const AFFINITY_MAX_ENTRIES = 8;

export function decodeAffinityEntries(buffer) {
  const reader = new BinaryReader(buffer);
  const count = reader.readCompressed(AFFINITY_MAX_ENTRIES);
  const entries = [];

  for (let index = 0; index < count; index += 1) {
    entries.push({
      netPlayerId: reader.readUInt8(),
      value: reader.readUInt8()
    });
  }

  return {
    count,
    entries,
    trailingBytes: reader.remaining,
    complete: reader.remaining === 0
  };
}

export function encodeAffinityEntries(entries = []) {
  if (!Array.isArray(entries) || entries.length > AFFINITY_MAX_ENTRIES) {
    throw new RangeError(`affinity entry count exceeds ${AFFINITY_MAX_ENTRIES}`);
  }

  const writer = new BinaryWriter(1 + entries.length * 2);
  writer.writeCompressed(entries.length, AFFINITY_MAX_ENTRIES);
  for (const entry of entries) {
    writer.writeUInt8(entry.netPlayerId);
    writer.writeUInt8(entry.value);
  }
  return writer.toBuffer();
}
