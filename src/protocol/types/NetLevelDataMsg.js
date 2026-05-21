import { BinaryReader } from '../binary/BinaryReader.js';
import { BinaryWriter } from '../binary/BinaryWriter.js';
import { SNAPSHOT_MAX_DATA_BYTES } from '../snapshot/constants.js';

export function decodeNetLevelDataMsg(buffer, options = {}) {
  const reader = buffer instanceof BinaryReader ? buffer : new BinaryReader(buffer);
  const { skipHeaderBytes = 0 } = options;

  if (skipHeaderBytes > 0) {
    reader.skip(skipHeaderBytes);
  }

  const electedPlayer = reader.readUInt8();
  const levelId = reader.readUInt32();
  const unknown1 = reader.readUInt16();
  const hasInitialData = reader.readUInt8() === 1;
  const netLevelData = readNetLevelData(reader, options);
  const remaining = reader.remaining;

  return {
    electedPlayer,
    levelId,
    unknown1,
    hasInitialData,
    ...netLevelData,
    trailingBytes: remaining
  };
}

export function encodeNetLevelDataMsg({
  electedPlayer,
  levelId,
  levelData = Buffer.alloc(0),
  mergeState = 0,
  unknown1 = 0,
  unknown2 = 0,
  unknown3 = 0,
  levelHash = 0,
  unknown4 = levelHash,
  unknown5 = 0,
  unknown6 = 0,
  unknown7 = 0,
  hasInitialData = false
}) {
  const writer = new BinaryWriter(64 + levelData.length);

  writer.writeUInt8(electedPlayer);
  writer.writeUInt32(levelId);
  writer.writeUInt16(unknown1);
  writer.writeUInt8(hasInitialData ? 1 : 0);
  writer.writeUInt16(unknown2);
  writer.writeUInt8(unknown3);
  writer.writeUInt32(unknown4);
  writer.writeUInt8(mergeState);
  writer.writeUInt16(unknown6);
  writer.writeUInt16(unknown7);
  writer.writeUInt16(levelData.length);
  writer.writeBytes(levelData);

  return writer.toBuffer();
}

export function readNetLevelData(reader, options = {}) {
  const { maxDataBytes = SNAPSHOT_MAX_DATA_BYTES } = options;

  const unknown2 = reader.readUInt16();
  const unknown3 = reader.readUInt8();
  const levelHash = reader.readUInt32();
  const mergeState = readNetLevelMergeState(reader);
  const unknown6 = reader.readUInt16();
  const unknown7 = reader.readUInt16();
  const dataLength = reader.readUInt16();

  if (dataLength > maxDataBytes) {
    throw new Error(`dataLength ${dataLength} exceeds maximum ${maxDataBytes}`);
  }

  const levelData = dataLength > 0 ? reader.readBytes(dataLength) : Buffer.alloc(0);

  return {
    unknown2,
    unknown3,
    levelHash,
    unknown4: levelHash,
    mergeState,
    unknown5: 0,
    unknown6,
    unknown7,
    dataLength,
    levelData
  };
}

export function writeNetLevelData(writer, {
  unknown2 = 0,
  unknown3 = 0,
  levelHash = 0,
  unknown4 = levelHash,
  mergeState = 0,
  unknown5 = 0,
  unknown6 = 0,
  unknown7 = 0,
  dataLength = 0,
  levelData = Buffer.alloc(0)
}) {
  writer.writeUInt16(unknown2);
  writer.writeUInt8(unknown3);
  writer.writeUInt32(unknown4);
  writeNetLevelMergeState(writer, mergeState);
  writer.writeUInt8(unknown5);
  writer.writeUInt16(unknown6);
  writer.writeUInt16(unknown7);
  writer.writeUInt16(dataLength);
  writer.writeBytes(levelData);
}

export function readNetLevelMergeState(reader) {
  return reader.readUInt8();
}

export function writeNetLevelMergeState(writer, mergeState = 0) {
  writer.writeUInt8(mergeState);
}
