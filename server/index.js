// ============================================================
// ============================================================
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { MAPS, solidsOf } from '../public/shared/mapdata.js';
import { getPlayer, saveResults, saveCpuResult, topPlayers } from './store.js';
import { computeDeltas, computeCpuDelta } from './rating.js';
import { NavGrid, losBlocked } from './nav.js';
import { BotBrain, cpuLevelOf, CPU_LEVEL_NAMES, botName } from './bots.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/healthz', (_, res) => res.send('ok'));

const PORT = process.env.PORT || 3000;

const MODES = { doro: '泥警', koori: '氷鬼', kawari: '代わり鬼' };
const MAX_PLAYERS = 10;
// 捕獲判定: 体(カプセル半径0.32)同士が実際に触れるのは中心間0.64m。
// 「接触してないのに捕まる」を防ぐため、以前の1.35mから体の接触に近い値へ縮小。
const CATCH_RANGE = 1.1;
const CATCH_DY = 1.5;
// ラグ補償: 逃げ側の画面では鬼が補間遅延ぶん過去の位置に見える(＝実サーバー位置より後ろ)。
// そのぶん鬼の位置を過去にさかのぼって判定し、「画面で見えている鬼の位置」で捕まえる。
const CATCH_LAG_COMP = 100;   // ms — クライアント補間遅延にほぼ一致させる
const CATCH_LAG_SLACK = 0.4;
const HIST_MS = 600;          // 位置履歴の保持時間
const NO_CATCH_WHISTLE_MS = 30000;
const TOUCH_RANGE = 1.7;
const GRACE_MS = 5000;
const SWAP_IMMUNE_MS = 3000;

const players = new Map(); // socket.id -> {socket, name, deviceId, rating, cpuRating, games, wins, roomId}

// 捕獲の視線判定に使う固体リストをマップ単位でキャッシュ (CPU戦以外でも使うため独立)
const solidsCache = new Map();
function solidsFor(mapId) {
  if (!solidsCache.has(mapId)) solidsCache.set(mapId, solidsOf(MAPS[mapId]));
  return solidsCache.get(mapId);
}
// 鬼と逃げの間に壁があれば捕獲を無効化 (壁越しキャッチ防止)。胸の高さで判定し低い什器は無視。
function catchBlocked(mapId, a, b) {
  const h = Math.max(a[1], b[1]) + 0.85;
  return losBlocked([a[0], h, a[2]], [b[0], h, b[2]], solidsFor(mapId));
}

// 各プレイヤーの位置履歴に現在地を記録 (ラグ補償用のリングバッファ)
function recordHist(gp, now) {
  const h = gp.hist || (gp.hist = []);
  h.push({ t: now, p: [gp.pos[0], gp.pos[1], gp.pos[2]] });
  while (h.length > 2 && now - h[0].t > HIST_MS) h.shift();
}
// t (ms) 時点の位置を履歴から補間して返す。履歴が無ければ現在地。
function posAt(gp, t) {
  const h = gp.hist;
  if (!h || !h.length) return gp.pos;
  for (let i = h.length - 1; i >= 0; i--) {
    if (h[i].t <= t) {
      const a = h[i], b = h[i + 1];
      if (!b) return a.p;
      const k = Math.max(0, Math.min(1, (t - a.t) / Math.max(1, b.t - a.t)));
      return [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k];
    }
  }
  return h[0].p;
}

const navCache = new Map();
function navOf(mapId) {
  if (!navCache.has(mapId)) {
    const map = MAPS[mapId];
    const solids = solidsOf(map);
    const t0 = Date.now();
    const nav = new NavGrid(map, solids);
    console.log(`[nav] ${mapId}: グリッド構築 ${Date.now() - t0}ms`);
    navCache.set(mapId, { nav, solids });
  }
  return navCache.get(mapId);
}
let botSeq = 1;
function makeBot(i, rating) {
  const id = 'bot_' + (botSeq++);
  return {
    id, name: botName(i), deviceId: null, isBot: true,
    rating, games: 0, wins: 0, roomId: null,
    socket: { join() {}, leave() {}, emit() {} }
  };
}

const rooms = new Map();
let roomSeq = 1;

