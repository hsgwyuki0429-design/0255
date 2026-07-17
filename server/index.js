// ============================================================
// ONI RUSH - ゲームサーバー (Express + Socket.IO)
// 部屋管理 / 3種の鬼ごっこルール / 当たり判定 / タイマー / レート
// Render にそのままデプロイ可能 (PORT 環境変数対応)
// ============================================================
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { MAPS } from '../public/shared/mapdata.js';
import { getPlayer, saveResults, topPlayers } from './store.js';
import { computeDeltas } from './rating.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/healthz', (_, res) => res.send('ok'));

const PORT = process.env.PORT || 3000;

// ---------------- 定数 ----------------
const MODES = { doro: '泥警', koori: '氷鬼', kawari: '代わり鬼' };
const MAX_PLAYERS = 10;
const SHOT_RANGE = 1.9;      // 銃の射程 ≒ 1m級の超短射程 (少し余裕を持たせる)
const SHOT_HIT_RADIUS = 0.62;
const SHOT_COOLDOWN = 900;   // ms
const TOUCH_RANGE = 1.7;     // 救出/氷解除の接触距離
const GRACE_MS = 5000;       // 開始時に鬼が動けない猶予
const SWAP_IMMUNE_MS = 3000; // 代わり鬼: タッチバック禁止時間

// ---------------- プレイヤー ----------------
const players = new Map(); // socket.id -> {socket, name, deviceId, rating, games, wins, roomId}

// ---------------- 部屋 ----------------
const rooms = new Map();
let roomSeq = 1;

function roomSummary(r) {
  return {
    id: r.id, name: r.name, mode: r.mode, modeName: MODES[r.mode], mapId: r.mapId,
    mapName: MAPS[r.mapId].name, oniCount: r.oniCount, timeLimit: r.timeLimit,
    isPublic: r.isPublic, locked: !r.isPublic, count: r.members.size, max: MAX_PLAYERS,
    state: r.state
  };
}
function lobbyState(r) {
  return {
    ...roomSummary(r), hostId: r.hostId,
    players: [...r.members.values()].map(m => ({ id: m.id, name: m.name, rating: m.rating, isHost: m.id === r.hostId }))
  };
}
function publicRooms() {
  return [...rooms.values()].filter(r => r.isPublic && r.state === 'lobby').map(roomSummary);
}
function broadcastRooms() { io.emit('roomsChanged', publicRooms()); }

