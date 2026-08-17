import { Player } from './Player.js';
import { StateError } from '../utils/errors.js';

export class PlayerStore {
  constructor() {
    this.playersById = new Map();
    this.playersBySession = new Map();
    this.playersByUuid = new Map();
    this.netIdCount = 0;
  }

  get size() {
    return this.playersById.size;
  }

  add({ session, uuid, levelId, netVersion }) {
    if (this.playersBySession.has(session.id)) {
      throw new StateError('session already has a player', { sessionId: session.id });
    }

    const id = this.allocateId();
    const player = new Player({ id, uuid, session, levelId, netVersion });

    this.playersById.set(id, player);
    this.playersBySession.set(session.id, player);
    this.playersByUuid.set(uuid.toString(), player);

    return player;
  }

  allocateId() {
    if (this.netIdCount === 0) {
      this.netIdCount = 1;
    }

    const id = this.netIdCount;
    this.netIdCount = (this.netIdCount + 1) & 0xff;
    return id;
  }

  getBySession(session) {
    return this.playersBySession.get(session.id);
  }

  getById(id) {
    return this.playersById.get(id);
  }

  removeBySession(session) {
    const player = this.getBySession(session);
    if (!player) {
      return undefined;
    }

    this.playersById.delete(player.id);
    this.playersBySession.delete(session.id);
    this.playersByUuid.delete(player.uuid.toString());
    return player;
  }

  list() {
    return Array.from(this.playersById.values());
  }

  listInLevel(levelId) {
    return this.list().filter(player => player.levelId === levelId);
  }
}