function roomSummary(r) {
  return {
    id: r.id, name: r.name, mode: r.mode, modeName: MODES[r.mode], mapId: r.mapId,
    mapName: MAPS[r.mapId].name, oniCount: r.oniCount, timeLimit: r.timeLimit,
    isPublic: r.isPublic, locked: !r.isPublic, count: r.members.size, max: MAX_PLAYERS,
    state: r.state, isCpu: !!r.isCpu
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
    this.timeLimit = Math.max(60, Math.min(600, opts.timeLimit | 0 || 180));
    this.isPublic = opts.isPublic !== false;
    this.password = this.isPublic ? '' : String(opts.password || '').slice(0, 16);
    this.hostId = host.id;
    this.members = new Map();
    this.state = 'lobby'; // lobby | countdown | playing | ended
    this.game = null;
    this.timers = [];
  }
  addTimer(fn, ms) { const t = setTimeout(fn, ms); this.timers.push(t); return t; }
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; if (this.tickIv) clearInterval(this.tickIv); if (this.snapIv) clearInterval(this.snapIv); if (this.botIv) clearInterval(this.botIv); }

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
    if (this.isCpu && ![...this.members.values()].some(m => !m.isBot)) {
      this.clearTimers();
      rooms.delete(this.id);
      broadcastRooms();
      return;
    }
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
    const oniN = Math.min(this.oniCount, ids.length - 1);
    let shuffled = [...ids].sort(() => Math.random() - 0.5);
    if (this.forceRole === 'oni' || this.forceRole === 'run') {
      const humans = ids.filter(id => !this.members.get(id).isBot);
      shuffled = shuffled.filter(id => !humans.includes(id));
      if (this.forceRole === 'oni') shuffled = [...humans, ...shuffled];
      else shuffled = [...shuffled, ...humans];
    }
    const oniIds = new Set(shuffled.slice(0, oniN));

    const g = this.game = {
      startAt: Date.now(), endsAt: Date.now() + this.timeLimit * 1000,
      graceUntil: Date.now() + GRACE_MS,
      lastCatchAt: Date.now() + GRACE_MS,
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
        jailed: false, frozen: false, immuneUntil: 0,
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
    if (this.isCpu) {
      const { nav, solids } = navOf(this.mapId);
      this.brains = [];
      for (const [id, m] of this.members) {
        if (m.isBot && g.players.has(id)) this.brains.push(new BotBrain(id, this, this.cpuLevel, nav, solids, map));
      }
      this.botIv = setInterval(() => {
        const now = Date.now();
        if (!this.game || this.game.over) return;
        for (const b of this.brains) {
          try { b.update(0.05, now); } catch (e) { }
        }
      }, 50);
    }
    this.snapIv = setInterval(() => {
      const now = Date.now();
      for (const p of g.players.values()) recordHist(p, now);
      this.checkCatches();
      const ps = {};
      for (const [id, p] of g.players) ps[id] = [+p.pos[0].toFixed(2), +p.pos[1].toFixed(2), +p.pos[2].toFixed(2), +p.ry.toFixed(2), p.anim];
      io.to(this.id).emit('snap', { t: Date.now(), ps });
    }, 66);
    this.tickIv = setInterval(() => this.tick(), 500);
  }

  tick() {
    const g = this.game;
    if (!g || g.over) return;
    const now = Date.now();
    const remain = g.endsAt - now;
    io.to(this.id).emit('timeSync', { remain: Math.max(0, remain) });
    if (remain <= 0) return this.finish('time');
    if (now - g.lastCatchAt > NO_CATCH_WHISTLE_MS) {
      g.lastCatchAt = now;
      io.to(this.id).emit('ev', { type: 'whistle' });
    }
    const runners = [...g.players.values()].filter(p => p.role === 'run');
    if (this.mode === 'doro' && runners.length && runners.every(p => p.jailed)) return this.finish('allCaught');
    if (this.mode === 'koori' && runners.length && runners.every(p => p.frozen)) return this.finish('allCaught');
    if (runners.length === 0 || [...g.players.values()].every(p => p.role === 'run')) return this.finish('empty');
  }

  onState(p, data) {
    const g = this.game; if (!g) return;
    const gp = g.players.get(p.id); if (!gp) return;
    if (gp.jailed || gp.frozen) { gp.anim = data.s | 0; return; }
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

  checkCatches() {
    const g = this.game; if (!g || g.over) return;
    const now = Date.now();
    if (now < g.graceUntil) return;
    // 鬼はtick開始時点のスナップショットで固定 (代わり鬼で入れ替わった直後の二重処理を防ぐ)。
    // 各鬼につき最も近い逃げを1人捕まえる → 複数鬼が同tickで取りこぼさない。
    const onis = [...g.players.values()].filter(p => p.role === 'oni' && !p.jailed && !p.frozen);
    for (const oni of onis) {
      if (oni.role !== 'oni' || oni.jailed || oni.frozen) continue; // onHitで役割が変わり得るため再確認
      // 逃げ側の画面で見えている鬼の位置(補間遅延ぶん過去)で判定する
      const oniPos = posAt(oni, now - CATCH_LAG_COMP);
      let best = null, bestD2 = Infinity;
      for (const tp of g.players.values()) {
        if (tp.id === oni.id || tp.role !== 'run' || tp.jailed || tp.frozen) continue;
        if (now < tp.immuneUntil) continue;
        const dx = tp.pos[0] - oniPos[0], dz = tp.pos[2] - oniPos[2];
        const dy = Math.abs(tp.pos[1] - oniPos[1]);
        const d2 = dx * dx + dz * dz;
        if (d2 < CATCH_RANGE * CATCH_RANGE && dy < CATCH_DY && d2 < bestD2) { bestD2 = d2; best = tp; }
      }
      if (best && !catchBlocked(this.mapId, oni.pos, best.pos)) this.onHit(oni, best);
    }
  }

  onHit(oni, target) {
    const g = this.game;
    const now = Date.now();
    g.lastCatchAt = now;
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
    if (gp.jailed || gp.frozen) return;
    if (gp.role === 'oni') {
      const now = Date.now();
      if (now < g.graceUntil) return;
      if (tp.role !== 'run' || tp.jailed || tp.frozen || now < tp.immuneUntil) return;
      const oniPos = posAt(gp, now - CATCH_LAG_COMP);   // ラグ補償(checkCatchesと同じ)
      const d = Math.hypot(oniPos[0] - tp.pos[0], oniPos[2] - tp.pos[2]);
      if (d > CATCH_RANGE + CATCH_LAG_SLACK || Math.abs(oniPos[1] - tp.pos[1]) > 1.6) return;
      if (catchBlocked(this.mapId, gp.pos, tp.pos)) return;   // 壁越しキャッチ防止
      this.onHit(gp, tp);
      return;
    }
    if (gp.role !== 'run') return;
    const dist = Math.hypot(gp.pos[0] - tp.pos[0], gp.pos[1] - tp.pos[1], gp.pos[2] - tp.pos[2]);
    if (dist > TOUCH_RANGE + 1.0) return;
    if (this.mode === 'doro' && tp.jailed) {
      // 泥警の定番ルール: 1人助けると牢屋の仲間が全員脱獄できる。
      // → 捕まっても「詰み」にならず、鬼は1箇所を固め続けても意味がなくなる。
      const freed = [...g.players.values()].filter(x => x.role === 'run' && x.jailed);
      for (const f of freed) {
        f.jailed = false;
        io.to(this.id).emit('ev', { type: 'rescued', id: f.id, by: p.id, name: this.members.get(f.id)?.name, byName: p.name });
      }
      gp.stats.rescues += freed.length;
      if (freed.length > 1) io.to(this.id).emit('ev', { type: 'jailbreak', by: p.id, byName: p.name, count: freed.length });
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

  async finish(reason) {
    if (this.isCpu) return this.finishCpu(reason);
    const g = this.game; if (!g || g.over) return;
    g.over = true;
    this.clearTimers();
    const now = Date.now();
    const total = Math.max(1, now - g.startAt);
    let winner;
    if (this.mode === 'kawari') {
      for (const p of g.players.values()) if (p.role === 'oni') p.stats.oniTime += now - p.stats.lastBecameOni;
      winner = 'run';
    } else {
      winner = (reason === 'allCaught') ? 'oni' : 'run';
    }
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

  async finishCpu(reason) {
    const g = this.game; if (!g || g.over) return;
    g.over = true;
    this.clearTimers();
    const now = Date.now();
    const total = Math.max(1, now - g.startAt);
    let winner;
    if (this.mode === 'kawari') {
      for (const p of g.players.values()) if (p.role === 'oni') p.stats.oniTime += now - p.stats.lastBecameOni;
      winner = 'run';
    } else {
      winner = (reason === 'allCaught') ? 'oni' : 'run';
    }
    const results = [];
    const cpuSaves = [];
    for (const [id, p] of g.players) {
      const m = this.members.get(id); if (!m) continue;
      let win;
      if (this.mode === 'kawari') win = p.role !== 'oni';
      else win = (p.role === 'oni') === (winner === 'oni');
      let delta = 0, rating = m.rating;
      if (!m.isBot) {
        const perf = p.stats.tags * 1.5 + p.stats.rescues * 2 - p.stats.caughtCount;
        delta = computeCpuDelta(m.cpuRating, win, perf);
        m.cpuRating = Math.max(0, m.cpuRating + delta);
        rating = m.cpuRating;
        cpuSaves.push(m);
      }
      results.push({
        id, name: m.name, role: p.role, win, delta, rating, isBot: !!m.isBot,
        tags: p.stats.tags, rescues: p.stats.rescues, caught: p.stats.caughtCount,
        oniTime: Math.round(p.stats.oniTime / 1000)
      });
    }
    results.sort((a, b) => (b.win - a.win) || (b.delta - a.delta));
    io.to(this.id).emit('gameEnd', { winner, reason, mode: this.mode, isCpu: true, cpuLevel: this.cpuLevel, results });
    for (const m of cpuSaves) saveCpuResult(m.deviceId, m.name, m.cpuRating).catch(() => {});
    this.game = null;
    this.state = 'ended';
    this.addTimer(() => {
      for (const m of [...this.members.values()]) {
        if (!m.isBot) { m.roomId = null; m.socket.leave(this.id); }
      }
      this.members.clear();
      rooms.delete(this.id);
      broadcastRooms();
    }, 500);
  }
}

io.on('connection', (socket) => {
  let me = null;

  socket.on('hello', async (data, cb) => {
    try {
      const name = String(data?.name || 'プレイヤー').slice(0, 12).trim() || 'プレイヤー';
      const deviceId = String(data?.deviceId || socket.id).slice(0, 64);
      const rec = await getPlayer(deviceId, name);
      me = { id: socket.id, socket, name, deviceId, rating: rec.rating, cpuRating: rec.cpuRating, games: rec.games, wins: rec.wins, roomId: null };
      players.set(socket.id, me);
      cb?.({ ok: true, id: socket.id, name, rating: rec.rating, cpuRating: rec.cpuRating, games: rec.games, wins: rec.wins });
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

  socket.on('startCpu', (opts, cb) => {
    if (!me) return cb?.({ ok: false, error: '未接続' });
    if (me.roomId) return cb?.({ ok: false, error: 'すでに部屋にいます' });
    const o = opts || {};
    const r = new Room({
      name: `${me.name}のCPU戦`, mode: o.mode, mapId: o.mapId,
      oniCount: o.oniCount, timeLimit: o.timeLimit, isPublic: false, password: ''
    }, me);
    r.isCpu = true;
    r.cpuLevel = cpuLevelOf(me.cpuRating);
    r.forceRole = (o.myRole === 'oni' || o.myRole === 'run') ? o.myRole : null;
    rooms.set(r.id, r);
    r.join(me);
    const n = Math.max(2, Math.min(7, o.cpuCount | 0 || 3));
    for (let i = 0; i < n; i++) {
      const bot = makeBot(i, Math.max(0, me.cpuRating + ((Math.random() * 60) | 0) - 30));
      bot.roomId = r.id;
      r.members.set(bot.id, bot);
    }
    if (!r.start()) {
      rooms.delete(r.id);
      me.roomId = null;
      return cb?.({ ok: false, error: '開始できませんでした' });
    }
    cb?.({ ok: true, cpuLevel: r.cpuLevel, cpuLevelName: CPU_LEVEL_NAMES[r.cpuLevel] });
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
