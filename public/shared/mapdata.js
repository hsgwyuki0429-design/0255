// ============================================================
// ============================================================

function B(x, y, z, w, h, d, c = 0x888888, m = 'stone', opt = {}) {
  return { x, y, z, w, h, d, c, m, ...opt };
}

function stairs(x, y, z, dir, width, steps, stepH, stepD, c, m = 'stone') {
  const out = [];
  for (let i = 0; i < steps; i++) {
    const t = i * stepD + stepD / 2;
    let sx = x, sz = z;
    if (dir === 'n') sz = z - t;
    else if (dir === 's') sz = z + t;
    else if (dir === 'e') sx = x + t;
    else sx = x - t;
    const isX = (dir === 'e' || dir === 'w');
    out.push(B(sx, y, sz, isX ? stepD + 0.02 : width, (i + 1) * stepH, isX ? width : stepD + 0.02, c, m));
  }
  return out;
}

function wallX(x1, x2, z, y, h, t, gaps, c, m = 'stone') {
  const out = []; let cur = x1;
  const gs = [...(gaps || [])].sort((a, b) => a[0] - b[0]);
  for (const [g1, g2] of gs) {
    if (g1 > cur + 0.01) out.push(B((cur + g1) / 2, y, z, g1 - cur, h, t, c, m));
    if (h > 2.3) out.push(B((g1 + g2) / 2, y + 2.1, z, g2 - g1, h - 2.1, t, c, m));
    cur = g2;
  }
  if (cur < x2 - 0.01) out.push(B((cur + x2) / 2, y, z, x2 - cur, h, t, c, m));
  return out;
}

function wallZ(z1, z2, x, y, h, t, gaps, c, m = 'stone') {
  const out = []; let cur = z1;
  const gs = [...(gaps || [])].sort((a, b) => a[0] - b[0]);
  for (const [g1, g2] of gs) {
    if (g1 > cur + 0.01) out.push(B(x, y, (cur + g1) / 2, t, h, g1 - cur, c, m));
    if (h > 2.3) out.push(B(x, y + 2.1, (g1 + g2) / 2, t, h - 2.1, g2 - g1, c, m));
    cur = g2;
  }
  if (cur < z2 - 0.01) out.push(B(x, y, (cur + z2) / 2, t, h, z2 - cur, c, m));
  return out;
}

function carveRock(boxes, rects, baseY, height, N, off, cA, cB) {
  const open = [];
  for (let i = 0; i < N; i++) {
    open.push(new Array(N).fill(false));
    for (let j = 0; j < N; j++) {
      const cx = off + i + 0.5, cz = off + j + 0.5;
      for (const [x1, x2, z1, z2] of rects) {
        if (cx > x1 && cx < x2 && cz > z1 && cz < z2) { open[i][j] = true; break; }
      }
    }
  }
  const used = open.map(row => row.map(v => v));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (used[i][j]) continue;
      let w = 1;
      while (i + w < N && !used[i + w][j]) w++;
      let d = 1;
      outer: while (j + d < N) {
        for (let k = 0; k < w; k++) if (used[i + k][j + d]) break outer;
        d++;
      }
      for (let a = 0; a < w; a++) for (let b = 0; b < d; b++) used[i + a][j + b] = true;
      const x = off + i + w / 2, z = off + j + d / 2;
      boxes.push(B(x, baseY, z, w, height, d, ((i + j) % 3 === 0) ? cB : cA));
    }
  }
}

// ---- 有機的な岩ジオメトリ用ヘルパー (ボックス限界の解除) ----
// すべて中心座標指定。deco(当たり判定なし)で「見た目」を自然な岩肌にする。
// 当たり判定は従来どおり別途の軸並行ボックスが担うので、CPUナビ/衝突は不変。

function mulberry(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// 岩塊 (任意軸に傾けた箱)。低ポリで安価に「ゴツゴツした岩の面」を作る。
function rock(boxes, cx, cy, cz, sx, sy, sz, col, ry = 0, rx = 0, rz = 0, mat = 'stone') {
  boxes.push({ x: cx, y: cy - sy / 2, z: cz, w: sx, h: sy, d: sz, c: col, m: mat, deco: 1, ry, rx, rz });
}

// 丸い岩 (楕円体)。裾の瓦礫や転石、天井のこぶに。seg/segH で低ポリ化。
function boulder(boxes, cx, cy, cz, sx, sy, sz, col, mat = 'stone', seg = 6, segH = 4) {
  boxes.push({ x: cx, y: cy - sy / 2, z: cz, w: sx, h: sy, d: sz, c: col, m: mat, deco: 1, shape: 'sph', seg, segH });
}

// 円柱の柱 (rt/rb で円錐・樽形にもなる)。opt.solid=true で当たり判定あり(石柱)。
function column(boxes, cx, y0, cz, rad, h, col, opt = {}) {
  const b = { x: cx, y: y0, z: cz, w: rad * 2, h, d: (opt.radZ ?? rad) * 2, c: col, m: opt.mat || 'stone',
    shape: 'cyl', rt: opt.rt ?? 1, rb: opt.rb ?? 1 };
  if (opt.seg) b.seg = opt.seg;
  if (!opt.solid) b.deco = 1;
  if (opt.glow) b.glow = 1;
  if (opt.ry) b.ry = opt.ry;
  boxes.push(b);
}

// 鍾乳石 (up=false: 天井 y から下へ) / 石筍 (up=true: 床 y から上へ)。円錐。
function drip(boxes, cx, y, cz, rad, h, up, col) {
  if (up) boxes.push({ x: cx, y, z: cz, w: rad * 2, h, d: rad * 2, c: col, m: 'stone', deco: 1, shape: 'cyl', rt: 0.05, rb: 1, seg: 7 });
  else boxes.push({ x: cx, y: y - h, z: cz, w: rad * 2, h, d: rad * 2, c: col, m: 'stone', deco: 1, shape: 'cyl', rt: 1, rb: 0.05, seg: 7 });
}

// rects で定義される「開いた空間」の占有グリッド (carveRock と同じ判定)。
function caveOpenGrid(rects, N, off) {
  const open = [];
  for (let i = 0; i < N; i++) {
    open.push(new Array(N));
    for (let j = 0; j < N; j++) {
      const cx = off + i + 0.5, cz = off + j + 0.5;
      let o = false;
      for (const [x1, x2, z1, z2] of rects) { if (cx > x1 && cx < x2 && cz > z1 && cz < z2) { o = true; break; } }
      open[i][j] = o;
    }
  }
  return open;
}

// 洞窟1層ぶんの有機的クラッディング。
//   open: この層の占有グリッド / above: 上の層の占有グリッド(天井判定用, null=全て岩)
//   壁面は「衝突面(セル境界)にほぼ面一で貼る傾いた岩ファセット」で覆い、平らな箱を
//   ゴツゴツした岩肌に見せる。装飾は通路側へほとんど出っ張らせない(当たり判定はAABBのまま)。
function cladCaveLevel(boxes, open, above, baseY, topY, N, off, cWall, cDark, seed, opt = {}) {
  const rng = mulberry(seed);
  const wallH = topY - baseY;
  const cMid = shade(cWall, 0.86), cLite = shade(cWall, 1.12);
  const shades = [cWall, cMid, cDark, cLite];
  const inb = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (!open[i][j]) continue;
      const cx = off + i + 0.5, cz = off + j + 0.5;
      // --- 壁面クラッディング (隣接セルが閉=岩の面) ---
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [di, dj] of nb) {
        const nopen = inb(i + di, j + dj) ? open[i + di][j + dj] : false;
        if (nopen) continue;
        const alongX = di === 0;                 // 壁が x 方向に伸びる
        const facePos = 0.5;                      // セル境界=衝突面
        // 壁面を覆う縦長ファセット。前面は衝突面付近、body は岩の中へ。高い壁は2枚。
        const nSeg = wallH > 6 ? 2 : (rng() < 0.4 ? 2 : 1);
        for (let s = 0; s < nSeg; s++) {
          const segH = wallH / nSeg;
          const bh = segH * (1.08 + rng() * 0.45);
          const cy = baseY + segH * (s + 0.5) + (rng() - 0.5) * 0.5;
          const bw = 0.95 + rng() * 0.85;          // 幅を狭めて面を割る(隣と重なる)
          const depth = 0.5 + rng() * 0.6;         // 岩の奥行(大半は壁内)
          const protr = 0.05 + rng() * 0.22;       // 通路側へのわずかな出っ張り
          const tilt = (rng() - 0.5) * 0.72;       // 傾きを強めて同一平面を避ける
          const off2 = (rng() - 0.5) * 0.5;        // 面に沿ってずらす
          const col = shades[(rng() * shades.length) | 0];
          const cxx = cx + di * (facePos - depth / 2 + protr) + (alongX ? off2 : 0);
          const czz = cz + dj * (facePos - depth / 2 + protr) + (alongX ? 0 : off2);
          rock(boxes, cxx, cy, czz, alongX ? bw : depth, bh, alongX ? depth : bw, col,
               alongX ? tilt * 0.5 : (rng() - 0.5) * 0.3, alongX ? tilt : 0, alongX ? 0 : tilt);
        }
        // 近接時の平面割れ防止: 小さな岩チップを面一で重ねる(安価な箱)
        if (rng() < 0.7) {
          const chh = 0.6 + rng() * 1.3, chw = 0.5 + rng() * 0.8, chd = 0.3 + rng() * 0.35;
          const cyc = baseY + wallH * (0.12 + rng() * 0.75);
          const t = (rng() - 0.5) * 0.7;
          rock(boxes, cx + di * (facePos - chd / 2 + 0.16), cyc, cz + dj * (facePos - chd / 2 + 0.16),
               alongX ? chw : chd, chh, alongX ? chd : chw, shades[(rng() * shades.length) | 0],
               alongX ? t * 0.6 : t * 0.3, alongX ? t : 0, alongX ? 0 : t);
        }
        // 中腹のふくらみ(丸い岩が壁から顔を出す)
        if (rng() < 0.28) {
          const rr = 0.7 + rng() * 0.9;
          const cyb = baseY + wallH * (0.25 + rng() * 0.5);
          boulder(boxes, cx + di * (facePos - rr * 0.35), cyb, cz + dj * (facePos - rr * 0.35),
                  alongX ? rr * 1.9 : rr, rr * 1.5, alongX ? rr : rr * 1.9, rng() < 0.4 ? cDark : cMid);
        }
        // 裾の転石(通路に少しはみ出す低い岩)
        if (rng() < 0.42) {
          const rr = 0.55 + rng() * 0.8;
          boulder(boxes, cx + di * (facePos - rr * 0.25) + (alongX ? (rng() - 0.5) * 0.6 : 0),
                  baseY + rr * 0.26,
                  cz + dj * (facePos - rr * 0.25) + (alongX ? 0 : (rng() - 0.5) * 0.6),
                  rr * 1.5, rr, rr * 1.5, rng() < 0.5 ? cDark : cWall);
        }
      }
      // --- 天井クラッディング (上の層が岩 = 天井がある) ---
      const roofed = above ? !above[i][j] : true;
      if (roofed && opt.ceiling && (i % 2 === 0) && (j % 2 === 0)) {
        if (rng() < 0.9) {
          const rr = 1.0 + rng() * 1.1;
          boulder(boxes, cx + (rng() - 0.5), topY - rr * 0.2, cz + (rng() - 0.5), rr * 2.0, rr * 1.2, rr * 2.0, rng() < 0.5 ? cDark : cMid);
        }
        if (rng() < 0.3) drip(boxes, cx + (rng() - 0.5) * 0.6, topY, cz + (rng() - 0.5) * 0.6, 0.13 + rng() * 0.16, 0.5 + rng() * 1.4, false, cDark);
      }
      // --- 床の岩・小石 (まばら、低い) ---
      if (opt.floor && rng() < 0.09) {
        const rr = 0.5 + rng() * 1.0;
        boulder(boxes, cx + (rng() - 0.5) * 0.8, baseY + 0.03, cz + (rng() - 0.5) * 0.8, rr, 0.15 + rng() * 0.14, rr * 0.85, rng() < 0.5 ? cDark : cMid);
      }
    }
  }
}

