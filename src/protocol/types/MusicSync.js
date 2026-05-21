import { BinaryReader } from '../binary/BinaryReader.js';

const MUSIC_SYNC_ENTRY_BYTES = 32 + 8 + 4 + 1;

export function decodeMusicSyncEntries(buffer) {
  const reader = new BinaryReader(buffer);
  const entries = [];

  while (reader.remaining >= MUSIC_SYNC_ENTRY_BYTES) {
    const name = readCString(reader, 32);
    const progress = reader.readDouble();
    const speed = readFloat(reader);
    const enabled = Boolean(reader.readUInt8());
    entries.push({ name, progress, speed, enabled });
  }

  return {
    entries,
    trailingBytes: reader.remaining,
    complete: reader.remaining === 0
  };
}

function readCString(reader, maxLength) {
  const bytes = reader.readBytes(maxLength);
  const terminator = bytes.indexOf(0);
  return bytes.subarray(0, terminator === -1 ? bytes.length : terminator).toString('utf8');
}

function readFloat(reader) {
  reader.ensure(4);
  const value = reader.buffer.readFloatLE(reader.offset);
  reader.offset += 4;
  return value;
}
