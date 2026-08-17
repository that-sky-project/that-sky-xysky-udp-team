export class LevelStateStore {
  constructor({ roomId, logger }) {
    this.roomId = roomId;
    this.logger = logger;
    this.authorities = new Map();
    this.levelData = new Map();
    this._authorityElectedHandlers = [];
  }

  onAuthorityElected(callback) {
    this._authorityElectedHandlers.push(callback);
  }

  getAuthority(levelId) {
    return this.authorities.get(levelId);
  }

  setAuthority(levelId, player, context = {}) {
    const previous = this.authorities.get(levelId);
    this.authorities.set(levelId, player);

    if (previous !== player) {
      this.updateAuthorityMetadata(levelId, player);
      this.logger?.info({
        roomId: this.roomId,
        levelId,
        authorityPlayerId: player.id,
        previousAuthorityPlayerId: context.previousAuthorityPlayerId ?? previous?.id,
        peerId: player.session?.peerId?.toString(),
        uuid: player.uuid?.toString(),
        reason: context.reason
      }, 'level authority elected');

      if (context.notify !== false) {
        for (const handler of this._authorityElectedHandlers) {
          handler(levelId, player, context.targetPlayer);
        }
      }
    }
  }

  revokeAuthority(levelId, context = {}) {
    const previous = this.authorities.get(levelId);
    const revoked = this.authorities.delete(levelId);

    if (revoked) {
      this.updateAuthorityMetadata(levelId, undefined);
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
    const authority = this.getAuthority(levelId);
    const previous = this.levelData.get(levelId);
    const payload = Buffer.from(data.payload ?? Buffer.alloc(0));
    const hasInitialDataRaw = data.hasInitialDataRaw ?? (
      (data.hasInitialData ?? payload.length > 0) ? 1 : 0
    );
    const levelHash = data.levelHash ?? data.unknown4 ?? 0;
    const next = {
      electedPlayer: previous?.electedPlayer ?? authority?.id ?? data.authorityPlayerId ?? 0,
      levelId: data.levelId ?? levelId,
      hasInitialData: hasInitialDataRaw !== 0,
      hasInitialDataRaw,
      mergeState: data.mergeState ?? 0,
      unknown1: data.unknown1 ?? 0,
      unknown2: data.unknown2 ?? 0,
      unknown3: data.unknown3 ?? 0,
      levelHash,
      unknown4: levelHash,
      unknown5: data.unknown5 ?? 0,
      unknown6: data.unknown6 ?? 0,
      dataLength: payload.length,
      payload,
      authorityPlayerId: authority?.id ?? data.authorityPlayerId
    };

    if (previous && levelDataEquals(previous, next)) {
      return previous;
    }

    const stored = {
      ...next,
      revision: (previous?.revision ?? 0) + 1,
      updatedAt: data.updatedAt ?? Date.now()
    };
    this.levelData.set(levelId, stored);
    return stored;
  }

  loadLevelData(levelId) {
    return this.levelData.get(levelId);
  }

  updateAuthorityMetadata(levelId, authority) {
    const previous = this.levelData.get(levelId);
    if (!previous) {
      return undefined;
    }

    const electedPlayer = authority?.id ?? 0;
    if (
      previous.electedPlayer === electedPlayer &&
      previous.authorityPlayerId === authority?.id
    ) {
      return previous;
    }

    const stored = {
      ...previous,
      electedPlayer,
      authorityPlayerId: authority?.id,
      revision: (previous.revision ?? 0) + 1,
      updatedAt: Date.now()
    };
    this.levelData.set(levelId, stored);
    return stored;
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
      levelDataRevision: this.levelData.get(levelId)?.revision,
      levelHash: this.levelData.get(levelId)?.levelHash ?? 0,
      mergeState: this.levelData.get(levelId)?.mergeState ?? 0,
      updatedAt: this.levelData.get(levelId)?.updatedAt
    }));
  }
}

function levelDataEquals(left, right) {
  return (
    left.electedPlayer === right.electedPlayer &&
    left.levelId === right.levelId &&
    left.hasInitialData === right.hasInitialData &&
    left.hasInitialDataRaw === right.hasInitialDataRaw &&
    left.mergeState === right.mergeState &&
    left.unknown1 === right.unknown1 &&
    left.unknown2 === right.unknown2 &&
    left.unknown3 === right.unknown3 &&
    left.levelHash === right.levelHash &&
    left.unknown4 === right.unknown4 &&
    left.unknown5 === right.unknown5 &&
    left.unknown6 === right.unknown6 &&
    left.dataLength === right.dataLength &&
    left.authorityPlayerId === right.authorityPlayerId &&
    left.payload.equals(right.payload)
  );
}