class Room {
  constructor(opts, host) {
    this.id = 'r' + (roomSeq++);
    this.name = (opts.name || `${host.name}の部屋`).slice(0, 24);
    this.mode = MODES[opts.mode] ? opts.mode : 'doro';
    this.mapId = MAPS[opts.mapId] ? opts.mapId : 'school';
    this.oniCount = Math.max(1, Math.min(4, opts.oniCount | 0 || 1));
    this.timeLimit = Math.max(60, Math.min(600, opts.timeLimit | 0 || 180)); // 秒
    this.isPublic = opts.isPublic !== false;
    this.password = this.isPublic ? '' : String(opts.password || '').slice(0, 16);
    this.hostId = host.id;
    this.members = new Map();
    this.state = 'lobby'; // lobby | countdown | playing | ended
    this.game = null;
    this.timers = [];
  }
  addTimer(fn, ms) { const t = setTimeout(fn, ms); this.timers.push(t); return t; }
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; if (this.tickIv) clearInterval(this.tickIv); if (this.snapIv) clearInterval(this.snapIv); }

  join(p) {
    this.members.set(p.id, p);
    p.roomId = this.id;
    p.socket.join(this.id);
    io.to(this.id).emit('roomUpdate', lobbyState(this));
    broadcastRooms();
  }
  leave(p) {
    this.members.delete(p.id);
    p.roomId = null;
    p.socket.leave(this.id);
    if (this.game) this.onLeaveDuringGame(p);
    if (this.members.size === 0) {
      this.clearTimers();
      rooms.delete(this.id);
    } else {
      if (this.hostId === p.id) this.hostId = [...this.members.keys()][0];
      io.to(this.id).emit('roomUpdate', lobbyState(this));
      io.to(this.id).emit('ev', { type: 'left', id: p.id, name: p.name });
    }
    broadcastRooms();
  }

  // ---------- ゲーム開始 ----------
  start() {
    if (this.state !== 'lobby' || this.members.size < 2) return false;
    this.state = 'countdown';
    broadcastRooms();
    let n = 3;
    io.to(this.id).emit('countdown', { n });
    const cd = setInterval(() => {
      n--;
      if (n > 0) io.to(this.id).emit('countdown', { n });
      else { clearInterval(cd); this.launch(); }
    }, 1000);
    this.timers.push(cd);
    return true;
  }

  launch() {
    const map = MAPS[this.mapId];
    const ids = [...this.members.keys()];
    // 鬼をランダム選出 (人数-1 を上限)
    const oniN = Math.min(this.oniCount, ids.length - 1);
    const shuffled = [...ids].sort(() => Math.random() - 0.5);
    const oniIds = new Set(shuffled.slice(0, oniN));

    const g = this.game = {
      startAt: Date.now(), endsAt: Date.now() + this.timeLimit * 1000,
      graceUntil: Date.now() + GRACE_MS,
      players: new Map(), lastSnap: {}, over: false
    };
    let oi = 0, ri = 0;
    for (const id of ids) {
      const role = oniIds.has(id) ? 'oni' : 'run';
      const sp = role === 'oni'
        ? map.spawns.oni[oi++ % map.spawns.oni.length]
        : map.spawns.run[ri++ % map.spawns.run.length];
      g.players.set(id, {
        id, role, pos: [...sp], ry: 0, anim: 0,
        jailed: false, frozen: false, lastShot: 0, immuneUntil: 0,
        stats: { tags: 0, rescues: 0, caughtCount: 0, oniTime: 0, lastBecameOni: role === 'oni' ? Date.now() : 0 }
      });
    }
    this.state = 'playing';
    broadcastRooms();
    for (const [id, gp] of g.players) {
      const m = this.members.get(id);
      m.socket.emit('gameStart', {
        mapId: this.mapId, mode: this.mode, endsAt: g.endsAt, graceUntil: g.graceUntil,
        timeLimit: this.timeLimit, jail: map.jail,
        you: { id, role: gp.role, pos: gp.pos },
        players: [...g.players.values()].map(p => ({
          id: p.id, name: this.members.get(p.id).name, role: p.role, pos: p.pos, rating: this.members.get(p.id).rating
        }))
      });
    }
    // スナップショット配信 (15Hz) とルール監視 (2Hz)
    this.snapIv = setInterval(() => {
      const ps = {};
      for (const [id, p] of g.players) ps[id] = [+p.pos[0].toFixed(2), +p.pos[1].toFixed(2), +p.pos[2].toFixed(2), +p.ry.toFixed(2), p.anim];
      io.to(this.id).emit('snap', { t: Date.now(), ps });
    }, 66);
    this.tickIv = setInterval(() => this.tick(), 500);
  }

  tick() {
    const g = this.game;
    if (!g || g.over) return;
    const remain = g.endsAt - Date.now();
    io.to(this.id).emit('timeSync', { remain: Math.max(0, remain) });
    if (remain <= 0) return this.finish('time');
    // 全捕獲チェック
    const runners = [...g.players.values()].filter(p => p.role === 'run');
    if (this.mode === 'doro' && runners.length && runners.every(p => p.jailed)) return this.finish('allCaught');
    if (this.mode === 'koori' && runners.length && runners.every(p => p.frozen)) return this.finish('allCaught');
    if (runners.length === 0 || [...g.players.values()].every(p => p.role === 'run')) return this.finish('empty');
  }

  // ---------- プレイヤー入力 ----------
  onState(p, data) {
    const g = this.game; if (!g) return;
    const gp = g.players.get(p.id); if (!gp) return;
    if (gp.jailed || gp.frozen) { gp.anim = data.s | 0; return; } // 拘束中は位置更新無視
    if (Array.isArray(data.p) && data.p.length === 3 && data.p.every(Number.isFinite)) {
      const b = MAPS[this.mapId].bounds;
      gp.pos = [
        Math.max(b.minX - 2, Math.min(b.maxX + 2, data.p[0])),
        Math.max(-5, Math.min(30, data.p[1])),
        Math.max(b.minZ - 2, Math.min(b.maxZ + 2, data.p[2]))
      ];
    }
    if (Number.isFinite(data.ry)) gp.ry = data.ry;
    gp.anim = data.s | 0;
  }

  onShoot(p, data) {
    const g = this.game; if (!g || g.over) return;
    const gp = g.players.get(p.id); if (!gp || gp.role !== 'oni') return;
    if (gp.jailed || gp.frozen) return;
    const now = Date.now();
    if (now < g.graceUntil) return;
    if (now - gp.lastShot < SHOT_COOLDOWN) return;
    gp.lastShot = now;
    const o = (Array.isArray(data.p) && data.p.length === 3) ? data.p : gp.pos;
    let d = (Array.isArray(data.d) && data.d.length === 3) ? data.d : [0, 0, 1];
    const dl = Math.hypot(...d) || 1; d = d.map(v => v / dl);
    io.to(this.id).emit('ev', { type: 'shot', id: p.id, p: o, d });
    // ヒット判定: 射線からの距離 (超短射程)
    let best = null, bestT = Infinity;
    for (const [tid, tp] of g.players) {
      if (tid === p.id || tp.role !== 'run' || tp.jailed || tp.frozen) continue;
      if (now < tp.immuneUntil) continue;
      const c = [tp.pos[0] - o[0], tp.pos[1] + 0.9 - o[1], tp.pos[2] - o[2]]; // 胴体中心へ
      const t = c[0] * d[0] + c[1] * d[1] + c[2] * d[2];
      if (t < 0 || t > SHOT_RANGE) continue;
      const px = o[0] + d[0] * t, py = o[1] + d[1] * t, pz = o[2] + d[2] * t;
      const dist = Math.hypot(tp.pos[0] - px, tp.pos[1] + 0.9 - py, tp.pos[2] - pz);
      if (dist < SHOT_HIT_RADIUS && t < bestT) { best = tp; bestT = t; }
    }
    if (best) this.onHit(gp, best);
  }

  onHit(oni, target) {
    const g = this.game;
    const now = Date.now();
    oni.stats.tags++;
    target.stats.caughtCount++;
    const targetName = this.members.get(target.id)?.name;
    const oniName = this.members.get(oni.id)?.name;
    if (this.mode === 'doro') {
      target.jailed = true;
      const jail = MAPS[this.mapId].jail;
      target.pos = [jail.x + (Math.random() - 0.5) * jail.w * 0.5, jail.y + 0.1, jail.z + (Math.random() - 0.5) * jail.d * 0.5];
      io.to(this.id).emit('ev', { type: 'jailed', id: target.id, by: oni.id, name: targetName, byName: oniName, pos: target.pos });
    } else if (this.mode === 'koori') {
      target.frozen = true;
      io.to(this.id).emit('ev', { type: 'frozen', id: target.id, by: oni.id, name: targetName, byName: oniName, pos: target.pos });
    } else if (this.mode === 'kawari') {
      // 役割交代: 鬼の累計時間を記録
      oni.stats.oniTime += now - oni.stats.lastBecameOni;
      target.stats.lastBecameOni = now;
      oni.role = 'run'; target.role = 'oni';
      oni.immuneUntil = now + SWAP_IMMUNE_MS;
      io.to(this.id).emit('ev', { type: 'swapped', newOni: target.id, newRun: oni.id, newOniName: targetName, newRunName: oniName });
    }
  }

  onTouch(p, targetId) {
    const g = this.game; if (!g || g.over) return;
    const gp = g.players.get(p.id), tp = g.players.get(targetId);
    if (!gp || !tp) return;
    if (gp.role !== 'run' || gp.jailed || gp.frozen) return;
    const dist = Math.hypot(gp.pos[0] - tp.pos[0], gp.pos[1] - tp.pos[1], gp.pos[2] - tp.pos[2]);
    if (dist > TOUCH_RANGE + 1.0) return; // 多少の遅延を許容
    if (this.mode === 'doro' && tp.jailed) {
      tp.jailed = false;
      gp.stats.rescues++;
      io.to(this.id).emit('ev', { type: 'rescued', id: targetId, by: p.id, name: this.members.get(targetId)?.name, byName: p.name });
    } else if (this.mode === 'koori' && tp.frozen) {
      tp.frozen = false;
      gp.stats.rescues++;
      io.to(this.id).emit('ev', { type: 'unfrozen', id: targetId, by: p.id, name: this.members.get(targetId)?.name, byName: p.name });
    }
  }

  onLeaveDuringGame(p) {
    const g = this.game; if (!g || g.over) return;
    const gp = g.players.get(p.id);
    if (!gp) return;
    g.players.delete(p.id);
    // 代わり鬼で鬼が抜けたらランダムな逃げに交代
    if (this.mode === 'kawari' && gp.role === 'oni') {
      const rest = [...g.players.values()].filter(x => x.role === 'run');
      if (rest.length) {
        const nx = rest[Math.random() * rest.length | 0];
        nx.role = 'oni'; nx.stats.lastBecameOni = Date.now();
        io.to(this.id).emit('ev', { type: 'swapped', newOni: nx.id, newRun: null, newOniName: this.members.get(nx.id)?.name, newRunName: p.name });
      }
    }
    const onis = [...g.players.values()].filter(x => x.role === 'oni');
    if (g.players.size < 2 || onis.length === 0) this.finish('abandon');
  }

  // ---------- 終了とレート ----------
  async finish(reason) {
    const g = this.game; if (!g || g.over) return;
    g.over = true;
    this.clearTimers();
    const now = Date.now();
    const total = Math.max(1, now - g.startAt);
    let winner;
    if (this.mode === 'kawari') {
      for (const p of g.players.values()) if (p.role === 'oni') p.stats.oniTime += now - p.stats.lastBecameOni;
      winner = 'run'; // 時間切れ時、鬼でない者の勝ち
    } else {
      winner = (reason === 'allCaught') ? 'oni' : 'run';
    }
    // スコア算出
    const entries = [];
    for (const [id, p] of g.players) {
      const m = this.members.get(id); if (!m) continue;
      let score = 0, win = false;
      if (this.mode === 'kawari') {
        win = p.role !== 'oni';
        score = (win ? 3 : -3) + p.stats.tags * 1.2 - (p.stats.oniTime / total) * 6 + 2 * (1 - p.stats.oniTime / total);
      } else if (p.role === 'oni') {
        win = winner === 'oni';
        score = (win ? 4 : -2) + p.stats.tags * 1.6;
      } else {
        win = winner === 'run';
        const freeAtEnd = !p.jailed && !p.frozen;
        score = (win ? 3 : -2) + p.stats.rescues * 2.2 + (freeAtEnd ? 1.5 : -0.5) - p.stats.caughtCount * 0.4;
      }
      entries.push({ id, score, rating: m.rating, win, p, m });
    }
    const deltas = computeDeltas(entries.map(e => ({ id: e.id, score: e.score, rating: e.rating })));
    const dmap = new Map(deltas.map(d => [d.id, d.delta]));
    const results = [];
    for (const e of entries) {
      const delta = dmap.get(e.id) || 0;
      e.m.rating = Math.max(0, e.m.rating + delta);
      e.m.games++; if (e.win) e.m.wins++;
      results.push({
        id: e.id, name: e.m.name, role: e.p.role, win: e.win, delta, rating: e.m.rating,
        tags: e.p.stats.tags, rescues: e.p.stats.rescues, caught: e.p.stats.caughtCount,
        oniTime: Math.round(e.p.stats.oniTime / 1000)
      });
    }
    results.sort((a, b) => b.delta - a.delta);
    io.to(this.id).emit('gameEnd', { winner, reason, mode: this.mode, results });
    saveResults(entries.map(e => ({ deviceId: e.m.deviceId, name: e.m.name, rating: e.m.rating, win: e.win, delta: dmap.get(e.id) || 0 }))).catch(() => {});
    this.game = null;
    this.state = 'lobby';
    this.addTimer(() => { io.to(this.id).emit('roomUpdate', lobbyState(this)); broadcastRooms(); }, 100);
  }
}

