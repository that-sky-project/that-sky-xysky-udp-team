import { SnapshotReader } from '../protocol/snapshot/SnapshotReader.js';
import { SnapshotWriter } from '../protocol/snapshot/SnapshotWriter.js';

export class PlayerSnapshotState {
  constructor() {
    this.reader = new SnapshotReader();
    this.writer = new SnapshotWriter();
    this.stats = {
      lastReadAt: undefined,
      lastReadSequence: undefined,
      lastReadPayloadBytes: 0,
      lastReadDataBytes: 0,
      lastReadError: undefined,
      lastReadStatus: undefined,
      lastWriteAt: undefined,
      lastWriteSequence: undefined,
      lastWritePayloadBytes: 0,
      lastWriteDataBytes: 0,
      lastWriteStatus: undefined,
      droppedWrites: 0
    };
    this.reader.onSync(status => {
      this.stats.lastReadStatus = status;
    });
    this.writer.onSync(status => {
      this.stats.lastWriteStatus = status;
    });
  }

  read(snapshot, payload) {
    const result = this.reader.read({ ...snapshot, payload });
    this.stats.lastReadAt = Date.now();
    this.stats.lastReadSequence = snapshot?.sequence;
    this.stats.lastReadPayloadBytes = payload?.length ?? 0;
    this.stats.lastReadDataBytes = result.ok ? result.data.length : 0;
    this.stats.lastReadError = result.ok ? undefined : result.reason;
    return result;
  }

  write(data) {
    const frame = this.writer.write(data);
    if (!frame) {
      this.stats.droppedWrites += 1;
      return undefined;
    }

    this.stats.lastWriteAt = Date.now();
    this.stats.lastWriteSequence = frame.sequence;
    this.stats.lastWritePayloadBytes = frame.payload.length;
    this.stats.lastWriteDataBytes = data.length;
    return frame;
  }

  ack(sequence) {
    this.writer.ack(sequence);
  }

  latestSequence() {
    return this.reader.latestSequence();
  }

  reset() {
    this.reader = new SnapshotReader();
    this.writer = new SnapshotWriter();
    this.stats.lastReadAt = undefined;
    this.stats.lastReadSequence = undefined;
    this.stats.lastReadPayloadBytes = 0;
    this.stats.lastReadDataBytes = 0;
    this.stats.lastReadError = undefined;
    this.stats.lastReadStatus = 'reset';
    this.stats.lastWriteAt = undefined;
    this.stats.lastWriteSequence = undefined;
    this.stats.lastWritePayloadBytes = 0;
    this.stats.lastWriteDataBytes = 0;
    this.stats.lastWriteStatus = 'reset';
    this.stats.droppedWrites = 0;
    this.reader.onSync(status => {
      this.stats.lastReadStatus = status;
    });
    this.writer.onSync(status => {
      this.stats.lastWriteStatus = status;
    });
  }

  toApi() {
    return { ...this.stats };
  }
}
