import { fnv1a8 } from './fnv1a.js';
import { Snapshot } from './Snapshot.js';
import { SnapshotReader } from './SnapshotReader.js';
import { SNAPSHOT_MAX_DATA_BYTES } from './constants.js';

export class SnapshotWriter {
  constructor({ keyframeInterval = 10, maxDataLength = SNAPSHOT_MAX_DATA_BYTES } = {}) {
    this.keyframeInterval = keyframeInterval;
    this.maxDataLength = maxDataLength;
    this.history = [];
    this.nextSequence = 1;
    this.frameCount = 0;
    this.resyncing = true;
    this.onStatus = undefined;
  }

  onSync(callback) {
    this.onStatus = typeof callback === 'function' ? callback : undefined;
  }

  write(data) {
    const buffer = Buffer.from(data);
    if (buffer.length > this.maxDataLength) {
      return undefined;
    }

    if (this.history.length >= SnapshotReader.maxWindow) {
      if (!this.resyncing) {
        this.resyncing = true;
        this.frameCount = 0;
        this.onStatus?.('resyncstart');
      } else {
        this.history = this.history.slice(Math.floor(SnapshotReader.maxWindow / 2));
        this.onStatus?.('resyncfailed');
      }
    }

    const shouldKeyframe = this.resyncing
      ? this.frameCount % Math.max(1, Math.floor(this.keyframeInterval / 2)) === 0
      : this.frameCount % this.keyframeInterval === 0;

    const sequence = shouldKeyframe ? this.allocateSequence() : 0;
    const current = new Snapshot(sequence, buffer);
    const base = this.resyncing ? undefined : this.history[0];
    const payload = base ? current.createDelta(base) : current.data;

    if (sequence) {
      this.history.push(current);
      while (this.history.length > SnapshotReader.maxWindow) {
        this.history.shift();
      }
    }

    this.frameCount += 1;

    return {
      sequence,
      base: base?.sequence ?? 0,
      checksum: fnv1a8(payload),
      payload
    };
  }

  ack(sequence) {
    const index = this.history.findIndex(snapshot => snapshot.sequence === sequence);
    if (index === -1) {
      return;
    }

    this.history = this.history.slice(index);
    if (this.resyncing) {
      this.resyncing = false;
      this.onStatus?.('resyncsuccess');
    }
  }

  allocateSequence() {
    this.nextSequence = (this.nextSequence + 1) & 0x7f;
    if (this.nextSequence === 0) {
      this.nextSequence = 1;
    }
    return this.nextSequence;
  }
}
