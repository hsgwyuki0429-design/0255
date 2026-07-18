// ============================================================
// CPUボット用ナビゲーション: マップのAABBから多層グリッドを構築し、
// A* で経路探索する。段差(≤0.45)は歩行、(≤1.05)はジャンプ、
// 下り(≤3.8)は飛び降りとして接続する。
// ============================================================

const CELL = 0.6;        // グリッド解像度
const CLEAR = 1.75;      // 必要な頭上クリアランス
const WALK_DH = 0.45;    // 歩いて越えられる段差
const JUMP_DH = 1.05;    // ジャンプで越えられる段差
const DROP_DH = 3.8;     // 飛び降りられる高さ
const MAXL = 6;          // 1セルあたり最大レベル数

export class NavGrid {
  constructor(map, solids) {
    const b = map.bounds;
    this.minX = b.minX; this.minZ = b.minZ;
    this.nx = Math.ceil((b.maxX - b.minX) / CELL);
    this.nz = Math.ceil((b.maxZ - b.minZ) / CELL);
    this.levels = new Array(this.nx * this.nz); // 各セルの歩行面高さの配列
    this.build(solids);
  }

  build(solids) {
    const r = 0.3;
    // セルごとに重なるsolidを高速に引けるよう列バケツ化
    const colBuckets = new Array(this.nx);
    for (let i = 0; i < this.nx; i++) colBuckets[i] = [];
    for (const s of solids) {
      const i0 = Math.max(0, Math.floor((s.minX - r - this.minX) / CELL));
      const i1 = Math.min(this.nx - 1, Math.floor((s.maxX + r - this.minX) / CELL));
      for (let i = i0; i <= i1; i++) colBuckets[i].push(s);
    }
    for (let i = 0; i < this.nx; i++) {
      const cx = this.minX + (i + 0.5) * CELL;
      for (let j = 0; j < this.nz; j++) {
        const cz = this.minZ + (j + 0.5) * CELL;
        const near = [];
        for (const s of colBuckets[i]) {
          if (cz + r > s.minZ && cz - r < s.maxZ) near.push(s);
        }
        // 床候補: セル中心の直下にあるsolidの上面 (0m=地面も候補)
        const cands = [0];
        for (const s of near) {
          if (cx > s.minX - 0.15 && cx < s.maxX + 0.15 && cz > s.minZ - 0.15 && cz < s.maxZ + 0.15) {
            if (s.maxY > 0.01 && s.maxY < 22) cands.push(s.maxY);
          }
        }
        cands.sort((a, b) => a - b);
        const lv = [];
        for (const h of cands) {
          if (lv.length && h - lv[lv.length - 1] < 0.3) continue; // 近接候補は統合
          // クリアランス: h+0.45〜h+CLEAR の帯に食い込むsolidがあれば立てない
          let ok = true;
          for (const s of near) {
            if (s.minY < h + CLEAR && s.maxY > h + 0.45 &&
                cx + r > s.minX && cx - r < s.maxX && cz + r > s.minZ && cz - r < s.maxZ) { ok = false; break; }
          }
          if (ok) lv.push(h);
          if (lv.length >= MAXL) break;
        }
        this.levels[i * this.nz + j] = lv;
      }
    }
  }

  cellOf(x, z) {
    const i = Math.floor((x - this.minX) / CELL), j = Math.floor((z - this.minZ) / CELL);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return null;
    return [i, j];
  }

  // 位置に最も近い歩行面 (セル+レベルindex) を探す
  sample(x, y, z, radius = 2) {
    const c = this.cellOf(x, z);
    const tryCell = (i, j) => {
      if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return null;
      const lv = this.levels[i * this.nz + j];
      let best = null, bd = Infinity;
      for (let li = 0; li < lv.length; li++) {
        const d = Math.abs(lv[li] - y);
        if (d < bd && d < 1.6) { bd = d; best = li; }
      }
      return best === null ? null : { i, j, li: best, h: lv[best] };
    };
    if (c) { const n = tryCell(c[0], c[1]); if (n) return n; }
    // 近傍探索
    const ci = c ? c[0] : Math.round((x - this.minX) / CELL), cj = c ? c[1] : Math.round((z - this.minZ) / CELL);
    const R = Math.ceil(radius / CELL);
    for (let ring = 1; ring <= R; ring++) {
      for (let di = -ring; di <= ring; di++) {
        for (let dj = -ring; dj <= ring; dj++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
          const n = tryCell(ci + di, cj + dj);
          if (n) return n;
        }
      }
    }
    return null;
  }

  posOf(node) {
    return {
      x: this.minX + (node.i + 0.5) * CELL,
      y: node.h,
      z: this.minZ + (node.j + 0.5) * CELL
    };
  }

  // ランダムな歩行可能地点 (徘徊用)
  randomPointNear(x, y, z, radius) {
    for (let t = 0; t < 24; t++) {
      const a = Math.random() * Math.PI * 2, d = radius * (0.35 + Math.random() * 0.65);
      const n = this.sample(x + Math.cos(a) * d, y, z + Math.sin(a) * d, 1.4);
      if (n) return this.posOf(n);
    }
    return null;
  }

