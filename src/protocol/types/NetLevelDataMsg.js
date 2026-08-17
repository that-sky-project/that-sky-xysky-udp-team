import { BinaryReader } from '../binary/BinaryReader.js';
import { BinaryWriter } from '../binary/BinaryWriter.js';
import { SNAPSHOT_MAX_DATA_BYTES } from '../snapshot/constants.js';
import { ProtocolError } from '../../utils/errors.js';

export const NET_LEVEL_DATA_HEADER_BYTES = 22;
export const MAX_LEVEL_DATA_PAYLOAD_BYTES = SNAPSHOT_MAX_DATA_BYTES - NET_LEVEL_DATA_HEADER_BYTES;

export function decodeNetLevelDataMsg(buffer, options = {}) {
  const reader = buffer instanceof BinaryReader ? buffer : new BinaryReader(buffer);
  const { skipHeaderBytes = 0 } = options;

  if (skipHeaderBytes > 0) {
    reader.skip(skipHeaderBytes);
  }

  const electedPlayer = reader.readUInt8();
  const levelId = reader.readUInt32();
  const unknown1 = reader.readUInt16();
  const hasInitialDataRaw = reader.readUInt8();
  const netLevelData = readNetLevelData(reader, options);
  const remaining = reader.remaining;

  return {
    electedPlayer,
    levelId,
    unknown1,
    hasInitialData: hasInitialDataRaw !== 0,
    hasInitialDataRaw,
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
  levelHash,
  unknown4,
  unknown5 = 0,
  unknown6 = 0,
  hasInitialData = false,
  hasInitialDataRaw
}) {
  const data = Buffer.from(levelData);
  if (data.length > MAX_LEVEL_DATA_PAYLOAD_BYTES) {
    throw new ProtocolError('level data too large', {
      dataLength: data.length,
      max: MAX_LEVEL_DATA_PAYLOAD_BYTES
    });
  }

  const writer = new BinaryWriter(NET_LEVEL_DATA_HEADER_BYTES + data.length);
  const wireLevelHash = levelHash ?? unknown4 ?? 0;
  const wireHasInitialData = hasInitialDataRaw ?? (hasInitialData ? 1 : 0);

  writer.writeUInt8(electedPlayer);
  writer.writeUInt32(levelId);
  writer.writeUInt16(unknown1);
  writer.writeUInt8(wireHasInitialData);
  writer.writeUInt16(unknown2);
  writer.writeUInt8(unknown3);
  writer.writeUInt32(wireLevelHash);
  writer.writeUInt8(mergeState);
  writer.writeUInt16(unknown5);
  writer.writeUInt16(unknown6);
  writer.writeUInt16(data.length);
  writer.writeBytes(data);

  return writer.toBuffer();
}

export function readNetLevelData(reader, options = {}) {
  const maxDataBytes = Math.min(
    options.maxDataBytes ?? MAX_LEVEL_DATA_PAYLOAD_BYTES,
    MAX_LEVEL_DATA_PAYLOAD_BYTES
  );

  const unknown2 = reader.readUInt16();
  const unknown3 = reader.readUInt8();
  const levelHash = reader.readUInt32();
  const mergeState = readNetLevelMergeState(reader);
  const unknown5 = reader.readUInt16();
  const unknown6 = reader.readUInt16();
  const dataLength = reader.readUInt16();

  if (dataLength > maxDataBytes) {
    throw new ProtocolError('level data too large', { dataLength, max: maxDataBytes });
  }

  const levelData = dataLength > 0 ? reader.readBytes(dataLength) : Buffer.alloc(0);

  return {
    unknown2,
    unknown3,
    levelHash,
    unknown4: levelHash,
    mergeState,
    unknown5,
    unknown6,
    dataLength,
    levelData
  };
}

export function writeNetLevelData(writer, {
  unknown2 = 0,
  unknown3 = 0,
  levelHash,
  unknown4,
  mergeState = 0,
  unknown5 = 0,
  unknown6 = 0,
  levelData = Buffer.alloc(0)
}) {
  const data = Buffer.from(levelData);
  if (data.length > MAX_LEVEL_DATA_PAYLOAD_BYTES) {
    throw new ProtocolError('level data too large', {
      dataLength: data.length,
      max: MAX_LEVEL_DATA_PAYLOAD_BYTES
    });
  }

  writer.writeUInt16(unknown2);
  writer.writeUInt8(unknown3);
  writer.writeUInt32(levelHash ?? unknown4 ?? 0);
  writeNetLevelMergeState(writer, mergeState);
  writer.writeUInt16(unknown5);
  writer.writeUInt16(unknown6);
  writer.writeUInt16(data.length);
  writer.writeBytes(data);
}

export function readNetLevelMergeState(reader) {
  return reader.readUInt8();
}

export function writeNetLevelMergeState(writer, mergeState = 0) {
  writer.writeUInt8(mergeState);
}
