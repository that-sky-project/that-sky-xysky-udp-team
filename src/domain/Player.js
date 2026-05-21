import { PlayerSnapshotState } from './PlayerSnapshotState.js';

export class Player {
  constructor({ id, uuid, session, levelId, netVersion }) {
    this.id = id;
    this.uuid = uuid;
    this.session = session;
    this.levelId = levelId;
    this.netVersion = netVersion;
    this.levelChangeCount = 1;
    this.joinedAt = Date.now();
    this.lastSeenAt = Date.now();
    this.playerDelta = new PlayerSnapshotState();
    this.levelDelta = new PlayerSnapshotState();
  }

  touch(now = Date.now()) {
    this.lastSeenAt = now;
  }

  changeLevel(levelId, levelChangeCount, netVersion = this.netVersion) {
    const oldLevelId = this.levelId;
    this.levelId = levelId;
    this.levelChangeCount = levelChangeCount;
    this.netVersion = netVersion;
    if (oldLevelId !== levelId) {
      this.levelDelta.reset();
    }
    this.touch();
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
      snapshots: {
        player: this.playerDelta.toApi(),
        level: this.levelDelta.toApi()
      }
    };
  }
}
