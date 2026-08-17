import { PlayerSnapshotState } from './PlayerSnapshotState.js';

export class Player {
  constructor({ id, uuid, session, levelId, netVersion }) {
    this.id = id;
    this.uuid = uuid;
    this.session = session;
    this.levelId = levelId ?? 0;
    this.netVersion = netVersion;
    this.lvSeq = 0;
    this.levelChangeCount = 1;
    this.joinedAt = Date.now();
    this.lastSeenAt = Date.now();
    this.playerDelta = new PlayerSnapshotState();
    this.levelDelta = new PlayerSnapshotState();
    this.lastLevelDataLevelId = undefined;
    this.lastLevelDataRevision = undefined;
  }

  touch(now = Date.now()) {
    this.lastSeenAt = now;
  }

  changeLevel(levelId, netVersion = this.netVersion) {
    const oldLevelId = this.levelId;
    this.levelId = levelId;
    this.lvSeq = (this.lvSeq + 1) & 0xff;
    this.levelChangeCount = this.lvSeq;
    this.netVersion = netVersion;
    if (oldLevelId !== levelId) {
      this.levelDelta.reset();
      this.lastLevelDataLevelId = undefined;
      this.lastLevelDataRevision = undefined;
    }
    this.touch();
  }

  hasLevelDataRevision(levelId, revision) {
    return this.lastLevelDataLevelId === levelId && this.lastLevelDataRevision === revision;
  }

  markLevelDataRevision(levelId, revision) {
    if (revision === undefined) {
      return;
    }
    this.lastLevelDataLevelId = levelId;
    this.lastLevelDataRevision = revision;
  }

  clearLevelDataRevision() {
    this.lastLevelDataLevelId = undefined;
    this.lastLevelDataRevision = undefined;
  }

  toApi() {
    return {
      id: this.id,
      roomId: this.session.roomId,
      uuid: this.uuid.toString(),
      peerId: this.session.peerId.toString(),
      levelId: this.levelId,
      levelChangeCount: this.levelChangeCount,
      netVersion: this.netVersion?.values,
      levelHash: this.netVersion?.levelHash,
      joinedAt: this.joinedAt,
      lastSeenAt: this.lastSeenAt,
      lastRpc: this.lastRpc,
      lastOpaqueGameMsg: this.lastOpaqueGameMsg,
      lastLevelDataRevision: this.lastLevelDataRevision,
      snapshots: {
        player: this.playerDelta.toApi(),
        level: this.levelDelta.toApi()
      }
    };
  }
}
