import { BinaryReader } from './binary/BinaryReader.js';
import { BinaryWriter } from './binary/BinaryWriter.js';
import { packetTypes } from './PacketRegistry.js';
import { ProtocolError } from '../utils/errors.js';

export class PacketCodec {
  decodeClient(buffer) {
    const reader = new BinaryReader(buffer);
    const token = reader.readUInt32();
    const id = reader.readUInt8();
    const sequence = reader.readUInt8();
    const packetType = packetTypes.get(id);

    if (!packetType?.decode) {
      throw new ProtocolError('unknown client packet', { id });
    }

    const payload = packetType.decode(reader, { fromServer: false });
    return {
      id,
      name: packetType.name,
      token,
      sequence,
      payload
    };
  }

  encodeServer(packet, session) {
    const packetType = packetTypes.get(packet.id);
    if (!packetType?.encode) {
      throw new ProtocolError('unknown server packet', { id: packet.id });
    }

    const payloadWriter = new BinaryWriter();
    packetType.encode(payloadWriter, packet.payload ?? {}, { fromServer: true });

    const payload = payloadWriter.toBuffer();

    const writer = new BinaryWriter(3 + payload.length);
    writer.writeUInt8(packet.id);
    writer.writeUInt16(payload.length);
    writer.writeBytes(payload);
    return writer.toBuffer();
  }
}
