// ============================================================
// ============================================================
import { moveCapsule } from '../public/shared/collision.js';

const GRAVITY = -14.5;
const JUMP_V = 5.6;
const SPEED_RUN = 5.3;
const SPEED_ONI = 5.75;

export function cpuLevelOf(rating) {
  if (rating < 900) return 0;
  if (rating < 1000) return 1;
  if (rating < 1100) return 2;
  if (rating < 1250) return 3;
  if (rating < 1400) return 4;
  return 5;
}
export const CPU_LEVEL_NAMES = ['みならい鬼', 'ふつうの鬼', 'しっかり鬼', 'かしこい鬼', '鬼軍師', '鬼神'];

const BOT_NAMES = ['ボルト', 'ナット', 'コグ', 'チップ', 'ギア', 'ピストン', 'レンチ', 'リベット'];
export function botName(i) { return '🤖' + BOT_NAMES[i % BOT_NAMES.length]; }

const PARAMS = [
  { react: 900, usePath: false, repath: 2200, predict: 0,    fleeDist: 7,  rescue: false, boldness: 0,  guardJail: false, idleP: 0.55 },
  { react: 650, usePath: true,  repath: 1800, predict: 0,    fleeDist: 9,  rescue: false, boldness: 0,  guardJail: false, idleP: 0.40 },
  { react: 450, usePath: true,  repath: 1300, predict: 0.15, fleeDist: 11, rescue: true,  boldness: 9,  guardJail: false, idleP: 0.28 },
  { react: 300, usePath: true,  repath: 1000, predict: 0.3,  fleeDist: 13, rescue: true,  boldness: 11, guardJail: true,  idleP: 0.18 },
  { react: 190, usePath: true,  repath: 750,  predict: 0.45, fleeDist: 16, rescue: true,  boldness: 14, guardJail: true,  idleP: 0.10 },
  { react: 120, usePath: true,  repath: 550,  predict: 0.6,  fleeDist: 19, rescue: true,  boldness: 17, guardJail: true,  idleP: 0.05 },
];

export class BotBrain {
  constructor(id, room, level, nav, solids, map) {
    this.id = id;
    this.room = room;
    this.level = level;
    this.p = PARAMS[Math.max(0, Math.min(5, level))];
    this.nav = nav;
    this.solids = solids;
    this.map = map;
    const gp = room.game.players.get(id);
    this.pos = { x: gp.pos[0], y: gp.pos[1], z: gp.pos[2] };
    this.vel = { x: 0, y: 0, z: 0 };
    this.path = null;
    this.pathIdx = 0;
    this.goal = null;
    this.nextThink = 0;
    this.nextRepath = 0;
    this.mode = 'idle';
    this.targetId = null;
    this.stuckT = 0;
    this.lastPos = { x: this.pos.x, z: this.pos.z };
    this.lastProbe = 0;
    this.tprev = new Map();
    this.jitter = Math.random() * 1000;
  }

  velOf(tp, now) {
    const prev = this.tprev.get(tp.id);
    this.tprev.set(tp.id, { x: tp.pos[0], z: tp.pos[2], t: now });
    if (!prev || now - prev.t < 40 || now - prev.t > 1200) return { x: 0, z: 0 };
    const dt = (now - prev.t) / 1000;
    return { x: (tp.pos[0] - prev.x) / dt, z: (tp.pos[2] - prev.z) / dt };
  }

  setGoal(x, y, z) {
    this.goal = { x, y, z };
    if (this.p.usePath) {
      this.path = this.nav.findPath(this.pos.x, this.pos.y, this.pos.z, x, y, z);
      this.pathIdx = 0;
    } else {
      this.path = null;
    }
  }

