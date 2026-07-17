// Socket.IO ラッパー
export class Net {
  constructor() {
    this.socket = io({ transports: ['websocket', 'polling'] });
    this.handlers = {};
    for (const ev of ['roomsChanged', 'roomUpdate', 'countdown', 'gameStart', 'snap', 'ev', 'timeSync', 'gameEnd', 'connect', 'disconnect']) {
      this.socket.on(ev, (data) => this.handlers[ev]?.(data));
    }
  }
  on(ev, fn) { this.handlers[ev] = fn; }
  hello(name, deviceId) { return this.ask('hello', { name, deviceId }); }
  listRooms() { return this.ask('listRooms'); }
  ranking() { return this.ask('ranking'); }
  createRoom(opts) { return this.ask('createRoom', opts); }
  startCpu(opts) { return this.ask('startCpu', opts); }
  joinRoom(data) { return this.ask('joinRoom', data); }
  leaveRoom() { this.socket.emit('leaveRoom'); }
  setOpts(opts) { this.socket.emit('setOpts', opts); }
  startGame() { this.socket.emit('startGame'); }
  sendState(s) { this.socket.volatile.emit('state', s); }
  shoot(p, d) { this.socket.emit('shoot', { p, d }); }
  touchPlayer(targetId) { this.socket.emit('touchPlayer', { targetId }); }
  ask(ev, data) {
    return new Promise(res => {
      if (data === undefined) this.socket.emit(ev, res);
      else this.socket.emit(ev, data, res);
    });
  }
}
