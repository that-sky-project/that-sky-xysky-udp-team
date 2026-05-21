export class LevelStateStore {
  constructor({ roomId, logger }) {
    this.roomId = roomId;
    this.logger = logger;
    this.authorities = new Map();
    this.levelData = new Map();
  }

  getAuthority(levelId) {
    return this.authorities.get(levelId);
  }

  setAuthority(levelId, player, context = {}) {
    const previous = this.authorities.get(levelId);
    this.authorities.set(levelId, player);

    if (previous !== player) {
      this.logger?.info({
        roomId: this.roomId,
        levelId,
        authorityPlayerId: player.id,
        previousAuthorityPlayerId: context.previousAuthorityPlayerId ?? previous?.id,
        peerId: player.session?.peerId?.toString(),
        uuid: player.uuid?.toString(),
        reason: context.reason
      }, 'level authority elected');
    }
  }

  revokeAuthority(levelId, context = {}) {
    const previous = this.authorities.get(levelId);
    const revoked = this.authorities.delete(levelId);

    if (revoked) {
      this.logger?.info({
        roomId: this.roomId,
        levelId,
        authorityPlayerId: previous?.id,
        peerId: previous?.session?.peerId?.toString(),
        uuid: previous?.uuid?.toString(),
        reason: context.reason
      }, 'level authority revoked');
    }
  }

  isAuthority(player, levelId = player.levelId) {
    return this.getAuthority(levelId) === player;
  }

  saveLevelData(levelId, data) {
    this.levelData.set(levelId, {
      mergeState: data.mergeState ?? 0,
      unknown1: data.unknown1 ?? 0,
      unknown2: data.unknown2 ?? 0,
      unknown3: data.unknown3 ?? 0,
      levelHash: data.levelHash ?? data.unknown4 ?? 0,
      unknown4: data.unknown4 ?? 0,
      unknown5: data.unknown5 ?? 0,
      unknown6: data.unknown6 ?? 0,
      unknown7: data.unknown7 ?? 0,
      dataLength: data.dataLength ?? (data.payload?.length ?? 0),
      payload: Buffer.from(data.payload ?? Buffer.alloc(0)),
      updatedAt: data.updatedAt ?? Date.now(),
      authorityPlayerId: data.authorityPlayerId
    });
  }

  loadLevelData(levelId) {
    return this.levelData.get(levelId);
  }

  reset(levelId, context = {}) {
    if (levelId === undefined) {
      this.authorities.clear();
      this.levelData.clear();
      return;
    }

    this.revokeAuthority(levelId, context);
    this.levelData.delete(levelId);
  }

  toApi() {
    return Array.from(new Set([
      ...this.authorities.keys(),
      ...this.levelData.keys()
    ])).map(levelId => ({
      roomId: this.roomId,
      levelId,
      authorityPlayerId: this.authorities.get(levelId)?.id,
      hasLevelData: this.levelData.has(levelId),
      levelDataBytes: this.levelData.get(levelId)?.payload?.length ?? 0,
      levelHash: this.levelData.get(levelId)?.levelHash ?? 0,
      mergeState: this.levelData.get(levelId)?.mergeState ?? 0,
      updatedAt: this.levelData.get(levelId)?.updatedAt
    }));
  }
}
