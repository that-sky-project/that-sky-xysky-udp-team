import { NetAddress } from '../protocol/types/NetAddress.js';

export class RoomDirectory {
  constructor() {
    this.rooms = new Map();
  }

  register({ id, host, port, capacity = 8, players = 0, levels = [] }) {
    const room = {
      id: String(id),
      address: new NetAddress({ host, port: Number(port) }),
      capacity: Number(capacity),
      players: Number(players),
      levels: new Set(levels.map(Number)),
      updatedAt: Date.now()
    };

    this.rooms.set(room.id, room);
    return room;
  }

  unregister(id) {
    return this.rooms.delete(String(id));
  }

  getById(id) {
    return this.rooms.get(String(id));
  }

  findTarget({ levelId, excludeRoomId } = {}) {
    const rooms = Array.from(this.rooms.values())
      .filter(room => room.id !== String(excludeRoomId ?? ''))
      .filter(room => room.players < room.capacity)
      .sort((left, right) => {
        const leftHasLevel = levelId !== undefined && left.levels.has(Number(levelId));
        const rightHasLevel = levelId !== undefined && right.levels.has(Number(levelId));
        if (leftHasLevel !== rightHasLevel) {
          return leftHasLevel ? -1 : 1;
        }
        return left.players - right.players;
      });

    return rooms[0];
  }

  list() {
    return Array.from(this.rooms.values()).map(room => ({
      id: room.id,
      address: room.address.toApi(),
      capacity: room.capacity,
      players: room.players,
      levels: Array.from(room.levels),
      updatedAt: room.updatedAt
    }));
  }
}
