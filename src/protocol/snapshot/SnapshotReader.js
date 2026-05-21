import { fnv1a8 } from './fnv1a.js';
import { Snapshot } from './Snapshot.js';
import { SNAPSHOT_MAX_DATA_BYTES } from './constants.js';

export class SnapshotReader {
  static maxWindow = 16;

  constructor({ baseSize = SNAPSHOT_MAX_DATA_BYTES } = {}) {
    this.baseSize = baseSize;
    this.history = [];
    this.resyncing = false;
    this.onStatus = undefined;
    this.reset();
  }

  reset() {
    this.history = [new Snapshot(1, Buffer.alloc(this.baseSize))];
    this.resyncing = false;
  }

  latestSequence() {
    return this.history.at(-1)?.sequence ?? 0;
  }

  onSync(callback) {
    this.onStatus = typeof callback === 'function' ? callback : undefined;
  }

  read({ sequence, base, checksum, payload }) {
    if (fnv1a8(payload) !== checksum) {
      this.onStatus?.('hasherror');
      return { ok: false, reason: 'checksum' };
    }

    if (sequence !== 0 && base === 0 && !this.resyncing) {
      this.reset();
      this.resyncing = true;
      this.onStatus?.('resyncstart');
    }

    if (base === 0) {
      const snapshot = new Snapshot(sequence, payload);
      this.save(snapshot);
      return { ok: true, data: snapshot.data, ack: sequence, raw: true };
    }

    const baseSnapshot = this.find(base);
    if (!baseSnapshot) {
      if (!this.resyncing) {
        this.onStatus?.('nokeyframe');
      }
      return { ok: false, reason: this.resyncing ? 'resyncing' : 'nokeyframe' };
    }

    const snapshot = Snapshot.applyDelta(baseSnapshot.clone(), sequence, payload);
    if (snapshot.data.length > this.baseSize) {
      return { ok: false, reason: 'snapshot_oversize' };
    }
    this.save(snapshot);
    if (this.resyncing) {
      this.resyncing = false;
      this.onStatus?.('resyncsuccess');
    }

    return {
      ok: true,
      data: snapshot.data,
      ack: sequence,
      raw: false
    };
  }

  find(sequence) {
    return this.history.find(snapshot => snapshot.sequence === sequence);
  }

  save(snapshot) {
    if (!snapshot.sequence) {
      return;
    }

    this.history.push(snapshot);
    while (this.history.length > SnapshotReader.maxWindow) {
      this.history.shift();
    }
  }
}
