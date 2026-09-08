import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';

export class QwdClient {
  constructor({ url, room, logger, onCommand, onRoomIdConflict, onConnected }) { this.url=url; this.room=room; this.logger=logger; this.onCommand=onCommand; this.onRoomIdConflict=onRoomIdConflict; this.onConnected=onConnected; this.socket=null; this.queue=[]; this.connected=false; this.reconnectTimer=null; this.stopped=true; }
  start() { if (!this.url) return; this.stopped=false; this.connect(); }
  stop() { this.stopped=true; if (this.reconnectTimer) clearTimeout(this.reconnectTimer); this.reconnectTimer=null; this.socket?.close(); this.socket=null; this.connected=false; }
  publish(event,data) { const message=JSON.stringify({v:1,event,data}); if (!this.connected||!this.socket) { if(this.queue.length<256)this.queue.push(message); return; } this.socket.send(message); }
  publishTelemetry(players,seq=0) { this.publish('room.telemetry',{roomId:this.room.id,seq,players,timestamp:Date.now()}); }
  connect() {
    if (this.stopped) return;
    try {
      const endpoint = new URL(this.url);
      // qwd accepts node connections on the root WebSocket endpoint.
      endpoint.pathname = '/';
      endpoint.searchParams.set('v', '1');
      const socket = new WebSocket(endpoint);
      this.socket = socket;
      socket.on('open', () => {
        this.connected = true;
        this.logger.info?.({ endpoint: endpoint.toString(), roomId: this.room.id }, 'qwd websocket connected');
        // Events queued while qwd was unavailable are stale snapshots. Drop
        // them and replay the node's current authoritative state instead.
        this.queue.length = 0;
        this.publish('node.ready', { capacity: this.room.maxPeers, load: 0, timestamp: Date.now() });
        this.publish('room.created', { roomId: this.room.id, udpHost: this.room.publicHost, port: this.room.publicPort, capacity: 8, players: 0, version: 1 });
        this.onConnected?.();
      });
      socket.on('message', (data) => {
        try {
          const command = JSON.parse(data.toString());
          if (!command?.cmd) return;
          if (command.cmd === 'room.id_conflict') {
            const previousRoomId = this.room.id;
            this.room.id = randomUUID();
            this.logger.warn?.({ previousRoomId, roomId: this.room.id }, 'qwd room id conflict; regenerated room id');
            this.onRoomIdConflict?.(this.room.id, previousRoomId);
            if (this.connected) this.publish('room.created', { roomId: this.room.id, udpHost: this.room.publicHost, port: this.room.publicPort, capacity: 8, players: this.room.players ?? 0, version: 1 });
            return;
          }
          Promise.resolve(this.onCommand?.(command))
            .then(result => this.sendAck(command.id, result?.code ?? 0, result?.data))
            .catch(error => this.sendAck(command.id, 5000, { message: error.message }));
        } catch (error) {
          this.logger.warn?.({ err: error }, 'invalid qwd command');
        }
      });
      socket.on('close', (code, reason) => {
        this.connected = false;
        this.socket = null;
        this.logger.warn?.({ code, reason: reason.toString(), endpoint: endpoint.toString() }, 'qwd websocket closed');
        if (!this.stopped) this.scheduleReconnect();
      });
      socket.on('error', error => this.logger.warn?.({ err: error, endpoint: endpoint.toString() }, 'qwd websocket error'));
    } catch (error) {
      this.logger.warn?.({ err: error, endpoint: this.url }, 'qwd websocket connection failed');
      this.scheduleReconnect();
    }
  }
  scheduleReconnect() { if (this.stopped || this.reconnectTimer) return; this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null; this.connect();},2000); this.reconnectTimer.unref?.(); }
  sendAck(id, code, data) { if (!this.connected || !this.socket || !id) return; this.socket.send(JSON.stringify({v:1,id,code,data})); }
}