  think(now) {
    const room = this.room, g = room.game;
    const gp = g.players.get(this.id);
    const P = this.p;
    const players = [...g.players.values()];
    const dist2 = (a, b) => Math.hypot(a.pos[0] - b[0], a.pos[2] - b[2]);

    if (gp.role === 'oni') {
      if (now < g.graceUntil) { this.mode = 'idle'; this.path = null; return; }
      const jailedList = players.filter(p => p.role === 'run' && p.jailed);
      if (P.guardJail && room.mode === 'doro' && jailedList.length) {
        const onis = players.filter(p => p.role === 'oni').map(p => p.id).sort();
        if (onis.length >= 2 && onis[0] === this.id) {
          const j = this.map.jail;
          const a = now / 2400 + this.jitter;
          this.mode = 'guard';
          this.setGoal(j.x + Math.cos(a) * (j.w / 2 + 2.2), j.y, j.z + Math.sin(a) * (j.d / 2 + 2.2));
          return;
        }
      }
      const targets = players.filter(p =>
        p.id !== this.id && p.role === 'run' && !p.jailed && !p.frozen && now >= (p.immuneUntil || 0));
      if (!targets.length) { this.mode = 'wander'; this.wander(); return; }
      let best = null, bestScore = Infinity;
      for (const t of targets) {
        let d = dist2(t, [this.pos.x, 0, this.pos.z]) + Math.abs(t.pos[1] - this.pos.y) * 2;
        if (this.level >= 3) {
          for (const o of players) {
            if (o.role === 'oni' && o.id !== this.id && dist2(t, o.pos) < 6) d += 5;
          }
        }
        if (d < bestScore) { bestScore = d; best = t; }
      }
      this.mode = 'chase';
      this.targetId = best.id;
      const tv = this.velOf(best, now);
      const lead = Math.min(this.level >= 4 ? 1.0 : 0.4, bestScore / 12) * P.predict * 3;
      this.setGoal(best.pos[0] + tv.x * lead, best.pos[1], best.pos[2] + tv.z * lead);
      return;
    }

    if (gp.jailed || gp.frozen) { this.mode = 'idle'; this.path = null; return; }
    const onis = players.filter(p => p.role === 'oni' && !p.jailed && !p.frozen);
    let nearest = null, nd = Infinity;
    for (const o of onis) {
      const d = dist2(o, [this.pos.x, 0, this.pos.z]);
      if (d < nd) { nd = d; nearest = o; }
    }
    if (nearest && nd < P.fleeDist) {
      this.mode = 'flee';
      const ax = this.pos.x - nearest.pos[0], az = this.pos.z - nearest.pos[2];
      const base = Math.atan2(az, ax);
      const b = this.map.bounds;
      let bestPt = null, bestScore = -Infinity;
      const angles = this.level >= 2 ? [0, 0.7, -0.7, 1.3, -1.3] : [0, 0.9, -0.9];
      for (const da of angles) {
        const a = base + da;
        const px = this.pos.x + Math.cos(a) * 10, pz = this.pos.z + Math.sin(a) * 10;
        const n = this.nav.sample(px, this.pos.y, pz, 2.5);
        if (!n) continue;
        const pt = this.nav.posOf(n);
        let score = 0;
        for (const o of onis) score += Math.min(24, Math.hypot(pt.x - o.pos[0], pt.z - o.pos[2]));
        if (this.level >= 3) {
          const edge = Math.min(pt.x - b.minX, b.maxX - pt.x, pt.z - b.minZ, b.maxZ - pt.z);
          score += Math.min(8, edge) * 0.6;
        }
        score += Math.random() * 1.5;
        if (score > bestScore) { bestScore = score; bestPt = pt; }
      }
      if (bestPt) this.setGoal(bestPt.x, bestPt.y, bestPt.z);
      return;
    }
    if (P.rescue && (room.mode === 'doro' || room.mode === 'koori')) {
      const captives = players.filter(p => p.id !== this.id && p.role === 'run' && (p.jailed || p.frozen));
      if (captives.length && (!nearest || nd > P.boldness * 0.7)) {
        let c = captives[0], cd = Infinity;
        for (const cc of captives) {
          const d = dist2(cc, [this.pos.x, 0, this.pos.z]);
          if (d < cd) { cd = d; c = cc; }
        }
        let danger = 0;
        for (const o of onis) danger += dist2(o, c.pos) < (this.level >= 4 ? 7 : 4) ? 1 : 0;
        if (!danger) {
          this.mode = 'rescue';
          this.targetId = c.id;
          this.setGoal(c.pos[0], c.pos[1], c.pos[2]);
          return;
        }
      }
    }
    if (this.mode !== 'wander' || !this.goal || Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z) < 1.2) {
      this.mode = 'wander';
      if (Math.random() < P.idleP) { this.goal = null; this.path = null; return; }
      this.wander();
    }
  }

  wander() {
    const pt = this.nav.randomPointNear(this.pos.x, this.pos.y, this.pos.z, 13);
    if (pt) this.setGoal(pt.x, pt.y, pt.z);
    else { this.goal = null; this.path = null; }
  }

  update(dt, now) {
    const room = this.room, g = room.game;
    if (!g || g.over) return;
    const gp = g.players.get(this.id);
    if (!gp) return;
    const P = this.p;

    if (gp.jailed || gp.frozen) {
      this.pos.x = gp.pos[0]; this.pos.y = gp.pos[1]; this.pos.z = gp.pos[2];
      this.vel.x = this.vel.y = this.vel.z = 0;
      this.path = null; this.goal = null;
      gp.anim = 0;
      return;
    }

    if (now >= this.nextThink) {
      this.nextThink = now + P.react * (0.8 + Math.random() * 0.4);
      this.think(now);
    }

    let steer = null;
    const isOni = gp.role === 'oni';
    const locked = isOni && now < g.graceUntil;
    if (this.mode === 'chase' && this.targetId) {
      const t = g.players.get(this.targetId);
      if (t && !t.jailed && !t.frozen) {
        const d = Math.hypot(t.pos[0] - this.pos.x, t.pos[2] - this.pos.z);
        if (d < 5 && Math.abs(t.pos[1] - this.pos.y) < 1.6) {
          steer = { x: t.pos[0], z: t.pos[2] };
        }
      }
    }
    if (this.mode === 'rescue' && this.targetId) {
      const t = g.players.get(this.targetId);
      if (t && (t.jailed || t.frozen) &&
          Math.hypot(t.pos[0] - this.pos.x, t.pos[2] - this.pos.z) < 1.4 && Math.abs(t.pos[1] - this.pos.y) < 1.6) {
        room.onTouch(room.members.get(this.id), this.targetId);
        this.nextThink = 0;
      }
    }

    let wantJump = false;
    if (!steer && this.path && this.path.length) {
      let wp = this.path[this.pathIdx];
      while (wp && Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) < 0.55 && Math.abs(wp.y - this.pos.y) < 1.2) {
        this.pathIdx++;
        wp = this.path[this.pathIdx];
      }
      if (wp) {
        steer = { x: wp.x, z: wp.z };
        if (wp.jump && wp.y - this.pos.y > 0.38 && Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) < 1.1) wantJump = true;
      } else {
        this.path = null;
      }
    }
    if (!steer && this.goal) steer = { x: this.goal.x, z: this.goal.z };

    const maxSp = (isOni ? SPEED_ONI : SPEED_RUN);
    let want = false;
    if (steer && !locked) {
      const dx = steer.x - this.pos.x, dz = steer.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.15) {
        want = true;
        const tvx = (dx / d) * maxSp, tvz = (dz / d) * maxSp;
        const k = Math.min(1, dt * 9);
        this.vel.x += (tvx - this.vel.x) * k;
        this.vel.z += (tvz - this.vel.z) * k;
      }
    }
    if (!want) {
      this.vel.x *= Math.max(0, 1 - dt * 10);
      this.vel.z *= Math.max(0, 1 - dt * 10);
    }

    if (want) {
      const moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z);
      if (now - this.lastProbe > 500) {
        this.lastProbe = now;
        if (moved < 0.35) {
          this.stuckT += 0.5;
          if (this.stuckT >= 0.5 && this.onGround) wantJump = true;
          if (this.stuckT >= 1.5) {
            this.stuckT = 0;
            this.nextThink = 0;
            this.nextRepath = 0;
            const a = Math.atan2(this.vel.z, this.vel.x) + (Math.random() < 0.5 ? 1.6 : -1.6);
            this.vel.x = Math.cos(a) * maxSp * 0.7;
            this.vel.z = Math.sin(a) * maxSp * 0.7;
          }
        } else {
          this.stuckT = 0;
        }
        this.lastPos.x = this.pos.x; this.lastPos.z = this.pos.z;
      }
    } else {
      this.stuckT = 0;
    }

    if (this.goal && P.usePath && now > this.nextRepath && (this.mode === 'chase' || this.mode === 'flee')) {
      this.nextRepath = now + P.repath;
      this.setGoal(this.goal.x, this.goal.y, this.goal.z);
    }

    if (wantJump && this.onGround) this.vel.y = JUMP_V;
    this.vel.y += GRAVITY * dt;
    if (this.vel.y < -18) this.vel.y = -18;
    const res = moveCapsule(this.pos, this.vel, dt, this.solids);
    this.onGround = res.onGround;
    if (res.onGround && this.vel.y < 0) this.vel.y = 0;

    gp.pos = [this.pos.x, this.pos.y, this.pos.z];
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.4) gp.ry = Math.atan2(this.vel.x, this.vel.z);
    gp.anim = (hs > 0.3 ? 1 : 0) | (!this.onGround ? 2 : 0);
  }
}