  // A* 経路探索。戻り値: [{x,y,z,jump}] or null
  findPath(sx, sy, sz, tx, ty, tz, maxIter = 24000) {
    const start = this.sample(sx, sy, sz), goal = this.sample(tx, ty, tz);
    if (!start || !goal) return null;
    const NZ = this.nz;
    const id = (i, j, li) => (i * NZ + j) * MAXL + li;
    const startId = id(start.i, start.j, start.li), goalId = id(goal.i, goal.j, goal.li);
    if (startId === goalId) return [{ x: tx, y: goal.h, z: tz, jump: false }];

    const gScore = new Map([[startId, 0]]);
    const from = new Map();
    const jumpEdge = new Map();
    // 二分ヒープ [f, id]
    const heap = [[0, startId]];
    const push = (f, n) => {
      heap.push([f, n]);
      let k = heap.length - 1;
      while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1, r = l + 1; let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
        }
      }
      return top;
    };
    const hOf = (i, j, h) => {
      const gx = this.minX + (goal.i + 0.5) * CELL, gz = this.minZ + (goal.j + 0.5) * CELL;
      const x = this.minX + (i + 0.5) * CELL, z = this.minZ + (j + 0.5) * CELL;
      return Math.hypot(gx - x, gz - z) + Math.abs(goal.h - h) * 1.5;
    };
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let iter = 0, found = false;
    while (heap.length && iter++ < maxIter) {
      const [, cur] = pop();
      if (cur === goalId) { found = true; break; }
      const li = cur % MAXL, cj = ((cur - li) / MAXL) % NZ, ci = ((cur - li) / MAXL - cj) / NZ;
      const lv = this.levels[ci * NZ + cj];
      if (li >= lv.length) continue;
      const h = lv[li];
      const g0 = gScore.get(cur);
      for (const [di, dj, cost] of DIRS) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= this.nx || nj >= this.nz) continue;
        const diag = cost > 1;
        const nlv = this.levels[ni * NZ + nj];
        for (let nli = 0; nli < nlv.length; nli++) {
          const nh = nlv[nli], dh = nh - h;
          let c, jf = false;
          if (Math.abs(dh) <= WALK_DH) c = cost * CELL;
          else if (!diag && dh > 0 && dh <= JUMP_DH) { c = cost * CELL * 2.6; jf = true; }
          else if (!diag && dh < 0 && -dh <= DROP_DH) c = cost * CELL * (1.15 + -dh * 0.12);
          else continue;
          if (diag) {
            // 角抜け防止: 両直交セルに同レベル帯があること
            const a = this.levels[ci * NZ + nj].some(v => Math.abs(v - h) <= WALK_DH);
            const b = this.levels[ni * NZ + cj].some(v => Math.abs(v - h) <= WALK_DH);
            if (!a || !b) continue;
          }
          const nid = id(ni, nj, nli);
          const ng = g0 + c;
          if (ng < (gScore.get(nid) ?? Infinity)) {
            gScore.set(nid, ng);
            from.set(nid, cur);
            jumpEdge.set(nid, jf);
            push(ng + hOf(ni, nj, nh), nid);
          }
        }
      }
    }
    if (!found) return null;
    // 経路復元 → 方向が変わる点だけ残す
    const raw = [];
    let cur = goalId;
    while (cur !== undefined) {
      const li = cur % MAXL, cj = ((cur - li) / MAXL) % NZ, ci = ((cur - li) / MAXL - cj) / NZ;
      raw.push({ i: ci, j: cj, h: this.levels[ci * NZ + cj][li], jump: jumpEdge.get(cur) || false });
      cur = from.get(cur);
    }
    raw.reverse();
    const path = [];
    for (let k = 1; k < raw.length; k++) {
      const p = raw[k], prev = raw[k - 1], next = raw[k + 1];
      const turn = !next ||
        (next.i - p.i) !== (p.i - prev.i) || (next.j - p.j) !== (p.j - prev.j) ||
        Math.abs(next.h - p.h) > WALK_DH || p.jump || (next && next.jump);
      if (turn) {
        path.push({
          x: this.minX + (p.i + 0.5) * CELL, y: p.h, z: this.minZ + (p.j + 0.5) * CELL,
          jump: p.jump
        });
      }
    }
    if (path.length) { path[path.length - 1].x = tx; path[path.length - 1].z = tz; }
    return path.length ? path : null;
  }
}

// solid AABBによる視線判定: o→t の間に遮蔽があるか
export function losBlocked(o, t, solids) {
  const dx = t[0] - o[0], dy = t[1] - o[1], dz = t[2] - o[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.01) return false;
  const steps = Math.max(2, Math.ceil(len / 0.3));
  for (let k = 1; k < steps; k++) {
    const f = k / steps;
    const x = o[0] + dx * f, y = o[1] + dy * f, z = o[2] + dz * f;
    for (const s of solids) {
      if (x > s.minX && x < s.maxX && y > s.minY && y < s.maxY && z > s.minZ && z < s.maxZ) return true;
    }
  }
  return false;
}