// 色を明暗させる (面取り風トリムや葉の陰影に使う)
function shade(hex, f) {
  const r = Math.min(255, Math.max(0, Math.round(((hex >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((hex >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((hex & 255) * f)));
  return (r << 16) | (g << 8) | b;
}

// 多数の小さな立方体で丸い樹冠/茂みを近似 (すべて deco = 当たり判定なし)。
// 角ばったキューブ1個ではなく細かいブロックの集合にして「もこもこ」した丸みを出す。
function canopy(boxes, cx, cz, baseY, rad, color, mat = 'leaf', colorB) {
  const ry = rad * 0.88;                 // 縦は少し潰した楕円体
  const cy = baseY + rad * 0.24;         // 樹冠の中心高さ
  const step = Math.max(0.32, rad * 0.46); // 小ブロック間隔 (小さいほど滑らか)
  const light = colorB !== undefined ? colorB : shade(color, 1.16);
  const dark = shade(color, 0.82);
  let n = (Math.round(cx * 91.7 + cz * 47.3 + baseY * 13.1) >>> 0);
  for (let gx = -rad; gx <= rad + 1e-3; gx += step) {
    for (let gy = -ry; gy <= ry + 1e-3; gy += step) {
      for (let gz = -rad; gz <= rad + 1e-3; gz += step) {
        const nx = gx / rad, ny = gy / ry, nz = gz / rad;
        const d = Math.hypot(nx, ny, nz);
        n = (n * 1664525 + 1013904223) >>> 0;
        const jit = n / 4294967296;            // 表面をゆらして塊感を消す
        if (d > 0.72 + jit * 0.36) continue;
        const sz = step * (1.6 - d * 0.5);      // 中心ほど大きく外周ほど小さく → 丸い輪郭
        const col = ny > 0.2 && jit > 0.42 ? light : (ny < -0.35 ? dark : color);
        boxes.push(B(cx + gx, cy + gy, cz + gz, sz, sz, sz, col, mat, { deco: 1 }));
      }
    }
  }
}

// 幹 (円柱・下部は当たり判定あり) + 立体樹冠。canopyColorB があれば明るい葉を混ぜる
function tree(boxes, tx, tz, trunkH, trunkW, canR, colA, colB) {
  const r = trunkW / 2;
  column(boxes, tx, 0, tz, r, trunkH, 0x6a4a34, { solid: true, seg: 8, rt: 0.72, rb: 1.0, mat: 'wood' });
  column(boxes, tx, 0, tz, r * 1.32, trunkW * 0.5, 0x5f4230, { seg: 8, rt: 0.66, rb: 1.08, mat: 'wood' }); // 根張り(deco)
  boxes.push(B(tx, trunkH, tz, trunkW * 0.8, canR * 0.42, trunkW * 0.8, 0x6a4a34, 'wood', { deco: 1 }));
  canopy(boxes, tx, tz, trunkH - canR * 0.18, canR, colA, 'leaf', colB);
}

// 花壇: 丸い縁石(またぎ越せる高さ)+ 土 + 丸い花の盛り (すべて deco)
function flowerBed(boxes, x, z, rad, col, colB) {
  column(boxes, x, 0, z, rad + 0.28, 0.28, 0x9a8466, { seg: 14, mat: 'stone' });
  column(boxes, x, 0.05, z, rad + 0.05, 0.24, 0x5a463a, { seg: 14, mat: 'dirt' });
  canopy(boxes, x, z, 0.34, rad, col, 'leaf', colB);
}

// 壁面(直線)に建築トリムを deco で付与し、のっぺりした面に陰影と密度を出す。
//   orient 'x': 壁がx方向に伸び面はz=fixed / 'z': 壁がz方向に伸び面はx=fixed
//   faceSign: 面を出す向き(+1 / -1)。wallHalf: 壁厚の半分(面位置)。
//   opt.floors: 水平モールを入れる高さ配列 / opt.top: 笠木の高さ(壁高) /
//   opt.pilaster: 付け柱の間隔(0で無し) / opt.skip: 付け柱を避ける[a,b]範囲配列
function facade(boxes, orient, a1, a2, fixed, faceSign, wallHalf, opt = {}) {
  const col = opt.col ?? 0xd8ceba;
  const trimCol = opt.trimCol ?? shade(col, 1.1);
  const baseCol = opt.baseCol ?? shade(col, 0.7);
  const put = (aa, bb, y, h, thick, c, out = 0) => {
    const fp = fixed + faceSign * (wallHalf + out + thick / 2);
    if (orient === 'x') boxes.push(B((aa + bb) / 2, y, fp, bb - aa, h, thick, c, 'stone', { deco: 1 }));
    else boxes.push(B(fp, y, (aa + bb) / 2, thick, h, bb - aa, c, 'stone', { deco: 1 }));
  };
  put(a1, a2, 0, 0.55, 0.16, baseCol);                              // 巾木
  for (const fy of (opt.floors || [])) put(a1, a2, fy - 0.16, 0.3, 0.12, trimCol);  // 各階の回り縁
  if (opt.top !== undefined) put(a1 - 0.12, a2 + 0.12, opt.top - 0.3, 0.42, 0.26, trimCol); // 笠木
  if (opt.pilaster || opt.pilasterAt) {
    const span = a2 - a1, top = opt.top ?? 4, pw = opt.pilasterW ?? 0.62;
    let ps = opt.pilasterAt;
    if (!ps) { ps = []; const cnt = Math.max(1, Math.round(span / opt.pilaster)); for (let i = 0; i <= cnt; i++) ps.push(a1 + span * i / cnt); }
    for (const p of ps) {
      if ((opt.skip || []).some(([s, e]) => p > s - pw / 2 && p < e + pw / 2)) continue;
      const y0 = opt.pilasterY0 ?? 0, hh = top - y0;
      if (orient === 'x') boxes.push(B(p, y0, fixed + faceSign * (wallHalf + 0.05), pw, hh, 0.2, trimCol, 'stone', { deco: 1 }));
      else boxes.push(B(fixed + faceSign * (wallHalf + 0.05), y0, p, 0.2, hh, pw, trimCol, 'stone', { deco: 1 }));
    }
  }
}

// 窓枠(細い縁取り)を deco で付ける。glassBox の位置とサイズに合わせる。
function windowFrame(boxes, x, y, z, w, h, orient, col = 0xf4efe4) {
  const t = 0.1, d = orient === 'x' ? 0.06 : w, dz = orient === 'x' ? w : 0.06;
  // orient 'x': 面はz固定(法線z) → 枠は x-y 平面。'z': 面はx固定。
  if (orient === 'x') {
    boxes.push(B(x, y + h / 2 + t, z, w + t * 2, t, 0.14, col, 'stone', { deco: 1 }));
    boxes.push(B(x, y - h / 2 - t, z, w + t * 2, t, 0.14, col, 'stone', { deco: 1 }));
    boxes.push(B(x - w / 2 - t, y, z, t, h, 0.14, col, 'stone', { deco: 1 }));
    boxes.push(B(x + w / 2 + t, y, z, t, h, 0.14, col, 'stone', { deco: 1 }));
  } else {
    boxes.push(B(x, y + h / 2 + t, z, 0.14, t, w + t * 2, col, 'stone', { deco: 1 }));
    boxes.push(B(x, y - h / 2 - t, z, 0.14, t, w + t * 2, col, 'stone', { deco: 1 }));
    boxes.push(B(x, y, z - w / 2 - t, 0.14, h, t, col, 'stone', { deco: 1 }));
    boxes.push(B(x, y, z + w / 2 + t, 0.14, h, t, col, 'stone', { deco: 1 }));
  }
}

// ============================================================
// ============================================================
function buildCave() {
  const boxes = [];
  const N = 112, OFF = -56, LH = 5;

  boxes.push(B(0, -0.5, 0, 114, 0.5, 114, 0x40352b, 'dirt'));

  const H = [-11, 11, -11, 11];
  const L0 = [
    H,
    [-3, 2, -27, -11],
    [-16, 13, -39, -27],
    [11, 27, -3, 3],
    [27, 40, -9, 9],
    [-2, 4, 11, 25],
    [-7, 19, 25, 39],
    [-27, -11, -4, 2],
    [-40, -27, -11, 7],
    [-35, -30, -30, -8],
    [-30, -16, -33, -28],
    [12, 18, -27, -19],
    [14, 30, -19, -14],
    [26, 33, -14, -9],
    [27, 33, 9, 21],
    [15, 33, 21, 26],
    [-31, -25, 7, 21],
    [-25, -9, 15, 21],
    [-11, -7, 21, 31],
    [4, 9, -19, -11],
    [4, 16, -19, -15],
    [-9, -4, 11, 19],
    [-20, -11, 28, 31],
    [-14, -10, -44, -39],
    [40, 44, -2, 2],
    [2, 6, 39, 44],
    [-44, -40, -2, 2],
    // --- 追加: 周回できるループ坑道と枝道 (行き止まりを作らず経路を複雑化) ---
    [9, 13, -19, -3],      // NE ループ: 北東トンネル網 ↔ 東の本坑
    [-13, -9, 2, 15],      // SW ループ: 西の本坑 ↔ 南西トンネル網
    [18, 24, -33, -27],    // 北へ回り込む枝道 (北の大空洞へ別ルート)
    [18, 22, -33, -19],    // 上を [14,30,-19,-14] につなぐ縦坑
    [-24, -18, 20, 26],    // 南西の小空洞 (西回廊と南をつなぐ)
    // --- v3.5 拡張: 外周を一周できる大回廊 + 四隅の新大空洞で複雑化・広域化 ---
    // 大チャンバーから外周回廊へ抜ける連絡坑 (北1本のみ。中層回廊ループを1箇所だけ割るので
    // ループは1本道として全連結を保ち、中層の分断ゼロ。外周は一周できる大escape回路)
    [4, 10, -52, -39],     // 北チャンバー ↔ 北外周
    // 外周大回廊 (床レベルを一周できるループ坑道。幅~5)
    [-52, 52, -52, -47],   // 北 外周
    [-52, 52, 47, 52],     // 南 外周
    [47, 52, -47, 47],     // 東 外周
    [-52, -47, -47, 47],   // 西 外周
    // 四隅の新空洞 (外周回廊に接続。中層回廊(±40-44)の床を削らないよう±44の外側に置く)
    [-53, -44, -53, -44],  // 北西 空洞
    [44, 53, -53, -44],    // 北東 空洞
    [44, 53, 44, 53],      // 南東 空洞
    [-53, -44, 44, 53],    // 南西 空洞
  ];

  const r1 = [[-14, 14, -14, -11], [-14, 14, 11, 14], [-14, -11, -11, 11], [11, 14, -11, 11]];
  const L1 = [
    [-44, 44, -44, -40],
    [-44, 44, 40, 44],
    [40, 44, -40, 40],
    [-44, -40, -40, 40],
    H, ...r1,
    [-14, -10, -44, -33],
    [30, 44, -2, 2],
    [2, 6, 33, 44],
    [-44, -30, -2, 2],
    [20, 24, -40, -24],
    [20, 34, -28, -24],
    [33, 37, -24, -6],
    [-34, -28, 19, 40],
    [-26, -22, -40, -31],
    [24, 28, 24, 40],
    [-16.2, -14, -14, -11],
    [14, 16.2, 11, 14],
  ];

  const L2 = [
    H, ...r1,
    [-18, 18, -18, -14],
    [-18, 18, 14, 18],
    [-18, -14, -14, 14],
    [14, 18, -14, 14],
    [-2, 2, -44, -18],
    [-2, 2, 18, 44],
    [-30, -18, -2, 2],
    [18, 30, -2, 2],
    [30, 44, -2, 2],
    [-44, -30, -2, 2],
  ];

  carveRock(boxes, L0, 0, LH, N, OFF, 0x483a2e, 0x544435);
  carveRock(boxes, L1, LH, LH, N, OFF, 0x554637, 0x61503e);
  carveRock(boxes, L2, LH * 2, LH, N, OFF, 0x625340, 0x6f5f49);

  // ---- 有機的クラッディング: 平らな箱壁/天井を自然な岩肌に見せる ----
  const O0 = caveOpenGrid(L0, N, OFF), O1 = caveOpenGrid(L1, N, OFF), O2 = caveOpenGrid(L2, N, OFF);
  cladCaveLevel(boxes, O0, O1, 0, LH, N, OFF, 0x4a3d31, 0x392f26, 1337, { ceiling: true, floor: true, density: 0.62 });
  cladCaveLevel(boxes, O1, O2, LH, LH * 2, N, OFF, 0x574739, 0x453930, 2551, { ceiling: true, floor: true, density: 0.5 });
  cladCaveLevel(boxes, O2, null, LH * 2, LH * 3, N, OFF, 0x63513e, 0x4e4032, 4021, { ceiling: true, floor: true, density: 0.44 });

  const RS = 0x5c4c3a;
  const SH = 5 / 16, SD = 0.6;
  boxes.push(...stairs(-12, 0, -34.5, 'n', 3.4, 16, SH, SD, RS));
  boxes.push(...stairs(34.5, 0, 0, 'e', 3.4, 16, SH, SD, RS));
  boxes.push(...stairs(4, 0, 34.5, 's', 3.4, 16, SH, SD, RS));
  boxes.push(...stairs(-34.5, 0, 0, 'w', 3.4, 16, SH, SD, RS));
  boxes.push(...stairs(-9.7, 0, 4.6, 'n', 2.6, 16, SH, SD, RS));
  boxes.push(...stairs(9.7, 0, -4.6, 's', 2.6, 16, SH, SD, RS));
  boxes.push(...stairs(-6.4, LH, -12.5, 'w', 2.6, 16, SH, SD, RS));
  boxes.push(...stairs(6.4, LH, 12.5, 'e', 2.6, 16, SH, SD, RS));

  boxes.push(B(-29.5, 0, 19.8, 2.6, 2, 2.2, RS));
  boxes.push(B(-24, 0, -31.8, 2.6, 2, 2.2, RS));
  boxes.push(B(35, 0, -7, 2.6, 2, 2.4, RS));
  boxes.push(B(26, 0, 24.8, 2.6, 2, 2.4, RS));
  boxes.push(B(0, LH, -42, 2.6, 2.5, 2, RS));
  boxes.push(B(0, LH, 42, 2.6, 2.5, 2, RS));

  // 中央の岩柱を丸い石柱(円柱)に。当たり判定は従来と同じ軸並行AABB。表面に流れ石を重ねる。
  for (const [px, pz, pr] of [[-6, -6, 1.1], [6, 6, 1.0]]) {
    column(boxes, px, 0, pz, pr, 10, 0x554435, { solid: true, seg: 12, rt: 0.78, rb: 1.0 });
    for (let k = 0; k < 5; k++) {
      const yy = 1 + k * 1.9, rr = pr * (1.5 - k * 0.12);
      boulder(boxes, px, yy, pz, rr * 2, 1.7, rr * 2, k % 2 ? 0x4c4030 : 0x574839);
    }
    drip(boxes, px, 10, pz, pr * 0.9, 1.6, false, 0x453930);   // 柱上部から垂れる石
  }
  boxes.push(B(0, 0, 6.5, 2.6, 1.0, 2.6, 0x5c4c3a), B(0, 1.0, 6.5, 1.6, 0.9, 1.6, 0x554435));
  boulder(boxes, 0, 1.9, 6.5, 2.4, 1.3, 2.4, 0x50412f);
  boxes.push(B(9, 0, -9, 2, 2.2, 2, 0x5c4c3a));
  boulder(boxes, 9, 2.2, -9, 2.3, 1.2, 2.3, 0x50412f);
  boxes.push(B(9, 2.2, -9, 1.8, 0.5, 1.8, 0x66ddff, 'crystal', { bounce: 1, glow: 1 }));
  boxes.push(B(-6, 0, -33, 1.9, 0.5, 1.9, 0x8f7bff, 'crystal', { bounce: 1, glow: 1 }));
  boxes.push(B(-36, 0, 3, 1.9, 0.5, 1.9, 0x66ddff, 'crystal', { bounce: 1, glow: 1 }));
  boxes.push(B(0, 0, 36, 1.9, 0.5, 1.9, 0x8f7bff, 'crystal', { bounce: 1, glow: 1 }));

  // 地底湖。水面はやや低くし、縁を岩で不規則に縁取って四角さを消す。
  const pools = [[34, 2, 9, 10, 0x2b6f8f, 1], [-34, -3, 6, 5, 0x2b6f8f, 0], [-30.5, 0, 3, 3, 0x2b6f8f, 0]];
  const poolR = mulberry(717);
  for (const [wx, wz, ww, wd, wc, glow] of pools) {
    boxes.push(B(wx, -0.08, wz, ww, 0.2, wd, wc, 'water', glow ? { deco: 1, glow: 1 } : { deco: 1 }));
    const per = Math.ceil((ww + wd) * 0.9);
    for (let k = 0; k < per; k++) {
      const t = k / per, edge = Math.floor(poolR() * 4);
      let ex, ez;
      if (edge === 0) { ex = wx - ww / 2; ez = wz - wd / 2 + t * wd; }
      else if (edge === 1) { ex = wx + ww / 2; ez = wz - wd / 2 + t * wd; }
      else if (edge === 2) { ex = wx - ww / 2 + t * ww; ez = wz - wd / 2; }
      else { ex = wx - ww / 2 + t * ww; ez = wz + wd / 2; }
      const rr = 0.5 + poolR() * 0.7;
      boulder(boxes, ex + (poolR() - 0.5) * 0.5, 0.1, ez + (poolR() - 0.5) * 0.5, rr * 1.4, rr * 0.8, rr * 1.4, poolR() < 0.5 ? 0x4a3d30 : 0x574839);
    }
  }

  for (let i = 0; i < 5; i++) boxes.push(B(8.7 + i * 1.5, 0, 30.4, 0.22, 3.0, 0.22, 0xe8e0d2, 'bone', { deco: 1 }));
  boxes.push(B(11.5, 3.0, 33.5, 7, 0.3, 7, 0xd8cfc0, 'bone', { deco: 1 }));
  boxes.push(B(4, 0, 36, 2.6, 0.8, 1.2, 0xd8cfc0, 'bone', { deco: 1 }));
  boxes.push(B(16, 0, 27, 1.4, 1.0, 1.4, 0xe8e0d2, 'bone', { deco: 1 }));

  // 石筍 (円錐 + 根元の岩)。以前の積み箱ではなく本物の尖った岩に。
  const stal = [[-13, -35], [8, -31], [-33, -25], [30, -16], [-15, 17], [22, 23], [-36, 5], [36, 6], [12, 34], [-4, 28]];
  for (const [sx, sz] of stal) {
    const h = 2.0 + ((sx * 7 + sz * 13 + 100) % 10) / 6;
    drip(boxes, sx, 0, sz, 0.55, h, true, 0x51443a);
    boulder(boxes, sx + 0.3, 0.3, sz - 0.2, 1.3, 0.75, 1.3, 0x4a3d30);
    drip(boxes, sx + 0.75, 0, sz + 0.45, 0.3, 0.9 + ((sx * 3 + sz) % 4) * 0.25, true, 0x51443a);
  }

  // 鍾乳石 (天井から下向きの円錐)
  const stalac = [[0, -18], [-1, -24], [13, -1], [19, 1], [24, -17], [-13, 0], [-19, -2], [1, 14], [-1, 20], [-22, -30], [29, 14], [-27, 12], [-9, 29], [20, 23], [30, -12]];
  for (const [sx, sz] of stalac) {
    const h = 1.1 + (((sx * 5 + sz * 11) % 8) + 8) % 8 / 8;
    drip(boxes, sx, LH, sz, 0.34, h, false, 0x4a3d30);
    drip(boxes, sx + 0.5, LH, sz + 0.35, 0.2, h * 0.6, false, 0x4a3d30);
  }

  const moss = [[-8, -8], [7, -4], [-10, -34], [10, -30], [30, 7], [-38, 5], [0, 27], [14, 36], [16, -24], [-28, 17]];
  for (const [mx, mz] of moss) {
    boxes.push(B(mx, 0, mz, 1.6 + (((mx + mz) % 3) + 3) % 3 * 0.5, 0.05, 1.3, 0x3f6a4a, 'leaf', { deco: 1 }));
    boxes.push(B(mx + 1.1, 0, mz - 0.8, 0.8, 0.04, 0.7, 0x4a7a55, 'leaf', { deco: 1 }));
  }

  boxes.push(B(-3, 0, 33, 1.0, 0.22, 0.28, 0x5a4028, 'wood', { deco: 1 }));
  boxes.push(B(-3, 0, 33, 0.28, 0.22, 1.0, 0x5a4028, 'wood', { deco: 1 }));
  boxes.push(B(-3, 0.18, 33, 0.42, 0.55, 0.42, 0xffa030, 'crystal', { deco: 1, glow: 1 }));
  boxes.push(B(-3, 0.6, 33, 0.2, 0.35, 0.2, 0xffd980, 'crystal', { deco: 1, glow: 1 }));

  boxes.push(B(2, 0, 30, 1.8, 0.3, 0.5, 0xd8cfc0, 'bone', { deco: 1 }));
  boxes.push(B(6.5, 0, 36.5, 0.9, 0.65, 0.9, 0xe8e0d2, 'bone', { deco: 1 }));
  boxes.push(B(17, 0, 33, 2.2, 0.35, 0.7, 0xd8cfc0, 'bone', { deco: 1 }));
  boxes.push(B(-5.5, 0, 28, 0.5, 0.9, 0.5, 0xe8e0d2, 'bone', { deco: 1 }));

  for (const [wx, wz] of [[31, -1], [36, 4], [33, 6], [-34, -2]]) {
    boxes.push(B(wx, 0.15, wz, 0.28, 0.7, 0.28, 0x55e8c0, 'crystal', { deco: 1, glow: 1 }));
    boxes.push(B(wx + 0.4, 0.15, wz - 0.3, 0.2, 0.45, 0.2, 0x55e8c0, 'crystal', { deco: 1, glow: 1 }));
  }

  const crys = [
    [0, 0, -9.5, 0x66ffee], [-9, 0, 3, 0xbb88ff], [16, 0, 0, 0x88aaff], [-16, 0, 0, 0x66ffee],
    [-34, 0, -33, 0xbb88ff], [-6, 0, -36, 0x88ffcc], [37, 0, -6, 0x66ffee], [-36, 0, -8, 0xbb88ff],
    [-4, 0, 36, 0x88ffcc], [16, 0, 36, 0xffaa66],
    [-16, 10, -16, 0x66ffee], [16, 10, 16, 0xbb88ff], [12, 5, -12.8, 0x88aaff], [-12, 5, 12.8, 0x88ffcc]
  ];
  // クリスタルの群晶: 尖った六角柱(先細り円柱)を数本、少し傾けて生やす。
  const cryR = mulberry(555);
  for (const [cx, cy, cz, cc] of crys) {
    const shards = 3 + (cryR() * 3 | 0);
    for (let s = 0; s < shards; s++) {
      const ang = cryR() * Math.PI * 2, dist = cryR() * 0.55;
      const h = 0.9 + cryR() * 1.4, rad = 0.16 + cryR() * 0.18;
      const tilt = (cryR() - 0.5) * 0.5;
      boxes.push({ x: cx + Math.cos(ang) * dist, y: cy, z: cz + Math.sin(ang) * dist,
        w: rad * 2, h, d: rad * 2, c: cc, m: 'crystal', deco: 1, glow: 1,
        shape: 'cyl', rt: 0.04, rb: 1, seg: 6, rx: Math.sin(ang) * tilt, rz: -Math.cos(ang) * tilt });
    }
  }

  // 中央シャフト頂部の岩ドーム — 丸い天井で黒い抜けを塞ぎ、鍾乳石を垂らす (deco=当たり判定なし)
  boxes.push(B(0, 15.4, 0, 38, 2.0, 38, 0x2a2119, 'stone', { deco: 1 }));   // 頂部の岩盤(抜け防止)
  boulder(boxes, 0, 17.5, 0, 40, 9, 40, 0x2a2119);                          // 伏せた大ドーム
  boulder(boxes, 0, 16.0, 0, 30, 6, 30, 0x241d16);
  const domeR = mulberry(909);
  for (let a = 0; a < 16; a++) {
    const ang = domeR() * Math.PI * 2, rad = 3 + domeR() * 8.5;
    drip(boxes, Math.cos(ang) * rad, 14.4, Math.sin(ang) * rad, 0.24 + domeR() * 0.42, 1.4 + domeR() * 3.0, false, 0x2a2119);
    if (domeR() < 0.5) boulder(boxes, Math.cos(ang) * rad, 14.2, Math.sin(ang) * rad, 2.0 + domeR() * 1.6, 1.2, 2.0 + domeR() * 1.6, 0x241d16);
  }

  // ---- v3.5 外周大回廊 & 四隅空洞の装飾 (すべて deco=当たり判定なし → ナビ不変) ----
  // 四隅空洞: 群晶クリスタル + 石筍 + 転石 + 地底湖 で本物の洞窟チャンバーに
  const outR = mulberry(3131);
  const cornerCols = [0x66ffee, 0xbb88ff, 0x88ffcc, 0xffaa66];
  const corners = [[-48.5, -48.5], [48.5, -48.5], [48.5, 48.5], [-48.5, 48.5]];
  corners.forEach(([cx, cz], ci) => {
    const cc = cornerCols[ci];
    // 群晶: 尖った六角柱を数本
    for (let s = 0; s < 5; s++) {
      const ang = outR() * Math.PI * 2, dist = outR() * 1.4;
      const h = 1.0 + outR() * 1.8, rad = 0.18 + outR() * 0.22, tilt = (outR() - 0.5) * 0.5;
      boxes.push({ x: cx + Math.cos(ang) * dist, y: 0, z: cz + Math.sin(ang) * dist,
        w: rad * 2, h, d: rad * 2, c: cc, m: 'crystal', deco: 1, glow: 1,
        shape: 'cyl', rt: 0.04, rb: 1, seg: 6, rx: Math.sin(ang) * tilt, rz: -Math.cos(ang) * tilt });
    }
    // 石筍・転石を散らす
    for (let s = 0; s < 4; s++) {
      const px = cx + (outR() - 0.5) * 7, pz = cz + (outR() - 0.5) * 7;
      drip(boxes, px, 0, pz, 0.4 + outR() * 0.3, 1.4 + outR() * 1.6, true, 0x51443a);
      boulder(boxes, px + 0.4, 0.25, pz - 0.3, 1.0 + outR(), 0.6, 1.0 + outR(), outR() < 0.5 ? 0x4a3d30 : 0x574839);
    }
    // 天井から鍾乳石
    for (let s = 0; s < 3; s++) drip(boxes, cx + (outR() - 0.5) * 6, LH, cz + (outR() - 0.5) * 6, 0.28, 1.0 + outR() * 1.4, false, 0x4a3d30);
  });
  // 四隅の地底湖 (北西と南東)
  for (const [wx, wz] of [[-48, -48], [48, 48]]) {
    boxes.push(B(wx, -0.08, wz, 6, 0.2, 5, 0x2b6f8f, 'water', { deco: 1, glow: 1 }));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      boulder(boxes, wx + Math.cos(a) * 3.3, 0.1, wz + Math.sin(a) * 2.8, 1.1, 0.6, 1.1, outR() < 0.5 ? 0x4a3d30 : 0x574839);
    }
  }
  // 外周大回廊: 石筍・転石・光るキノコ・クリスタルを一定間隔で配し道標に
  for (let t = 0; t < 40; t++) {
    const ang = (t / 40) * Math.PI * 2;
    const rx = 49.5 + (outR() - 0.5) * 2.4, rz = 49.5 + (outR() - 0.5) * 2.4;
    const px = Math.cos(ang) * rx, pz = Math.sin(ang) * rz;
    // 回廊の中心線付近に低い装飾のみ (通行を塞がない)
    if (outR() < 0.5) drip(boxes, px, 0, pz, 0.32, 1.0 + outR() * 1.2, true, 0x51443a);
    else boulder(boxes, px, 0.12, pz, 0.8 + outR() * 0.6, 0.35, 0.8 + outR() * 0.6, outR() < 0.5 ? 0x4a3d30 : 0x574839);
    if (outR() < 0.22) {
      const gc = cornerCols[(outR() * 4) | 0];
      boxes.push(B(px, 0.15, pz, 0.26, 0.6 + outR() * 0.4, 0.26, gc, 'crystal', { deco: 1, glow: 1 }));
    }
    if (outR() < 0.28) drip(boxes, px, LH, pz, 0.22, 0.8 + outR(), false, 0x4a3d30);
    if (outR() < 0.14) { // 光るキノコ
      boxes.push(B(px, 0, pz, 0.5, 0.05, 0.5, 0x3f6a4a, 'leaf', { deco: 1 }));
      boxes.push(B(px, 0.1, pz, 0.16, 0.5, 0.16, 0x9fe0b0, 'crystal', { deco: 1, glow: 1 }));
    }
  }

  return {
    id: 'cave', name: '地下洞窟', boxes,
    sky: 0x07070c, skyTop: 0x05050b, skyBottom: 0x12121e, skyExp: 1.1,
    fog: { color: 0x0a0a12, near: 10, far: 66 },
    ambient: 0.5, sun: 0.35, sunColor: 0x8899cc,
    lights: [
      { x: 0, y: 4, z: -9.5, c: 0x66ffee, i: 30, d: 24 }, { x: 16, y: 2, z: 0, c: 0x88aaff, i: 24, d: 20 },
      { x: -16, y: 2, z: 0, c: 0x66ffee, i: 24, d: 20 }, { x: -34, y: 2, z: -33, c: 0xbb88ff, i: 26, d: 22 },
      { x: 37, y: 2, z: -6, c: 0x66ffee, i: 24, d: 20 }, { x: -4, y: 2, z: 36, c: 0x88ffcc, i: 26, d: 22 },
      { x: -16, y: 12, z: -16, c: 0x66ffee, i: 24, d: 22 }, { x: 16, y: 12, z: 16, c: 0xbb88ff, i: 24, d: 22 }
    ],
    bounds: { minX: -55, maxX: 55, minZ: -55, maxZ: 55 },
    jail: { x: 11.5, y: 0, z: 33.5, w: 6, d: 6 },
    spawns: {
      oni: [[0, 0.1, 0], [2.5, 0.1, 2.5], [-2.5, 0.1, -2.5], [2.5, 0.1, -2.5], [-2.5, 0.1, 2.5], [0, 0.1, 4], [4, 0.1, 0], [-4, 0.1, 0]],
      run: [
        [-6, 0.1, -30], [6, 0.1, -33], [34, 0.1, 6], [-34, 0.1, -6], [0, 0.1, 32], [20, 0.1, -16],
        [-16, 0.1, 18], [-30, 5.1, -42], [30, 5.1, 42], [16, 10.1, 0], [-32, 0.1, -18], [30, 0.1, 15],
        [-45, 0.1, -45], [45, 0.1, -45], [45, 0.1, 45], [-45, 0.1, 45], [0, 0.1, -49], [49, 0.1, 0]
      ]
    }
  };
}

// ============================================================
// ============================================================
function buildMall() {
  const WALL = 0xf2efe9, F1C = 0xe8e4dc, F2C = 0xdfdbd2, SHOP = 0xcfc8bc, BACK = 0xb8b2a6;
  const boxes = [];
  const F2 = 5;
  const WH = 11;

  boxes.push(B(0, -0.5, 0, 114, 0.5, 62, F1C, 'tile'));
  // v3.5: 東側に第3の核「ホームセンター(大型専門店)」を増築 → 床と外周壁を東へ拡張
  boxes.push(B(64.85, -0.5, 0, 18.3, 0.5, 62, 0xe4e0d6, 'tile'));   // 増築棟の床(少し色違い)
  boxes.push(...wallX(-56, 74, -29.7, 0, WH, 0.8, [], WALL), ...wallX(-56, 74, 29.7, 0, WH, 0.8, [], WALL));
  boxes.push(...wallZ(-30, 30, -55.7, 0, WH, 0.8, [], WALL));
  // 旧東外壁は増築棟との内壁に。大きな入口を3つ開ける(食品コート↔ホームセンター)
  boxes.push(...wallZ(-30, 30, 55.7, 0, WH, 0.8, [[-22, -15], [-6, 1], [9, 16]], WALL));
  boxes.push(...wallZ(-30, 30, 73.7, 0, WH, 0.8, [], WALL));        // 新・東外壁

  boxes.push(...wallZ(-30, 30, -34, 0, 4.6, 0.5, [[-23, -21], [-18, -13], [-3, 3], [13, 18], [21, 23]], WALL));
  boxes.push(...wallX(-55.7, -34, -26, 0, 3.2, 0.4, [[-52, -50], [-40, -38]], BACK));
  boxes.push(B(-45, 0, -24.9, 14, 1.2, 1.4, 0xd8e2e8, 'metal'));
  for (let r = 0; r < 6; r++) {
    const gz = -18 + r * 6;
    boxes.push(B(-49.5, 0, gz, 7, 1.9, 1.0, 0xbcc8d0, 'goods'));
    boxes.push(B(-40.5, 0, gz, 7, 1.9, 1.0, 0xbcc8d0, 'goods'));
  }
  boxes.push(B(-54.9, 0, -10, 1.2, 1.9, 26, 0x9fb8c8, 'goods'));
  boxes.push(B(-50, 0, 24, 4.5, 0.9, 3, 0x7aa86a, 'wood'), B(-42, 0, 24, 4.5, 0.9, 3, 0x7aa86a, 'wood'));
  boxes.push(B(-36, 0, -8, 2.6, 0.95, 1.1, 0xd0d5da, 'metal'), B(-36, 0, 8, 2.6, 0.95, 1.1, 0xd0d5da, 'metal'));
  boxes.push(B(-45, 3.3, -24.5, 16, 1.1, 0.3, 0xc42a76, 'sign', { deco: 1, glow: 1 }));

  // 円形の噴水: 丸い水盤 + 縁 + 中央の段付き柱 (水盤は当たり判定あり=AABBは従来と同じ)
  column(boxes, 2, 0, 0, 2.6, 0.65, 0xdfe8ee, { solid: true, seg: 20, mat: 'tile' });
  column(boxes, 2, 0.5, 0, 2.6, 0.2, 0xeef4f8, { seg: 20, mat: 'tile' });     // 縁
  column(boxes, 2, 0.55, 0, 2.1, 0.16, 0x58b8e8, { seg: 20, mat: 'water', glow: 1 });
  column(boxes, 2, 0.65, 0, 0.42, 1.7, 0xdfe8ee, { seg: 12, mat: 'tile', rt: 0.7 });
  column(boxes, 2, 1.5, 0, 0.75, 0.18, 0xeef4f8, { seg: 14, mat: 'tile' });   // 上段の受け皿
  column(boxes, 2, 1.68, 0, 0.55, 0.12, 0x58b8e8, { seg: 14, mat: 'water', glow: 1 });
  for (const [px, pz] of [[-5, -12], [9, -12], [-5, 12], [9, 12]]) {
    boxes.push(B(px, 0, pz, 1.8, 0.75, 1.8, 0x8a7a64, 'wood'));
    canopy(boxes, px, pz, 0.75, 0.72, 0x4a9b52);
  }
  for (const [bx, bz] of [[-5, -5], [9, 5], [-20, 5.8], [24, -5.8], [-30, -5.8], [34, 5.8]]) {
    boxes.push(B(bx, 0, bz, 2.6, 0.55, 0.8, 0xb08a5f, 'wood'));
  }
  boxes.push(B(8, 0, -3, 2.2, 0.45, 2.2, 0xff8fb3, 'metal', { bounce: 1, glow: 1 }));
  for (const lx of [-24, -14, 18, 28, 38]) boxes.push(B(lx, 10.4, 0, 8, 0.15, 1.2, 0xfff2dd, 'sign', { deco: 1, glow: 1 }));

  const shopColors = [0xff6b81, 0x54c2ff, 0xffd166, 0x8ce99a, 0xffa94d, 0x9b8cff];
  const shopSegs = [[-34, -22], [-22, -8], [12, 24], [24, 34], [34, 42]];
  for (const s of [-1, 1]) {
    const front = s * 7, back = s * 20, band = s * 24;
    for (let i = 0; i < shopSegs.length; i++) {
      const [x1, x2] = shopSegs[i];
      const cx = (x1 + x2) / 2;
      boxes.push(...wallX(x1, x2, front, 0, 4.6, 0.5, [[x1 + 1.5, x1 + 4], [x2 - 4, x2 - 1.5]], SHOP));
      boxes.push(...wallX(x1, x2, back, 0, 4.6, 0.4, [[cx - 0.8, cx + 0.8]], BACK));
      // x1側は前セグメントのx2と共有する場合は描かない (壁の完全重複=Zファイティング防止)
      if (x1 !== -34 && (i === 0 || shopSegs[i - 1][1] !== x1)) boxes.push(...wallZ(Math.min(front, back), Math.max(front, back), x1, 0, 4.6, 0.4, [], SHOP));
      if (x2 !== 42) boxes.push(...wallZ(Math.min(front, back), Math.max(front, back), x2, 0, 4.6, 0.4, [], SHOP));
      boxes.push(B(cx, 4.7, front, (x2 - x1) - 3, 1.1, 0.3, shopColors[(i + (s === 1 ? 3 : 0)) % 6], 'sign', { deco: 1, glow: 1 }));
    }
    boxes.push(...wallX(-8, 12, s * 16, 0, 4.6, 0.5, [[0, 6]], SHOP));
    boxes.push(B(-3.5, 0, s * 18, 5, 1.0, 1.2, 0xc9a06a, 'wood'));
    boxes.push(B(9, 0, s * 18, 4, 1.0, 1.2, 0xc9a06a, 'wood'));
    boxes.push(B(-3.5, 4.7, s * 16, 6, 1.0, 0.3, shopColors[s === 1 ? 4 : 1], 'sign', { deco: 1, glow: 1 }));
    boxes.push(...wallX(-34, 42, band, 0, 4.6, 0.4, [[0.5, 2.5], [3.5, 5.5], [-27, -25], [33, 36]], BACK));
    const tz1 = s * 24, tz2 = s * 30;
    boxes.push(...wallZ(Math.min(tz1, tz2), Math.max(tz1, tz2), -6, 0, 4.6, 0.4, [], BACK));
    boxes.push(...wallZ(Math.min(tz1, tz2), Math.max(tz1, tz2), 3, 0, 4.6, 0.4, [], BACK));
    boxes.push(...wallZ(Math.min(tz1, tz2), Math.max(tz1, tz2), 12, 0, 4.6, 0.4, [], BACK));
    for (let st = 0; st < 3; st++) {
      boxes.push(B(-4.5 + st * 1.6, 0, s * 28.6, 0.12, 1.6, 2.2, 0xd8d2c8, 'metal'));
      boxes.push(B(5 + st * 1.6, 0, s * 28.6, 0.12, 1.6, 2.2, 0xd8d2c8, 'metal'));
    }
    boxes.push(B(-1.5, 0, s * 25.5, 3.2, 0.85, 0.6, 0xe8e8ee, 'tile'));
    boxes.push(B(7.5, 0, s * 25.5, 3.2, 0.85, 0.6, 0xe8e8ee, 'tile'));
    boxes.push(B(-16, 0, s * 27, 3, 1.4, 2.2, 0xc8a878, 'wood'));
    boxes.push(B(-30, 0, s * 27, 2.4, 1.1, 2, 0xc8a878, 'wood'));
    boxes.push(B(20, 0, s * 27, 2.6, 1.3, 2, 0xc8a878, 'wood'));
  }
  boxes.push(...wallZ(-24, -20, 42, 0, 4.6, 0.4, [[-23, -21]], BACK));
  boxes.push(...wallZ(20, 24, 42, 0, 4.6, 0.4, [[21, 23]], BACK));
  boxes.push(...wallZ(-30, -24, 42, 0, 4.6, 0.4, [], BACK));
  boxes.push(...wallZ(24, 30, 42, 0, 4.6, 0.4, [], BACK));

  for (const [cx, seg] of [[-28, 0], [-15, 1]]) {
    for (let r = 0; r < 2; r++) {
      boxes.push(B(cx - 2.5, 0, -17 + r * 4.5, 1.0, 1.7, 3.2, 0x7fa8d0, 'goods'));
      boxes.push(B(cx + 2.5, 0, -17 + r * 4.5, 1.0, 1.7, 3.2, 0x7fa8d0, 'goods'));
    }
    boxes.push(B(cx, 0, -9.5, 3, 0.95, 1.0, 0x9c8f80, 'wood'));
  }
  for (const cx of [18, 29, 38]) {
    boxes.push(B(cx - 2, 0, -16, 2.6, 1.35, 1.2, 0xd0aab8, 'metal'));
    boxes.push(B(cx + 2, 0, -12, 2.6, 1.35, 1.2, 0xb8c8d8, 'metal'));
    boxes.push(B(cx, 0, -9.3, 2.6, 0.95, 1.0, 0x9c8f80, 'wood'));
  }
  for (const cx of [-28, -15]) {
    boxes.push(B(cx, 0, 13, 5.5, 1.5, 0.9, 0x8a7f72, 'goods'));
    boxes.push(B(cx, 0, 17, 5.5, 1.5, 0.9, 0x8a7f72, 'goods'));
  }
  for (const [tx, tz] of [[16, 13], [20, 16], [16, 18], [30, 13], [37, 16], [30, 18]]) {
    boxes.push(B(tx, 0, tz, 1.4, 0.75, 1.4, 0xc9a06a, 'wood'));
  }

  boxes.push(...wallZ(-20, 20, 42, 0, 4.6, 0.5, [[-7, 7]], WALL));
  boxes.push(B(54.6, 0, -14, 1.6, 1.05, 9, 0x9c8f80, 'wood'));
  boxes.push(B(54.6, 0, 2, 1.6, 1.05, 9, 0x9c8f80, 'wood'));
  boxes.push(B(54.6, 0, 16, 1.6, 1.05, 8, 0x9c8f80, 'wood'));
  boxes.push(B(54.8, 3.2, -14, 0.3, 1.0, 8, 0xff6b47, 'sign', { deco: 1, glow: 1 }));
  boxes.push(B(54.8, 3.2, 2, 0.3, 1.0, 8, 0xffd166, 'sign', { deco: 1, glow: 1 }));
  boxes.push(B(54.8, 3.2, 16, 0.3, 1.0, 7, 0x8ce99a, 'sign', { deco: 1, glow: 1 }));
  for (const [tx, tz] of [[46, -16], [50, -12], [46, -7], [51, -3], [46, 2], [50, 7], [46, 12], [50, 17], [46, 21]]) {
    boxes.push(B(tx, 0, tz, 1.6, 0.78, 1.6, 0xc9a06a, 'wood'));
    boxes.push(B(tx + 1.3, 0, tz, 0.5, 0.48, 0.5, 0x8a6a44, 'wood'), B(tx - 1.3, 0, tz, 0.5, 0.48, 0.5, 0x8a6a44, 'wood'));
  }
  boxes.push(B(50, 0, 26, 2.2, 0.45, 2.2, 0x66ddff, 'metal', { bounce: 1, glow: 1 }));
  boxes.push(B(45, 0, 26.5, 1.2, 0.6, 1.2, 0xff8fb3, 'metal'), B(46.8, 0, 27.5, 1.0, 0.9, 1.0, 0x8ce99a, 'metal'));
  boxes.push(B(47, 0, -27.5, 6, 1.9, 1.1, 0xdd4444, 'vend'));

  boxes.push(...stairs(-5.5, 0, -11, 'e', 2.2, 20, 0.25, 0.5, 0x99a0aa, 'metal'));
  boxes.push(...stairs(9.5, 0, 11, 'w', 2.2, 20, 0.25, 0.5, 0x99a0aa, 'metal'));
  boxes.push(...stairs(44, 0, -14, 'e', 2.4, 20, 0.25, 0.5, 0x99a0aa, 'metal'));
  boxes.push(...stairs(-38, 0, -27, 'w', 2.4, 20, 0.25, 0.5, BACK));

  const slab = (x1, x2, z1, z2) => boxes.push(B((x1 + x2) / 2, F2 - 0.4, (z1 + z2) / 2, x2 - x1, 0.4, z2 - z1, F2C, 'tile'));
  slab(-56, -48.4, -30, 30);
  slab(-48.4, -37.6, -30, -28.2);
  slab(-48.4, -37.6, -25.8, 30);
  slab(-37.6, -34, -30, 30);
  slab(-34, 43.4, -30, -12.2);
  slab(-34, -6.2, -12.2, -9.8); slab(4.7, 43.4, -12.2, -9.8);
  slab(-34, 43.4, -9.8, -8);
  slab(-34, -6, -8, -1.5); slab(10, 43.4, -8, -1.5);
  slab(-34, 43.4, -1.5, 1.5);
  slab(-34, -6, 1.5, 8); slab(10, 43.4, 1.5, 8);
  slab(-34, 43.4, 8, 9.8);
  slab(-34, -0.7, 9.8, 12.2); slab(10.2, 43.4, 9.8, 12.2);
  slab(-34, 43.4, 12.2, 30);
  slab(43.4, 56, -30, -15.2);
  slab(54.2, 56, -15.2, -12.8);
  slab(43.4, 56, -12.8, -8);
  slab(43.4, 44, -8, 8); slab(54, 56, -8, 8);
  slab(43.4, 56, 8, 30);

  const RAIL = 0xc8ccd4;
  boxes.push(...wallZ(-8, -1.5, -6, F2, 1.0, 0.22, [], RAIL, 'rail'), ...wallZ(1.5, 8, -6, F2, 1.0, 0.22, [], RAIL, 'rail'));
  boxes.push(...wallZ(-8, -1.5, 10, F2, 1.0, 0.22, [], RAIL, 'rail'), ...wallZ(1.5, 8, 10, F2, 1.0, 0.22, [], RAIL, 'rail'));
  boxes.push(...wallX(-6, 10, -8, F2, 1.0, 0.22, [[-6, -5.2], [3.5, 5.2]], RAIL, 'rail'));
  boxes.push(...wallX(-6, 10, 8, F2, 1.0, 0.22, [[-1.2, 0.6], [9.2, 10]], RAIL, 'rail'));
  boxes.push(...wallX(-6, 10, -1.5, F2, 1.0, 0.22, [], RAIL, 'rail'), ...wallX(-6, 10, 1.5, F2, 1.0, 0.22, [], RAIL, 'rail'));
  boxes.push(...wallX(44, 54, -8, F2, 1.0, 0.22, [], RAIL, 'rail'), ...wallX(44, 54, 8, F2, 1.0, 0.22, [], RAIL, 'rail'));
  boxes.push(...wallZ(-8, 8, 44, F2, 1.0, 0.22, [], RAIL, 'rail'), ...wallZ(-8, 8, 54, F2, 1.0, 0.22, [[-14.8, -13]], RAIL, 'rail'));

  boxes.push(...wallZ(-30, 30, -34, F2, 4, 0.5, [[-23, -21], [-18, -13], [-3, 3], [13, 18], [21, 23]], WALL));
  for (let r = 0; r < 4; r++) {
    boxes.push(B(-49, F2, -15 + r * 8, 6, 1.4, 1.0, 0xd0aab8, 'metal'));
    boxes.push(B(-40, F2, -15 + r * 8, 6, 1.4, 1.0, 0xb8c8d8, 'metal'));
  }
  boxes.push(B(-52, F2, 24, 5, 2.1, 4, 0xcfc8bc, 'shelf'));
  boxes.push(B(-45, F2 + 4.6, -24.5, 14, 1.2, 0.3, 0xc42a76, 'sign', { deco: 1, glow: 1 }));
  for (const s of [-1, 1]) {
    const front = s * 7, back = s * 20, band = s * 24;
    boxes.push(...wallX(-34, -8, front, F2, 4, 0.5, [[-30, -26], [-16, -12]], SHOP));
    boxes.push(...wallX(12, 42, front, F2, 4, 0.5, [[14, 17], [25, 28], [36, 39]], SHOP));
    boxes.push(...wallX(-34, 42, back, F2, 4, 0.4, [[-0.8, 0.8], [-22, -20.5], [30, 31.5]], BACK));
    boxes.push(...wallX(-8, 12, s * 16, F2, 4, 0.5, [[0, 6]], SHOP));
    boxes.push(...wallX(-34, 42, band, F2, 4, 0.4, [[0.5, 2.5], [3.5, 5.5]], BACK));
    boxes.push(...wallZ(Math.min(tzz(s, 24), tzz(s, 30)), Math.max(tzz(s, 24), tzz(s, 30)), -6, F2, 4, 0.4, [], BACK));
    boxes.push(...wallZ(Math.min(tzz(s, 24), tzz(s, 30)), Math.max(tzz(s, 24), tzz(s, 30)), 12, F2, 4, 0.4, [], BACK));
    for (let st = 0; st < 3; st++) boxes.push(B(-4.5 + st * 1.6, F2, s * 28.6, 0.12, 1.6, 2.2, 0xd8d2c8, 'metal'));
    boxes.push(B(-1.5, F2, s * 25.5, 3.2, 0.85, 0.6, 0xe8e8ee, 'tile'));
  }
  for (let r = 0; r < 3; r++) {
    boxes.push(B(-28, F2, -17.5 + r * 3.6, 8, 2.1, 0.9, 0x8a6a44, 'books'));
    boxes.push(B(-15, F2, -17.5 + r * 3.6, 8, 2.1, 0.9, 0x8a6a44, 'books'));
  }
  boxes.push(B(-21, F2 + 4.6, -7, 10, 1.0, 0.3, 0x2a9d5c, 'sign', { deco: 1, glow: 1 }));
  for (const cx of [18, 30, 38]) {
    boxes.push(B(cx, F2, -15, 3, 1.35, 1.1, 0xb8c8d8, 'metal'));
    boxes.push(B(cx, F2, -10.5, 3, 0.95, 1.0, 0x9c8f80, 'wood'));
  }
  const gameCols = [0xff5f7a, 0x54c2ff, 0xffd166, 0x9b8cff, 0x66e0aa];
  let gi = 0;
  for (const gx of [-30, -25, -20, -15, -10]) {
    boxes.push(B(gx, F2, 11.5, 1.7, 1.75, 1.7, gameCols[gi % 5], 'arcade', { glow: 1 }));
    boxes.push(B(gx, F2, 17.5, 1.7, 1.75, 1.7, gameCols[(gi + 2) % 5], 'arcade', { glow: 1 }));
    gi++;
  }
  boxes.push(B(-21, F2 + 4.6, 7, 12, 1.1, 0.3, 0xffb14d, 'sign', { deco: 1, glow: 1 }));
  for (const [x1, x2] of [[12, 22], [23, 32], [33, 42]]) {
    const cx = (x1 + x2) / 2;
    boxes.push(B(cx - 2, F2, 12, 1.4, 0.78, 1.4, 0xc9a06a, 'wood'));
    boxes.push(B(cx + 2, F2, 16, 1.4, 0.78, 1.4, 0xc9a06a, 'wood'));
    boxes.push(B(cx, F2, 19, 2.6, 0.95, 0.9, 0x9c8f80, 'wood'));
    boxes.push(B(cx, F2 + 4.6, 7, (x2 - x1) - 2, 1.0, 0.3, shopColors[(cx | 0) % 6], 'sign', { deco: 1, glow: 1 }));
  }
  boxes.push(B(49, F2, -20, 2.6, 0.55, 1.1, 0xb08a5f, 'wood'), B(49, F2, 20, 2.6, 0.55, 1.1, 0xb08a5f, 'wood'));
  boxes.push(B(45, F2, -24, 1.4, 0.7, 1.4, 0x8a7a64, 'wood'));
  boxes.push(B(45, F2 + 0.7, -24, 0.9, 1.3, 0.9, 0x3f9b4f, 'leaf', { deco: 1 }));

  for (const sx of [-30, -10, 14, 32]) {
    boxes.push(B(sx, 4.1, 0, 2.6, 0.7, 0.12, 0xf8f8f4, 'sign', { deco: 1, glow: 1 }));
    boxes.push(B(sx, 4.8, 0, 0.08, 0.35, 0.08, 0x9aa2ac, 'metal', { deco: 1 }));
  }
  boxes.push(B(-3.5, 0, 4.5, 0.25, 1.7, 1.1, 0x2a3856, 'sign', { deco: 1, glow: 1 }));
  const gachaCols = [0xff6b81, 0x54c2ff, 0xffd166, 0x8ce99a];
  for (let i = 0; i < 4; i++) boxes.push(B(-7.4, 0, -9.5 + i * 1.1, 0.6, 1.3, 0.6, gachaCols[i], 'metal', { deco: 1, glow: 1 }));
  boxes.push(B(-33.4, 0, -5.4, 0.7, 1.7, 0.9, 0x3a6fd8, 'metal', { deco: 1, glow: 1 }));
  boxes.push(B(-33.4, 0, -4.1, 0.7, 1.7, 0.9, 0xd83a5e, 'metal', { deco: 1, glow: 1 }));
  for (const [px, pz] of [[-14, -5.8], [-24, 5.8], [30, -5.8], [40, 5.8]]) {
    boxes.push(B(px, 0, pz, 1.2, 0.55, 1.2, 0x8a7a64, 'wood', { deco: 1 }));
    boxes.push(B(px, 0.55, pz, 0.8, 1.2, 0.8, 0x3f9b4f, 'leaf', { deco: 1 }));
  }
  boxes.push(B(2, 0.9, 0, 0.35, 1.7, 0.35, 0x9fdcf8, 'crystal', { deco: 1, glow: 1 }));
  boxes.push(B(2, 2.4, 0, 0.7, 0.25, 0.7, 0x9fdcf8, 'crystal', { deco: 1, glow: 1 }));
  for (let i = 0; i < 3; i++) boxes.push(B(-34.9, 0, -20.2 + i * 0.8, 0.8, 1.0, 0.7, 0xb8c4d0, 'metal', { deco: 1 }));
  for (const bx of [-4, 2, 8]) boxes.push(B(bx, 10.6, 0, 0.4, 0.3, 30, 0xd8dde4, 'metal', { deco: 1 }));
  for (const s of [-1, 1]) {
    boxes.push(B(1.5, 4.0, s * 15.6, 0.9, 0.6, 0.15, 0x3aa0e8, 'sign', { deco: 1, glow: 1 }));
    boxes.push(B(4.5, 4.0, s * 15.6, 0.9, 0.6, 0.15, 0xe86a8a, 'sign', { deco: 1, glow: 1 }));
  }
  boxes.push(B(44.8, 0, -3.5, 1.2, 1.0, 0.8, 0x9c8f80, 'wood', { deco: 1 }));

  boxes.push(B(35, 0, -26, 3.5, 0.9, 1.0, 0x707a90, 'metal'));
  boxes.push(B(38.5, 0, -28.5, 2.2, 1.6, 1.2, 0x8a94a8, 'metal'));
  boxes.push(B(35, 4.7, -24, 6, 1.0, 0.3, 0xff5555, 'sign', { deco: 1, glow: 1 }));

  // ==== v3.5 増築棟: ホームセンター(大型専門店) ====
  // 縦(z方向)に走る陳列棚(ゴンドラ)を3列。各列を横通路で3分割 → 追いかけっこ向きの棚迷路。
  const HC_SHELF = 0xbcb0a0, HC_SHELF2 = 0xa8b8c4;
  const shelfSegs = [[-24, -9], [-6, 5], [8, 24]];   // 横通路 z:-9..-6, 5..8 を空ける
  for (const [ax, col] of [[60, HC_SHELF], [64, HC_SHELF2], [68, HC_SHELF]]) {
    for (const [z1, z2] of shelfSegs) {
      boxes.push(B(ax, 0, (z1 + z2) / 2, 1.1, 2.0, z2 - z1, col, 'goods'));
      boxes.push(B(ax, 2.0, (z1 + z2) / 2, 1.1, 0.25, z2 - z1, shade(col, 0.85), 'metal', { deco: 1 })); // 棚上の枠
    }
  }
  // レジ列(入口の内側)
  for (const cz of [-20, -12, -3, 6, 14, 22]) {
    boxes.push(B(58.2, 0, cz, 1.4, 1.0, 1.3, 0xd0d5da, 'metal'));
    boxes.push(B(58.2, 1.0, cz, 0.5, 0.5, 0.5, 0x2a3240, 'metal', { deco: 1 }));   // レジ端末
  }
  // 家電の展示(冷蔵庫・洗濯機っぽい白物家電の島)
  for (let i = 0; i < 4; i++) {
    boxes.push(B(71, 0, -22 + i * 3.0, 1.6, 2.0, 1.4, 0xeef0f2, 'metal'));
    boxes.push(B(71, 2.0, -22 + i * 3.0, 1.6, 0.05, 1.4, 0x9fb0c0, 'metal', { deco: 1 }));
  }
  // 木材・パイプラック(NE、背の高い縦材=隠れながら抜けられる細い列)
  for (let i = 0; i < 4; i++) boxes.push(B(71.5, 0, 12 + i * 1.4, 1.2, 3.2, 0.5, 0xb98a54, 'wood'));
  // ガーデンセンター(SE寄り): 観葉植物の鉢を並べる(deco)
  for (const [px, pz] of [[71, 20], [71, 24], [67, 26], [62, 26], [57.5, 26], [71.5, 27]]) {
    boxes.push(B(px, 0, pz, 1.0, 0.5, 1.0, 0x8a7a64, 'wood', { deco: 1 }));
    canopy(boxes, px, pz, 0.5, 0.66, 0x4a9b52);
  }
  // 入口・通路のサイン(deco glow)
  for (const [sx, sz, sc] of [[55.9, -18.5, 0xffb14d], [55.9, -2.5, 0x54c2ff], [55.9, 12.5, 0x66e0aa]])
    boxes.push(B(sx, 5.2, sz, 0.25, 1.0, 5.5, sc, 'sign', { deco: 1, glow: 1 }));
  for (const ax of [60, 64, 68]) boxes.push(B(ax, 5.4, 0, 1.0, 0.7, 6, 0xf8f8f4, 'sign', { deco: 1, glow: 1 }));
  boxes.push(B(64, 6.4, -26, 12, 1.4, 0.4, 0xff7a2e, 'sign', { deco: 1, glow: 1 }));  // 店名看板
  // ショッピングカート(入口付近・deco)
  for (const [cx, cz] of [[57, -24], [57.7, -24.5], [57, 27], [57.7, 27.5]]) {
    boxes.push(B(cx, 0, cz, 0.6, 0.9, 1.0, 0xc0c8d0, 'metal', { deco: 1 }));
  }
  // 中央にトランポリン(モール名物)と積み上げパレット
  boxes.push(B(64, 0, -22, 2.2, 0.45, 2.2, 0x66ddff, 'metal', { bounce: 1, glow: 1 }));
  boxes.push(B(64, 0, 22, 2.0, 0.9, 1.6, 0xcaa06a, 'wood'));
  boxes.push(B(64, 0.9, 22, 1.6, 0.7, 1.2, 0xb8905a, 'wood'));
  // 増築棟の天井梁
  for (const bz of [-16, 0, 16]) boxes.push(B(64.85, 10.5, bz, 17, 0.4, 0.6, shade(WALL, 0.9), 'stone', { deco: 1 }));

  // ---- モール外周壁のトリム(巾木・2F帯・付け柱・最上部コーニス) ----
  const MT = { col: WALL, trimCol: shade(WALL, 0.94), baseCol: 0xbfb8ab, floors: [F2], top: WH };
  facade(boxes, 'x', -56, 74, -29.7, 1, 0.4, { ...MT, pilaster: 8 });   // 北 外壁
  facade(boxes, 'x', -56, 74, 29.7, -1, 0.4, { ...MT, pilaster: 8 });   // 南 外壁
  facade(boxes, 'z', -30, 30, -55.7, 1, 0.4, { ...MT, pilaster: 8.5 }); // 西 外壁
  facade(boxes, 'z', -30, 30, 73.7, -1, 0.4, { ...MT, pilaster: 8.5 }); // 東 外壁(増築)
  // 天井の梁を増やして単調さを消す(deco)
  for (const bz of [-22, -11, 11, 22]) boxes.push(B(0, 10.5, bz, 108, 0.4, 0.6, shade(WALL, 0.9), 'stone', { deco: 1 }));
  for (const bx of [-40, -20, 20, 40]) boxes.push(B(bx, 10.5, 0, 0.6, 0.4, 58, shade(WALL, 0.9), 'stone', { deco: 1 }));

  return {
    id: 'mall', name: 'ショッピングモール', boxes,
    sky: 0x252a34, skyTop: 0x141826, skyBottom: 0x2c3340, skyExp: 0.9,
    skySun: { dir: [0.35, 0.62, -0.7], color: 0xaeb8d6, size: 0.02, glow: 0.14 },
    fog: { color: 0x2a303c, near: 34, far: 140 },
    ambient: 0.78, sun: 0.62, sunColor: 0xfff2dd,
    lights: [
      { x: 2, y: 8, z: 0, c: 0xffeecc, i: 34, d: 34 }, { x: -45, y: 7, z: 0, c: 0xffeecc, i: 24, d: 28 },
      { x: 49, y: 8, z: 0, c: 0xffeecc, i: 26, d: 28 }, { x: -20, y: 7, z: 0, c: 0xffeecc, i: 18, d: 22 },
      { x: 26, y: 7, z: 0, c: 0xffeecc, i: 18, d: 22 }, { x: 64, y: 8, z: -8, c: 0xffeecc, i: 26, d: 30 },
      { x: 64, y: 8, z: 16, c: 0xffeecc, i: 22, d: 26 }
    ],
    bounds: { minX: -55, maxX: 73, minZ: -29, maxZ: 29 },
    jail: { x: 35.5, y: 0, z: -27, w: 6, d: 3.5 },
    spawns: {
      oni: [[2, 0.1, -4.5], [5.5, 0.1, 0], [-1.5, 0.1, 0], [2, 0.1, 4.5], [5.5, 0.1, 4.5], [-1.5, 0.1, -4.5], [5.5, 0.1, -4.5], [-1.5, 0.1, 4.5]],
      run: [
        [-45, 0.1, 0], [-50, 0.1, -20], [-51, 0.1, -28], [50, 0.1, 12], [48, 0.1, -20],
        [-28, 0.1, -13], [18, 0.1, -13], [-28, 0.1, 15], [18, 0.1, 13],
        [-20, 5.1, -13], [-20, 5.1, 13], [30, 5.1, 13],
        [62, 0.1, -12], [70, 0.1, 0], [62, 0.1, 16], [58, 0.1, 24], [71, 0.1, -26]
      ]
    }
  };
}
function tzz(s, v) { return s * v; }

// ============================================================
// ============================================================
function buildSchool() {
  const WALL = 0xe6ddca, CORR = 0xcabfa8, CLS = 0xd8ceba, GYMC = 0xc8b494, SLAB = 0xb8ad96, FENCE = 0x8a9aa8;
  const boxes = [];
  const FH = 4.2;
  const FLOORS = 4;
  const ROOF = FH * FLOORS;
  boxes.push(B(0, -0.5, 0, 106, 0.5, 82, 0xb99a6b, 'dirt'));
  // v3.5: 校庭を南へ拡張(陸上トラック・グラウンド・部室棟)→ 地面と外周フェンスを南へ延長
  boxes.push(B(0, -0.5, 46, 106, 0.5, 14, 0xb59468, 'dirt'));   // 南グラウンドの地面(z39..53)
  boxes.push(...wallX(-52, 52, -39.7, 0, 2.2, 0.5, [], FENCE, 'fence'), ...wallX(-52, 52, 52.7, 0, 2.2, 0.5, [], FENCE, 'fence'));
  boxes.push(...wallZ(-40, 53, -51.7, 0, 2.2, 0.5, [], FENCE, 'fence'), ...wallZ(-40, 53, 51.7, 0, 2.2, 0.5, [], FENCE, 'fence'));


  boxes.push(B(0, 0, -31, 68, 0.12, 14, 0x9aa4ae, 'tile'));
  boxes.push(B(-27, 0, -8, 14, 0.12, 32, 0x9aa4ae, 'tile'));
  boxes.push(B(27, 0, -8, 14, 0.12, 32, 0x9aa4ae, 'tile'));

  const stepH = FH / 14, stepD = 0.42;
  for (const s of [-1, 1]) {
    const laneA = s * 29.9, laneB = s * 27.7;
    for (let fl = 0; fl < FLOORS; fl++) {
      const Y = fl * FH;
      if (fl % 2 === 0) boxes.push(...stairs(laneA, Y, -29.4, 'n', 2.2, 14, stepH, stepD, CORR));
      else boxes.push(...stairs(laneB, Y, -35.5, 's', 2.2, 14, stepH, stepD, CORR));
    }
  }

  for (let fl = 1; fl <= FLOORS; fl++) {
    const Y = fl * FH, isRoof = fl === FLOORS;
    const c = isRoof ? 0xb0b8c0 : SLAB;
    const holeLaneA = fl % 2 === 1;
    boxes.push(B(0, Y - 0.35, -33, 44, 0.35, 10, c, 'tile'));
    boxes.push(B(0, Y - 0.35, -26, 68, 0.35, 4, c, 'tile'));
    boxes.push(B(-27, Y - 0.35, -8, 14, 0.35, 32, c, 'tile'));
    boxes.push(B(27, Y - 0.35, -8, 14, 0.35, 32, c, 'tile'));
    for (const s of [-1, 1]) {
      boxes.push(B(s * 28, Y - 0.35, -36.8, 12, 0.35, 2.4, c, 'tile'));
      boxes.push(B(s * 28, Y - 0.35, -28.75, 12, 0.35, 1.5, c, 'tile'));
      boxes.push(B(s * 32.5, Y - 0.35, -32.55, 3, 0.35, 6.1, c, 'tile'));
      boxes.push(B(s * 24.3, Y - 0.35, -32.55, 4.6, 0.35, 6.1, c, 'tile'));
      if (holeLaneA) boxes.push(B(s * 27.7, Y - 0.35, -32.55, 2.2, 0.35, 6.1, c, 'tile'));
      else boxes.push(B(s * 29.9, Y - 0.35, -32.55, 2.2, 0.35, 6.1, c, 'tile'));
    }
  }

  for (let fl = 0; fl < FLOORS; fl++) {
    const Y = fl * FH, is1F = fl === 0;
    boxes.push(...wallX(-34, 34, -38, Y, FH, 0.5, is1F ? [[-2, 2]] : [], WALL));
    boxes.push(...wallZ(-38, -24, -34, Y, FH, 0.5, [], WALL));
    boxes.push(...wallZ(-24, 8, -34, Y, FH, 0.5, [], WALL));
    boxes.push(...wallZ(-38, -24, 34, Y, FH, 0.5, [], WALL));
    boxes.push(...wallZ(-24, 8, 34, Y, FH, 0.5, [], WALL));
    boxes.push(...wallX(-34, -20, 8, Y, FH, 0.5, is1F ? [[-23.5, -20.8]] : [], WALL));
    boxes.push(...wallX(20, 34, 8, Y, FH, 0.5, is1F ? [[20.8, 23.5]] : [], WALL));
    const doors = is1F ? [[-14, -10], [10, 14]] : [];
    boxes.push(...wallX(-20, 20, -24, Y, 0.9, 0.5, doors, WALL));
    boxes.push(...wallX(-20, 20, -24, Y + 1.9, FH - 1.9, 0.5, [], WALL));
    for (const px of [-20, -10, 0, 10, 20]) boxes.push(B(px, Y + 0.9, -24, 0.7, 1.0, 0.5, WALL));
    for (const s of [-1, 1]) {
      const wd = is1F ? [[-16, -13], [0, 3]] : [];
      boxes.push(...wallZ(-24, 8, s * 20, Y, 0.9, 0.5, wd, WALL));
      boxes.push(...wallZ(-24, 8, s * 20, Y + 1.9, FH - 1.9, 0.5, [], WALL));
      for (const pz of [-24, -16, -8, 0, 8]) boxes.push(B(s * 20, Y + 0.9, pz, 0.5, 1.0, 0.7, WALL));
    }
    const roomsX = is1F ? [[-22, -11], [-11, 0], [0, 22]] : [[-22, -11], [-11, 0], [0, 11], [11, 22]];
    const gaps = [];
    for (const [x1, x2] of roomsX) gaps.push([x1 + 1.5, x1 + 3.5], [x2 - 3.5, x2 - 1.5]);
    gaps.push([-31, -29], [-25.5, -23.5], [23.5, 25.5], [29, 31]);
    boxes.push(...wallX(-34, 34, -28, Y, FH, 0.4, gaps, CLS));
    const divs = is1F ? [-22, -11, 0, 22] : [-22, -11, 0, 11, 22];
    for (const dx of divs) boxes.push(...wallZ(-38, -28, dx, Y, FH, 0.4, [], CLS));
    if (is1F) {
      for (const sz of [-35.6, -33.2, -30.8]) {
        boxes.push(B(5.5, Y, sz, 7, 2.0, 0.8, 0x8a6a44, 'books'));
        boxes.push(B(15.5, Y, sz, 7, 2.0, 0.8, 0x8a6a44, 'books'));
      }
      boxes.push(B(4, Y, -29.3, 3.2, 0.75, 1.1, 0xc9a878, 'wood'));
      boxes.push(B(17, Y, -29.3, 3.2, 0.75, 1.1, 0xc9a878, 'wood'));
      boxes.push(B(10.5, Y + 3.0, -28, 6, 0.8, 0.3, 0x2a9d5c, 'sign', { deco: 1, glow: 1 }));
      boxes.push(B(-16.5, Y, -33, 5, 0.78, 2.4, 0xc9a878, 'wood'));
      boxes.push(B(-6, Y, -35, 2.2, 0.6, 4, 0xe8e8f0, 'tile'));
    } else if (fl < 3) {
      for (const [x1, x2] of roomsX) {
        const cx = (x1 + x2) / 2;
        for (const [dx, dz] of [[-2.5, -34.5], [0, -34.5], [2.5, -34.5], [-2.5, -31.5], [0, -31.5], [2.5, -31.5]])
          boxes.push(B(cx + dx, Y, dz, 1.5, 0.75, 1.1, 0xc9a878, 'wood'));
        boxes.push(B(cx, Y, -36.8, 2.0, 0.85, 0.9, 0x8a6a44, 'wood'));
      }
    } else {
      for (const [x1, x2] of roomsX) boxes.push(B((x1 + x2) / 2, Y, -36.9, 5, 1.8, 0.8, 0x8a92a0, 'locker'));
      boxes.push(B(-16.5, Y, -32, 2.6, 1.0, 1.6, 0x2a2a30, 'wood'));
    }
    for (const s of [-1, 1]) {
      boxes.push(...wallZ(-24, 8, s * 24, Y, FH, 0.4, [[-22, -20], [-14, -12], [-8, -6], [-2, 0], [4, 6]], CLS));
      boxes.push(...wallX(Math.min(s * 24, s * 34), Math.max(s * 24, s * 34), -24, Y, FH, 0.4, [], CLS));
      boxes.push(...wallX(Math.min(s * 24, s * 34), Math.max(s * 24, s * 34), -16, Y, FH, 0.4, [], CLS));
      boxes.push(...wallX(Math.min(s * 24, s * 34), Math.max(s * 24, s * 34), -4, Y, FH, 0.4, [], CLS));
      for (let st = 0; st < 4; st++) boxes.push(B(s * (26 + st * 1.5), Y, -17.1, 0.12, 1.6, 1.9, 0xd8d2c8, 'metal'));
      boxes.push(B(s * 28.5, Y, -23.3, 4, 0.85, 0.6, 0xe8e8ee, 'tile'));
      boxes.push(B(s * 29, Y, -10, 3.2, 0.8, 1.4, 0xc9a878, 'wood'));
      boxes.push(B(s * 29, Y, 3, 3.2, 0.8, 1.4, 0xc9a878, 'wood'));
    }
  }

  boxes.push(...wallX(-34, 34, -38, ROOF, 1.1, 0.3, [], FENCE, 'fence'));
  boxes.push(...wallX(-20, 20, -24, ROOF, 1.1, 0.3, [], FENCE, 'fence'));
  boxes.push(...wallX(-34, -20, 8, ROOF, 1.1, 0.3, [], FENCE, 'fence'));
  boxes.push(...wallX(20, 34, 8, ROOF, 1.1, 0.3, [], FENCE, 'fence'));
  boxes.push(...wallZ(-38, 8, -34, ROOF, 1.1, 0.3, [], FENCE, 'fence'));
  boxes.push(...wallZ(-38, 8, 34, ROOF, 1.1, 0.3, [], FENCE, 'fence'));
  boxes.push(...wallZ(-24, 8, -20, ROOF, 1.1, 0.3, [], FENCE, 'fence'));
  boxes.push(...wallZ(-24, 8, 20, ROOF, 1.1, 0.3, [], FENCE, 'fence'));
  boxes.push(B(-12, ROOF, -34, 3.2, 2.8, 3.2, 0x98a2ac, 'metal'));
  boxes.push(B(10, ROOF, -34, 5, 0.6, 2, 0xb0b8c0, 'metal'));

  // 中庭の池: 楕円の水盤 + 自然石の縁取り
  boxes.push({ x: 0, y: 0, z: -14, w: 6.5, h: 0.32, d: 4.5, c: 0xbfd8e8, m: 'tile', shape: 'cyl', seg: 20 });
  boxes.push({ x: 0, y: 0.28, z: -14, w: 5.2, h: 0.12, d: 3.2, c: 0x58b8e8, m: 'water', deco: 1, glow: 1, shape: 'cyl', seg: 20 });
  const pondR = mulberry(4242);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, rx = 3.4 + pondR() * 0.3, rz = 2.4 + pondR() * 0.3;
    const rr = 0.35 + pondR() * 0.35;
    boulder(boxes, Math.cos(a) * rx, 0.12, -14 + Math.sin(a) * rz, rr * 1.5, rr, rr * 1.5, pondR() < 0.5 ? 0x9a8f80 : 0x7d7566);
  }
  for (const [px, pz] of [[-12, -18], [12, -18], [-12, -4], [12, -4]]) {
    boxes.push(B(px, 0, pz, 2.2, 0.6, 2.2, 0x8a6a44, 'wood'));
    canopy(boxes, px, pz, 0.6, 0.78, 0x4a9b52);
  }
  for (const [tx, tz] of [[-6, 3], [6, 3]]) {
    tree(boxes, tx, tz, 2.6, 0.7, 1.9, 0xe89ab8, 0xf9d0e0);
  }
  for (const [bx, bz] of [[-3, -19], [3, -19], [-16, -10], [16, -10]]) boxes.push(B(bx, 0, bz, 2.4, 0.5, 0.8, 0xaa8866, 'wood'));
  // 中庭の花壇(彩りと密度を出す。当たり判定なし)
  for (const [fx, fz, fc, fb] of [[-16, 3, 0xe4586a, 0xffd166], [16, 3, 0xf4a63a, 0xfff0a0], [-16, -20, 0xd05ac0, 0xffb3e6], [16, -20, 0x6a8ef4, 0xbfe0ff]])
    flowerBed(boxes, fx, fz, 0.9, fc, fb);

  boxes.push(B(-34, 0, 24, 24, 0.12, 20, 0xd8b06a, 'wood'));
  boxes.push(...wallX(-46, -22, 14, 0, 7.5, 0.5, [[-40, -37], [-28, -25]], GYMC));
  boxes.push(...wallX(-46, -22, 34, 0, 7.5, 0.5, [], GYMC));
  boxes.push(...wallZ(14, 34, -46, 0, 7.5, 0.5, [], GYMC));
  boxes.push(...wallZ(14, 34, -22, 0, 7.5, 0.5, [[21, 24]], GYMC));
  boxes.push(B(-43.5, 0, 24, 4, 1.1, 14, 0xb08a54, 'wood'));
  // ステージへ上がる階段はステージ本体の東側に配置(以前は本体に埋まって登れなかった)
  boxes.push(...stairs(-39.4, 0, 24, 'w', 3.4, 5, 0.22, 0.5, 0xc0965c, 'wood'));
  boxes.push(B(-32, 0, 30, 1.3, 1.0, 1.3, 0xcc6655, 'wood'), B(-28, 0, 18, 1.3, 1.3, 1.3, 0xcc6655, 'wood'));
  boxes.push(B(-34, 6.2, 16, 1.8, 1.2, 0.3, 0xffffff, 'metal', { deco: 1 }));
  boxes.push(B(-34, 6.2, 32, 1.8, 1.2, 0.3, 0xffffff, 'metal', { deco: 1 }));
  boxes.push(...wallX(-27, -22, 28, 0, 3.0, 0.4, [[-26.2, -24.2]], 0x9a8a74));
  boxes.push(...wallZ(28, 34, -27, 0, 3.0, 0.4, [], 0x9a8a74));
  boxes.push(B(-23.5, 0, 33, 2.5, 0.9, 1.2, 0x8a7a64, 'wood'));

  boxes.push(B(35, 0, 25, 22, 0.12, 18, 0xb08a54, 'wood'));
  boxes.push(B(33, 0.12, 25, 16, 0.1, 14, 0x9fb27a, 'tatami'));
  boxes.push(...wallX(24, 46, 16, 0, 5.5, 0.5, [[28, 31], [39, 42]], GYMC));
  boxes.push(...wallX(24, 46, 34, 0, 5.5, 0.5, [], GYMC));
  boxes.push(...wallZ(16, 34, 24, 0, 5.5, 0.5, [[22, 25]], GYMC));
  boxes.push(...wallZ(16, 34, 46, 0, 5.5, 0.5, [], GYMC));
  boxes.push(B(45.2, 3.6, 25, 0.6, 0.7, 3.2, 0x8a6a44, 'wood', { deco: 1 }));
  boxes.push(B(43.5, 0, 30.5, 1.5, 1.7, 1.5, 0x8a4a3a, 'wood'));
  boxes.push(B(43.5, 0, 19.5, 2.6, 1.2, 0.8, 0x8a6a44, 'wood'));
  boxes.push(B(35, 4.6, 16, 8, 0.8, 0.3, 0x8060c0, 'sign', { deco: 1, glow: 1 }));

  boxes.push(B(8, 0, 18, 4.2, 0.95, 4.2, 0xd07070, 'metal'));
  boxes.push(B(8, 0.95, 18, 2.8, 0.95, 2.8, 0xd0a070, 'metal'));
  boxes.push(B(8, 1.9, 18, 1.5, 0.9, 1.5, 0x70a0d0, 'metal'));
  boxes.push(B(-4, 0, 12, 2.2, 0.45, 2.2, 0x66ddff, 'metal', { bounce: 1, glow: 1 }));
  boxes.push(B(18, 0, 24, 2.2, 0.45, 2.2, 0x66ddff, 'metal', { bounce: 1, glow: 1 }));
  boxes.push(B(-8, 0, 26, 2.2, 1.0, 2.2, 0xa0a8b0, 'metal'));
  for (let i = 0; i < 3; i++) boxes.push(B(12 + i * 2.2, 0, 32, 0.15, 1.3 + i * 0.25, 0.15, 0x888888, 'metal', { deco: 1 }));
  boxes.push(B(20, 0, 32.5, 5, 0.25, 4, 0xe0cfa0, 'dirt'));
  boxes.push(B(-8, 0, 30.5, 16, 0.12, 5, 0x9aa4ae, 'tile'));
  boxes.push(...wallX(-16, 0, 28, 0, 3.2, 0.4, [[-14.5, -12.8], [-9.2, -7.5], [-3.8, -2.1]], 0x9a8a74));
  boxes.push(...wallX(-16, 0, 33, 0, 3.2, 0.4, [], 0x9a8a74));
  boxes.push(...wallZ(28, 33, -16, 0, 3.2, 0.4, [], 0x9a8a74));
  boxes.push(...wallZ(28, 33, 0, 0, 3.2, 0.4, [], 0x9a8a74));
  boxes.push(...wallZ(28, 33, -10.7, 0, 3.2, 0.3, [], 0x9a8a74), ...wallZ(28, 33, -5.3, 0, 3.2, 0.3, [], 0x9a8a74));
  boxes.push(B(-8, 3.2, 30.5, 16.4, 0.3, 5.4, 0x8a8478, 'tile'));
  for (const cx of [-13.5, -8, -2.7]) boxes.push(B(cx, 0, 31.8, 2.2, 0.6, 0.9, 0xaa8866, 'wood'));
  for (const [px, pz] of [[38.5, 0.8], [47.5, 0.8], [38.5, 9.2], [47.5, 9.2]]) boxes.push(B(px, 0, pz, 0.3, 2.4, 0.3, 0x98a2ac, 'metal'));
  boxes.push(B(43, 2.4, 5, 10.5, 0.2, 10.5, 0xb0b8c0, 'metal'));
  boxes.push(B(43, 0, 2.5, 9, 0.85, 0.5, 0x98a2ac, 'metal'));
  boxes.push(B(43, 0, 7.5, 9, 0.85, 0.5, 0x98a2ac, 'metal'));
  boxes.push(...wallX(42, 48, -16, 0, 3.2, 0.4, [], 0x9a8a74), ...wallX(42, 48, -8, 0, 3.2, 0.4, [], 0x9a8a74));
  boxes.push(...wallZ(-16, -8, 48, 0, 3.2, 0.4, [], 0x9a8a74));
  boxes.push(...wallZ(-16, -8, 42, 0, 3.2, 0.4, [[-13.5, -11]], 0x9a8a74));
  boxes.push(B(45.5, 3.2, -12, 6.4, 0.3, 8.4, 0x8a8478, 'tile'));
  boxes.push(B(46, 0, -14, 2.2, 1.2, 1.6, 0xc8a878, 'wood'));
  for (const [tx, tz] of [[49, -30], [49, -22], [49, 20], [49, 30], [4, 37], [-14, 37], [26, 37], [-49, -20], [-49, 0], [-49, 10], [-42, -34], [40, -34]]) {
    const warm = (tx + tz) & 1;
    tree(boxes, tx, tz, 2.6, 0.7, 1.7, warm ? 0xe6a0bc : 0xd894b0, warm ? 0xf9d4e2 : 0xf6c8da);
  }

  const GLASS = 0x9fc8e8;
  for (let fl = 0; fl < FLOORS; fl++) {
    const Y = fl * FH;
    for (let wx = -30; wx <= 30; wx += 5) {
      if (fl === 0 && wx === 0) continue;
      boxes.push(B(wx, Y + 1.2, -38.36, 2.6, 1.5, 0.18, GLASS, 'glass', { deco: 1 }));
    }
    for (let wz = -21; wz <= 5; wz += 4) {
      boxes.push(B(-34.36, Y + 1.2, wz, 0.18, 1.5, 2.4, GLASS, 'glass', { deco: 1 }));
      boxes.push(B(34.36, Y + 1.2, wz, 0.18, 1.5, 2.4, GLASS, 'glass', { deco: 1 }));
    }
    if (fl === 1 || fl === 2) {
      for (const [x1, x2] of [[-22, -11], [-11, 0], [0, 11], [11, 22]]) {
        boxes.push(B((x1 + x2) / 2, Y + 0.85, -37.55, 3.4, 1.15, 0.12, 0x2a5a44, 'board', { deco: 1 }));
      }
    }
    boxes.push(B(-19.5, Y, -27.55, 0.22, 0.55, 0.22, 0xdd3333, 'metal', { deco: 1 }));
    boxes.push(B(19.5, Y, -27.55, 0.22, 0.55, 0.22, 0xdd3333, 'metal', { deco: 1 }));
    boxes.push(B(-6, Y + 1.1, -27.7, 3, 1.2, 0.1, 0x7a9a6a, 'poster', { deco: 1 }));
    boxes.push(B(6, Y + 1.1, -27.7, 3, 1.2, 0.1, 0xc9b98a, 'poster', { deco: 1 }));
  }
  for (const gx of [-16.5, -7.5, 7.5, 16.5]) boxes.push(B(gx, 0, -24.6, 2.4, 1.0, 0.5, 0x9a8a74, 'locker', { deco: 1 }));
  boxes.push(B(0, FH * 3 + 1.6, -23.6, 1.5, 1.5, 0.15, 0xf6f6f0, 'metal', { deco: 1 }));
  boxes.push(B(0, FH * 3 + 2.25, -23.55, 0.1, 0.55, 0.08, 0x22262c, 'metal', { deco: 1 }));
  boxes.push(B(0.22, FH * 3 + 2.3, -23.55, 0.42, 0.1, 0.08, 0x22262c, 'metal', { deco: 1 }));
  boxes.push(B(-2.6, 0, 39.6, 0.9, 2.0, 0.9, 0x8a8478, 'stone', { deco: 1 }));
  boxes.push(B(2.6, 0, 39.6, 0.9, 2.0, 0.9, 0x8a8478, 'stone', { deco: 1 }));
  boxes.push(B(0, 0, 39.6, 4.2, 1.5, 0.12, 0x6a7480, 'metal', { deco: 1 }));
  boxes.push(B(3.4, 1.0, 39.15, 0.5, 0.9, 0.1, 0xe8e2d4, 'stone', { deco: 1 }));
  boxes.push(B(-11, 0, 24, 0.12, 7, 0.12, 0xb8c0c8, 'metal', { deco: 1 }));
  boxes.push(B(-10.45, 6.1, 24, 1.0, 0.7, 0.06, 0xffffff, 'metal', { deco: 1 }));
  boxes.push(B(-18, 0, 12, 0.7, 1.3, 0.7, 0xf4f4ee, 'wood', { deco: 1 }));
  boxes.push(B(-18, 1.3, 12, 0.9, 0.15, 0.9, 0x8a8478, 'wood', { deco: 1 }));
  const LINE = 0xf0ead8;
  boxes.push(B(-34, 0.125, 16.5, 15, 0.012, 0.12, LINE, 'tile', { deco: 1 }));
  boxes.push(B(-34, 0.125, 31.5, 15, 0.012, 0.12, LINE, 'tile', { deco: 1 }));
  boxes.push(B(-26.5, 0.125, 24, 0.12, 0.012, 15, LINE, 'tile', { deco: 1 }));
  boxes.push(B(-41.5, 0.125, 24, 0.12, 0.012, 15, LINE, 'tile', { deco: 1 }));
  boxes.push(B(-34, 0.125, 24, 15, 0.012, 0.12, LINE, 'tile', { deco: 1 }));
  boxes.push(B(-22.35, 4.5, 24, 0.15, 1.2, 2.6, 0x1e2a22, 'metal', { deco: 1 }));
  boxes.push(B(-38, 0, 33.55, 2.2, 2.8, 0.15, 0xb08a54, 'wood', { deco: 1 }));
  boxes.push(B(-31, 0, 33.55, 2.2, 2.8, 0.15, 0xb08a54, 'wood', { deco: 1 }));
  boxes.push(B(28.2, 0, 11, 0.15, 1.8, 0.15, 0xffffff, 'metal', { deco: 1 }));
  boxes.push(B(31.8, 0, 11, 0.15, 1.8, 0.15, 0xffffff, 'metal', { deco: 1 }));
  boxes.push(B(30, 1.8, 11, 3.75, 0.15, 0.15, 0xffffff, 'metal', { deco: 1 }));
  boxes.push(B(12, 0.005, 12.4, 20, 0.02, 0.1, 0xe8e0cc, 'dirt', { deco: 1 }));
  boxes.push(B(12, 0.005, 13.6, 20, 0.02, 0.1, 0xe8e0cc, 'dirt', { deco: 1 }));
  for (let i = 0; i < 3; i++) boxes.push(B(40 + i * 2.6, 0, 5, 1.6, 0.85, 0.14, [0xcc4455, 0x4477cc, 0x55aa66][i], 'metal', { deco: 1 }));

  // ==== v3.5 南グラウンド(校庭拡張): 陸上トラック・部室棟・砂場・用具倉庫 ====
  const TRK = 0xf0ead8, INF = 0x9fb27a;
  const trkC = [-8, 46], trkRX = 30, trkRZ = 5.2;
  boxes.push(B(trkC[0], 0.02, trkC[1], trkRX * 2 - 4, 0.03, trkRZ * 2 - 2.4, INF, 'tatami', { deco: 1 })); // 芝の内側
  for (const rr of [1.0, 0.86, 0.72]) {                       // トラックの白線(楕円3周)
    for (let t = 0; t < 100; t++) {
      const a = (t / 100) * Math.PI * 2;
      const x = trkC[0] + Math.cos(a) * trkRX * rr;
      const z = trkC[1] + Math.sin(a) * trkRZ * (rr < 1 ? rr + 0.12 : 1);
      boxes.push(B(x, 0.04, z, 0.5, 0.012, 0.12, TRK, 'tile', { deco: 1 }));
    }
  }
  // ゴールポスト(両端・細い=deco)
  for (const gx of [-34, 18]) {
    boxes.push(B(gx, 0, 47.5, 0.14, 2.4, 0.14, 0xffffff, 'metal', { deco: 1 }));
    boxes.push(B(gx, 0, 44.5, 0.14, 2.4, 0.14, 0xffffff, 'metal', { deco: 1 }));
    boxes.push(B(gx, 2.4, 46, 0.14, 0.14, 3.2, 0xffffff, 'metal', { deco: 1 }));
  }
  // 部室棟(西端): 北面を開けた小部屋の列 = 隠れ場所。屋根つき。
  const CLUB = 0xcbb58c;
  boxes.push(...wallX(-51, -39, 50.5, 0, 3.0, 0.4, [], CLUB));                       // 背面(南)
  for (const dx of [-51, -47, -43, -39]) boxes.push(...wallZ(46.5, 50.5, dx, 0, 3.0, 0.4, [], CLUB)); // 仕切り
  boxes.push(B(-45, 3.2, 48.5, 12.6, 0.3, 4.4, 0x8a7a64, 'tile', { deco: 1 }));      // 屋根
  for (const rx of [-49, -45, -41]) boxes.push(B(rx, 0, 48.5, 1.2, 1.0, 1.0, 0x9a8a74, 'locker')); // 部室内の棚
  boxes.push(B(-45, 3.6, 46.2, 8, 0.8, 0.3, 0x8060c0, 'sign', { deco: 1, glow: 1 }));
  // 走り幅跳びの砂場
  boxes.push(B(24, 0.03, 49, 6, 0.06, 3, 0xe6d8a8, 'dirt', { deco: 1 }));
  for (const [px, pz] of [[21, 47.5], [27, 47.5], [21, 50.5], [27, 50.5]]) boxes.push(B(px, 0.12, pz, 0.16, 0.28, 0.16, 0xb08a54, 'wood', { deco: 1 }));
  // 用具倉庫(東端の小屋・扉つき)
  boxes.push(...wallX(38, 49.5, 48, 0, 3.2, 0.4, [[42, 45]], 0x9a8a74));             // 北面(扉)
  boxes.push(...wallX(38, 49.5, 52, 0, 3.2, 0.4, [], 0x9a8a74));                     // 南面
  boxes.push(...wallZ(48, 52, 38, 0, 3.2, 0.4, [], 0x9a8a74), ...wallZ(48, 52, 49.5, 0, 3.2, 0.4, [], 0x9a8a74));
  boxes.push(B(43.75, 3.4, 50, 12.5, 0.3, 4.4, 0x8a8478, 'tile', { deco: 1 }));      // 屋根
  boxes.push(B(47, 0, 50.5, 1.4, 1.4, 1.2, 0x8a6a44, 'wood'), B(40, 0, 50.5, 1.2, 1.0, 1.2, 0x8a6a44, 'wood'));
  // トラック沿いのベンチ
  for (const bx of [-20, -8, 4]) boxes.push(B(bx, 0, 40.5, 2.4, 0.45, 0.7, 0xaa8866, 'wood'));
  // スコアボード(deco)
  boxes.push(B(-8, 0, 52, 0.4, 2.6, 0.4, 0x8a8478, 'metal', { deco: 1 }));
  boxes.push(B(-8, 2.6, 52, 5, 1.6, 0.3, 0x22303a, 'sign', { deco: 1, glow: 1 }));
  // 南グラウンドの桜・木
  for (const [tx, tz] of [[-46, 42], [-30, 52], [0, 52.2], [14, 52], [46, 44], [-16, 40], [34, 52]]) {
    const warm = (tx + tz) & 1;
    tree(boxes, tx, tz, 2.6, 0.7, 1.7, warm ? 0xe6a0bc : 0xd894b0, warm ? 0xf9d4e2 : 0xf6c8da);
  }

  // ---- 校舎の外観トリム(巾木・各階回り縁・付け柱・笠木) & 窓枠 ----
  const FLY = [FH, FH * 2, FH * 3], FTOP = ROOF, FT = { col: WALL, floors: FLY, top: FTOP };
  const npil = [-33, 33]; for (let x = -27.5; x <= 27.5; x += 5) npil.push(x);
  const zpil = [-37, 7]; for (let z = -19; z <= 1; z += 4) zpil.push(z);
  facade(boxes, 'x', -34, 34, -38, -1, 0.25, { ...FT, pilasterAt: npil });      // 北 外壁
  facade(boxes, 'z', -38, 8, -34, -1, 0.25, { ...FT, pilasterAt: zpil });       // 西 外壁
  facade(boxes, 'z', -38, 8, 34, 1, 0.25, { ...FT, pilasterAt: zpil });         // 東 外壁
  facade(boxes, 'x', -34, -20, 8, 1, 0.25, { ...FT, pilaster: 6, skip: [[-23.5, -20.8]] }); // 西棟 南端
  facade(boxes, 'x', 20, 34, 8, 1, 0.25, { ...FT, pilaster: 6, skip: [[20.8, 23.5]] });     // 東棟 南端
  facade(boxes, 'x', -20, 20, -24, 1, 0.25, { ...FT, pilaster: 5, pilasterW: 0.5, skip: [[-14, -10], [10, 14]] });   // 中庭側 廊下壁
  facade(boxes, 'z', -24, 8, -20, 1, 0.25, { ...FT, pilaster: 5, pilasterW: 0.5, skip: [[-16, -13], [0, 3]] });      // 中庭側 西棟内壁
  facade(boxes, 'z', -24, 8, 20, -1, 0.25, { ...FT, pilaster: 5, pilasterW: 0.5, skip: [[-16, -13], [0, 3]] });      // 中庭側 東棟内壁
  for (let fl = 0; fl < FLOORS; fl++) {
    const Y = fl * FH;
    for (let wx = -30; wx <= 30; wx += 5) {
      if (fl === 0 && wx === 0) continue;
      windowFrame(boxes, wx, Y + 1.2, -38.5, 2.6, 1.5, 'x');
    }
  }

  return {
    id: 'school', name: '学校', boxes,
    sky: 0xffb37a, skyTop: 0x4a5f9e, skyBottom: 0xffbe86, skyExp: 1.35,
    skySun: { dir: [0.5, 0.32, 0.28], color: 0xffe6b4, size: 0.06, glow: 0.42 },
    fog: { color: 0xffc490, near: 55, far: 185 },
    ambient: 0.65, sun: 0.9, sunColor: 0xffd9a8,
    lights: [{ x: -34, y: 6.5, z: 24, c: 0xfff4dd, i: 24, d: 28 }, { x: 0, y: 4, z: -10, c: 0xfff4dd, i: 16, d: 20 }, { x: 35, y: 4.5, z: 25, c: 0xfff4dd, i: 20, d: 24 }],
    bounds: { minX: -51, maxX: 51, minZ: -39, maxZ: 52 },
    jail: { x: -24.5, y: 0, z: 31, w: 4.5, d: 5 },
    spawns: {
      oni: [[4, 0.1, 16], [-2, 0.1, 20], [1, 0.1, 18], [4, 0.1, 20], [8, 0.1, 14], [0, 0.1, 14], [12, 0.1, 18], [4, 0.1, 12]],
      run: [
        [-28, 0.3, -26], [28, 0.3, -26], [0, 0.3, -26], [-22, 0.3, -8], [22, 0.3, -8], [0, 0.1, -10],
        [-12, FH + 0.3, -26], [12, FH * 2 + 0.3, -26], [0, FH * 3 + 0.3, -26], [0, ROOF + 0.1, -31],
        [-34, 0.3, 24], [35, 0.4, 25], [11, 0.3, -33], [45, 0.1, -2],
        [-8, 0.1, 46], [-30, 0.1, 44], [12, 0.1, 46], [-45, 0.1, 48], [30, 0.1, 43]
      ]
    }
  };
}

export const MAPS = { cave: buildCave(), mall: buildMall(), school: buildSchool() };
export const MAP_LIST = [
  { id: 'cave', name: '地下洞窟' },
  { id: 'mall', name: 'ショッピングモール' },
  { id: 'school', name: '学校' }
];

export function solidsOf(map) {
  const solids = [];
  for (const b of map.boxes) {
    if (b.deco || b.w <= 0 || b.h <= 0 || b.d <= 0) continue;
    solids.push({
      minX: b.x - b.w / 2, maxX: b.x + b.w / 2,
      minY: b.y, maxY: b.y + b.h,
      minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2,
      bounce: b.bounce ? 1 : 0
    });
  }
  return solids;
}