// ---------------- ソケット ----------------
io.on('connection', (socket) => {
  let me = null;

  socket.on('hello', async (data, cb) => {
    try {
      const name = String(data?.name || 'プレイヤー').slice(0, 12).trim() || 'プレイヤー';
      const deviceId = String(data?.deviceId || socket.id).slice(0, 64);
      const rec = await getPlayer(deviceId, name);
      me = { id: socket.id, socket, name, deviceId, rating: rec.rating, games: rec.games, wins: rec.wins, roomId: null };
      players.set(socket.id, me);
      cb?.({ ok: true, id: socket.id, name, rating: rec.rating, games: rec.games, wins: rec.wins });
    } catch (e) { cb?.({ ok: false, error: 'サーバーエラー' }); }
  });

  socket.on('listRooms', (cb) => cb?.(publicRooms()));
  socket.on('ranking', async (cb) => cb?.(await topPlayers(10)));

  socket.on('createRoom', (opts, cb) => {
    if (!me) return cb?.({ ok: false, error: '未接続' });
    if (me.roomId) return cb?.({ ok: false, error: 'すでに部屋にいます' });
    const r = new Room(opts || {}, me);
    rooms.set(r.id, r);
    r.join(me);
    cb?.({ ok: true, room: lobbyState(r) });
  });

  socket.on('joinRoom', (data, cb) => {
    if (!me) return cb?.({ ok: false, error: '未接続' });
    if (me.roomId) return cb?.({ ok: false, error: 'すでに部屋にいます' });
    let r = null;
    if (data?.roomId) r = rooms.get(data.roomId);
    else if (data?.password) r = [...rooms.values()].find(x => !x.isPublic && x.password === String(data.password) && x.state === 'lobby');
    if (!r) return cb?.({ ok: false, error: '部屋が見つかりません' });
    if (r.state !== 'lobby') return cb?.({ ok: false, error: 'ゲーム進行中です' });
    if (r.members.size >= MAX_PLAYERS) return cb?.({ ok: false, error: '満員です' });
    if (!r.isPublic && r.password !== String(data?.password || '')) return cb?.({ ok: false, error: '合言葉が違います' });
    r.join(me);
    io.to(r.id).emit('ev', { type: 'joined', id: me.id, name: me.name });
    cb?.({ ok: true, room: lobbyState(r) });
  });

  socket.on('leaveRoom', () => {
    const r = me?.roomId && rooms.get(me.roomId);
    if (r) r.leave(me);
  });

  socket.on('setOpts', (opts) => {
    const r = me?.roomId && rooms.get(me.roomId);
    if (!r || r.hostId !== me.id || r.state !== 'lobby') return;
    if (opts.mode && MODES[opts.mode]) r.mode = opts.mode;
    if (opts.mapId && MAPS[opts.mapId]) r.mapId = opts.mapId;
    if (opts.oniCount) r.oniCount = Math.max(1, Math.min(4, opts.oniCount | 0));
    if (opts.timeLimit) r.timeLimit = Math.max(60, Math.min(600, opts.timeLimit | 0));
    io.to(r.id).emit('roomUpdate', lobbyState(r));
    broadcastRooms();
  });

  socket.on('startGame', () => {
    const r = me?.roomId && rooms.get(me.roomId);
    if (r && r.hostId === me.id) r.start();
  });

  socket.on('state', (data) => {
    const r = me?.roomId && rooms.get(me.roomId);
    if (r?.game) r.onState(me, data || {});
  });
  socket.on('shoot', (data) => {
    const r = me?.roomId && rooms.get(me.roomId);
    if (r?.game) r.onShoot(me, data || {});
  });
  socket.on('touchPlayer', (data) => {
    const r = me?.roomId && rooms.get(me.roomId);
    if (r?.game) r.onTouch(me, String(data?.targetId || ''));
  });
  socket.on('chat', (msg) => {
    const r = me?.roomId && rooms.get(me.roomId);
    if (r && typeof msg === 'string' && msg.trim()) {
      io.to(r.id).emit('ev', { type: 'chat', id: me.id, name: me.name, msg: msg.slice(0, 60) });
    }
  });

  socket.on('disconnect', () => {
    const r = me?.roomId && rooms.get(me.roomId);
    if (r) r.leave(me);
    players.delete(socket.id);
  });
});

server.listen(PORT, () => console.log(`ONI RUSH server on :${PORT}`));
