import { fnv1a8 } from './fnv1a.js';
import { Snapshot } from './Snapshot.js';
import { SNAPSHOT_MAX_DATA_BYTES } from './constants.js';

// Wire frame layout (matches the latest Sky SnapshotWriter):
//   [save_seq: u8][base_seq: u8][checksum: u8][payload...]
//
// Frame types:
//   raw:      save_seq != 0, base_seq == 0  — full raw state, no XOR
//   keyframe: save_seq != 0, base_seq != 0  — XOR diff against base, stored in window
//   delta:    save_seq == 0, base_seq != 0  — XOR diff, NOT stored in window

const MAX_WINDOW = 16;

export class SnapshotWriter {
  constructor({ keyframeInterval = 10, maxDataLength = SNAPSHOT_MAX_DATA_BYTES } = {}) {
    this.keyframeInterval = keyframeInterval;
    this.maxDataLength = maxDataLength;
    // Native Initialize seeds an empty sequence-1 base. Entries remain
    // newest-first here, so the oldest unacknowledged base is at the end.
    this.window = [new Snapshot(1, Buffer.alloc(0))];
    this.nextSaveSeq = 2;
    this.writeCount = 0;
    this.resync = false;
    this.pendingAckSeq = null;
    this.forceNextKeyframe = false;
    this.onStatus = undefined;
  }

  onSync(callback) {
    this.onStatus = typeof callback === 'function' ? callback : undefined;
  }

  /** Generate the next frame, matching the reference writer's configured limit. */
  write(data) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const newLen = Math.min(buf.length, this.maxDataLength);

    if (this.window.length >= MAX_WINDOW) {
      if (this.resync) {
        this.onStatus?.('resyncfailed');
        this.window = this.window.slice(0, MAX_WINDOW / 2);
      } else {
        this.resync = true;
        this.window = [];
        this.writeCount = 0;
        this.nextSaveSeq = 1;
        this.pendingAckSeq = null;
        this.onStatus?.('resyncstart');
      }
    }

    if (this.forceNextKeyframe) {
      this.forceNextKeyframe = false;
      const frame = this.window.length === 0
        ? this._emitRaw(buf, newLen)
        : this._emitKeyframe(buf, newLen);
      this.writeCount += 1;
      return frame;
    }

    const period = this.resync
      ? Math.max(1, Math.floor(this.keyframeInterval / 2))
      : Math.max(1, this.keyframeInterval);
    const saveFrame = this.window.length === 0 || this.writeCount % period === 0;
    const frame = saveFrame
      ? (this.window.length === 0 ? this._emitRaw(buf, newLen) : this._emitKeyframe(buf, newLen))
      : this._emitDelta(buf, newLen);
    this.writeCount += 1;
    return frame;
  }

  /** Acknowledge a previously emitted save_seq. */
  ack(seq) {
    if (!this.window.some(entry => entry.sequence === seq)) {
      return false;
    }
    this.pendingAckSeq = null;
    // Retain entries whose sequence >= seq (wrapping-safe for u8 range).
    this.window = this.window.filter(e => ((e.sequence - seq) & 0xff) <= 127);
    if (this.resync) {
      this.resync = false;
      this.onStatus?.('resyncsuccess');
    }
    return true;
  }

  /** Reset and force the next write to emit a raw frame. */
  forceKeyframe() {
    this.window = [new Snapshot(1, Buffer.alloc(0))];
    this.writeCount = 0;
    this.nextSaveSeq = 2;
    this.resync = false;
    this.pendingAckSeq = null;
    this.forceNextKeyframe = false;
    this.onStatus?.('forcedkeyframe');
  }

  // ── private ──────────────────────────────────────────────────────────

  _allocateSaveSeq() {
    const seq = this.nextSaveSeq;
    this.nextSaveSeq = ((this.nextSaveSeq + 1) & 0xff) || 1; // wraps 0xff → 1
    return seq;
  }

  _baseSnapshot() {
    return this.window[this.window.length - 1] ?? null;
  }

  _addToWindow(sequence, data) {
    this.window = this.window.filter(e => e.sequence !== sequence);
    this.window.unshift(new Snapshot(sequence, data)); // newest first
    if (this.window.length > MAX_WINDOW) {
      this.window.length = MAX_WINDOW;
    }
  }

  _markAckRequired(seq) {
    this.pendingAckSeq = seq;
  }

  /** raw frame: [save_seq, 0, chk, ...state] */
  _emitRaw(buf, newLen) {
    const sv = this._allocateSaveSeq();
    const chk = fnv1a8(buf.subarray(0, newLen));
    const out = Buffer.allocUnsafe(3 + newLen);
    out[0] = sv;
    out[1] = 0;
    out[2] = chk;
    buf.copy(out, 3, 0, newLen);
    this._addToWindow(sv, buf.subarray(0, newLen));
    this._markAckRequired(sv);
    return out;
  }

  /** keyframe: [save_seq, base_seq, chk, ...rle_xor] */
  _emitKeyframe(buf, newLen) {
    const base = this._baseSnapshot();
    if (!base) return this._emitRaw(buf, newLen);

    const xorBuf = _xorDiff(buf, base.data, newLen);
    const rle = _rleEncode(xorBuf);
    if (rle.length > xorBuf.length) {
      this.resync = true;
      this.window = [];
      return this._emitRaw(buf, newLen);
    }
    const sv = this._allocateSaveSeq();
    const chk = fnv1a8(rle);
    const out = Buffer.allocUnsafe(3 + rle.length);
    out[0] = sv;
    out[1] = base.sequence;
    out[2] = chk;
    rle.copy(out, 3);
    this._addToWindow(sv, buf.subarray(0, newLen));
    this._markAckRequired(sv);
    return out;
  }

  /** delta: [0, base_seq, chk, ...rle_xor] */
  _emitDelta(buf, newLen) {
    const base = this._baseSnapshot();
    if (!base) return this._emitRaw(buf, newLen);

    const xorBuf = _xorDiff(buf, base.data, newLen);
    const rle = _rleEncode(xorBuf);
    if (rle.length > xorBuf.length) {
      this.resync = true;
      this.window = [];
      return this._emitRaw(buf, newLen);
    }
    const chk = fnv1a8(rle);
    const out = Buffer.allocUnsafe(3 + rle.length);
    out[0] = 0; // save_seq = 0 for delta
    out[1] = base.sequence;
    out[2] = chk;
    rle.copy(out, 3);
    // delta frames are NOT added to window
    return out;
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

function _xorDiff(newBuf, baseBuf, newLen) {
  const bl = Math.min(baseBuf.length, newLen);
  const out = Buffer.allocUnsafe(newLen);
  for (let i = 0; i < bl; i++) out[i] = newBuf[i] ^ baseBuf[i];
  if (newLen > baseBuf.length) newBuf.copy(out, baseBuf.length, baseBuf.length, newLen);
  return out;
}

function _rleEncode(data) {
  const out = [];
  let i = 0;
  while (i < data.length) {
    if (data[i] === 0) {
      let c = 0;
      while (i < data.length && c < 255 && data[i] === 0) { c++; i++; }
      out.push(0x00, c);
    } else {
      out.push(data[i++]);
    }
  }
  return Buffer.from(out);
}
