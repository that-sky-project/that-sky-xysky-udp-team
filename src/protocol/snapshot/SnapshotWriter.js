import { fnv1a8 } from './fnv1a.js';
import { Snapshot } from './Snapshot.js';
import { SNAPSHOT_MAX_DATA_BYTES } from './constants.js';


const MAX_WINDOW = 16;
const MAX_MISSED_ACKS = 3;

export class SnapshotWriter {
  constructor({ keyframeInterval = 10, maxDataLength = SNAPSHOT_MAX_DATA_BYTES } = {}) {
    this.keyframeInterval = keyframeInterval;
    this.maxDataLength = maxDataLength;
    this.window = [];
    this.nextSaveSeq = 1;
    this.deltaCount = 0;
    this.resync = false;
    this.pendingAckSeq = null;
    this.missedAcks = 0;
    this.forceNextKeyframe = false;
    this.lastSavedSeq = null;
    this.onStatus = undefined;
  }

  onSync(callback) {
    this.onStatus = typeof callback === 'function' ? callback : undefined;
  }

  /** Generate the next frame, truncating input to the configured ColorSky limit. */
  write(data) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const newLen = Math.min(buf.length, this.maxDataLength);

    if (this.resync) {
      return this._emitRaw(buf, newLen);
    }
    if (this.window.length === 0) {
      return this._emitRaw(buf, newLen);
    }
    if (this.forceNextKeyframe) {
      this.forceNextKeyframe = false;
      return this._emitKeyframe(buf, newLen);
    }
    if (this.deltaCount >= this.keyframeInterval) {
      return this._emitKeyframe(buf, newLen);
    }
    return this._emitDelta(buf, newLen);
  }

  /** Acknowledge a previously emitted save_seq. */
  ack(seq) {
    if (this.pendingAckSeq !== seq) {
      return false;
    }
    this.pendingAckSeq = null;
    this.missedAcks = 0;
    this.window = this.window.filter(e => ((e.sequence - seq) & 0xff) <= 127);
    if (this.resync) {
      this.resync = false;
      this.forceNextKeyframe = true;
      this.onStatus?.('resyncsuccess');
    }
    return true;
  }

  /** Reset and force the next write to emit a raw frame. */
  forceKeyframe() {
    this.window = [];
    this.deltaCount = 0;
    this.resync = false;
    this.pendingAckSeq = null;
    this.missedAcks = 0;
    this.forceNextKeyframe = false;
    this.lastSavedSeq = null;
    this.onStatus?.('forcedkeyframe');
  }


  _allocateSaveSeq() {
    const seq = this.nextSaveSeq;
    this.nextSaveSeq = ((this.nextSaveSeq + 1) & 0xff) || 1;
    return seq;
  }

  _baseSnapshot() {
    if (this.lastSavedSeq !== null) {
      const e = this.window.find(e => e.sequence === this.lastSavedSeq);
      if (e) return e;
    }
    return this.window[0] ?? null;
  }

  _addToWindow(sequence, data) {
    this.window = this.window.filter(e => e.sequence !== sequence);
    this.window.unshift(new Snapshot(sequence, data));
    if (this.window.length > MAX_WINDOW) {
      this.window.length = MAX_WINDOW;
    }
    this.lastSavedSeq = sequence;
  }

  _markAckRequired(seq) {
    if (this.pendingAckSeq !== null) {
      this.missedAcks = Math.min(this.missedAcks + 1, 255);
      if (this.missedAcks >= MAX_MISSED_ACKS) {
        this.resync = true;
        this.onStatus?.('resyncstart');
      }
    }
    this.pendingAckSeq = seq;
  }

  /** raw frame: [save_seq, 0, chk, ...state] */
  _emitRaw(buf, newLen) {
    const sv = this._allocateSaveSeq();
    this.deltaCount = 0;
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
    this.deltaCount = 0;
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
    this.deltaCount += 1;
    const chk = fnv1a8(rle);
    const out = Buffer.allocUnsafe(3 + rle.length);
    out[0] = 0;
    out[1] = base.sequence;
    out[2] = chk;
    rle.copy(out, 3);
    return out;
  }
}


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
