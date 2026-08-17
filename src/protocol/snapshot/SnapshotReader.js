import { fnv1a8 } from './fnv1a.js';
import { Snapshot } from './Snapshot.js';
import { SNAPSHOT_MAX_DATA_BYTES } from './constants.js';


const MAX_WINDOW = 16;

export class SnapshotReader {
  constructor({ baseSize = SNAPSHOT_MAX_DATA_BYTES } = {}) {
    this.baseSize = baseSize;
    this.window = [];
    this.waitingForKeyframe = false;
    this.onStatus = undefined;
  }

  onSync(callback) {
    this.onStatus = typeof callback === 'function' ? callback : undefined;
  }

  /** Reset — force waiting for next raw/keyframe before accepting deltas. */
  forceWaitForKeyframe() {
    this.window = [];
    this.waitingForKeyframe = true;
    this.onStatus?.('resyncstart');
  }

  /** Most recently decoded save_seq (0 if none). */
  latestSequence() {
    for (let i = this.window.length - 1; i >= 0; i--) {
      if (this.window[i].sequence !== 0) return this.window[i].sequence;
    }
    return 0;
  }

  /**
   * Apply an incoming frame (Buffer: 3-byte header + payload).
   * Returns { ok: true, data: Buffer, ack: number, raw: bool } on success,
   * or { ok: false, reason: string } on failure.
   */
  read(frameOrObj) {
    let saveSeq, baseSeq, checksum, payload;

    if (Buffer.isBuffer(frameOrObj)) {
      if (frameOrObj.length < 3) {
        return { ok: false, reason: 'too_short' };
      }
      saveSeq  = frameOrObj[0];
      baseSeq  = frameOrObj[1];
      checksum = frameOrObj[2];
      payload  = frameOrObj.subarray(3);
    } else {
      saveSeq  = frameOrObj.sequence ?? 0;
      baseSeq  = frameOrObj.base ?? 0;
      checksum = frameOrObj.checksum;
      payload  = frameOrObj.payload;
      if (!Buffer.isBuffer(payload)) {
        payload = Buffer.from(payload ?? []);
      }
    }

    if (saveSeq === 0 && baseSeq === 0) {
      return { ok: false, reason: 'invalid_frame' };
    }

    if (fnv1a8(payload) !== checksum) {
      this.onStatus?.('hasherror');
      return { ok: false, reason: 'checksum' };
    }

    if (baseSeq === 0 && saveSeq !== 0) {
      if (payload.length > this.baseSize) {
        return { ok: false, reason: 'snapshot_oversize' };
      }
      const data = Buffer.from(payload);
      this.window = [];
      this._addToWindow(saveSeq, data);
      this.waitingForKeyframe = false;
      this.onStatus?.('resyncsuccess');
      return { ok: true, data, ack: saveSeq, raw: true };
    }

    if (this.waitingForKeyframe && saveSeq === 0) {
      return { ok: false, reason: 'resyncing' };
    }

    const baseEntry = this.window.find(e => e.sequence === baseSeq);
    if (!baseEntry && !this.waitingForKeyframe) {
      this.onStatus?.('nokeyframe');
    }

    const decoded = _rleDecode(payload);
    if (decoded === null) {
      return { ok: false, reason: 'rle_truncated' };
    }
    if (decoded.length > this.baseSize) {
      return { ok: false, reason: 'snapshot_oversize' };
    }

    const base = baseEntry ? baseEntry.data : Buffer.alloc(0);
    const outLen = decoded.length;
    const newState = Buffer.alloc(outLen);
    const copyLen = Math.min(base.length, outLen);
    base.copy(newState, 0, 0, copyLen);
    for (let i = 0; i < copyLen; i++) newState[i] = base[i] ^ decoded[i];
    if (outLen > base.length) decoded.copy(newState, base.length, base.length);

    if (saveSeq !== 0) {
      this._addToWindow(saveSeq, newState);
      this.waitingForKeyframe = false;
    }

    return { ok: true, data: newState, ack: saveSeq !== 0 ? saveSeq : 0, raw: false };
  }

  _addToWindow(sequence, data) {
    this.window = this.window.filter(e => e.sequence !== sequence);
    this.window.push({ sequence, data: Buffer.from(data) });
    while (this.window.length > MAX_WINDOW) {
      this.window.shift();
    }
  }
}

function _rleDecode(data) {
  const out = [];
  let i = 0;
  while (i < data.length) {
    if (data[i] === 0x00) {
      if (i + 1 >= data.length) return null;
      const count = data[i + 1];
      for (let k = 0; k < count; k++) out.push(0);
      i += 2;
    } else {
      out.push(data[i++]);
    }
  }
  return Buffer.from(out);
}
