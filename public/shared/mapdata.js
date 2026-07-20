// ============================================================
// マップデータ (実在の設計図・実在洞窟 準拠)
//  - 学校: 文部省「鉄筋コンクリート造校舎の標準設計」(1950) 準拠
//          普通教室7m×9m / 北側片廊下2.7m / 南面教室 / 両端階段
//  - モール: Southdale Center (1956, Victor Gruen設計) 準拠
//          ダンベル型 / 両端アンカー百貨店 / 中央ガーデンコート
//  - 洞窟: 秋芳洞 (山口県美祢市) 観光コース準拠
//          洞口→長淵→百枚皿→洞内富士→千畳敷→千町田→黄金柱
//          →巌窟王→くらげの滝のぼり→五月雨御殿→黒谷口
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

// ============================================================
// 地下洞窟 = 秋芳洞 (特別天然記念物・日本最大級の鍾乳洞)
// 観光コース約1kmの実際の順路を再現:
//   正面洞口(青天井)→長淵→百枚皿→洞内富士→広庭・千畳敷(大黒柱/傘づくし)
//   →千町田→エレベーター口→黄金柱→巌窟王→くらげの滝のぼり
//   →五月雨御殿(マリア観音)→黒谷口
// 冒険コース(洞口横の岩壁を登る)と支洞も実在に倣って配置
// ============================================================
function buildCave() {
  const boxes = [];
  const N = 90, OFF = -45, H = 12;
  const ROCK_A = 0x483a2e, ROCK_B = 0x544435, RS = 0x5c4c3a;
  const LIME = 0xcfc4a8, WATER = 0x1e5a6e;

  boxes.push(B(0, -0.5, 0, 92, 0.5, 92, 0x40352b, 'dirt'));

  // 洞内空間 (実際の順路: 南=正面洞口 → 北=黒谷口 へ蛇行)
  const R = [
    [4, 18, 32, 44],      // 正面洞口・青天井 (高さ24mの洞口)
    [13, 18, 18, 36],     // 冒険コース (洞口横の岩棚)
    [6, 13, 18, 32],      // 長淵 (地下川沿いの通路)
    [-8, 18, 4, 18],      // 百枚皿 (500枚超の畦石池)
    [-16, -8, 4, 10],     // 連絡通路
    [-32, -8, -4, 12],    // 広庭・洞内富士
    [-34, -6, -20, -4],   // 千畳敷 (最大ホール・大黒柱/傘づくし)
    [-6, 6, -16, -4],     // 千町田 (棚田状の畦石)
    [6, 14, -14, -4],     // エレベーター口
    [-4, 12, -28, -14],   // 黄金柱 (高さ15m・直径4mの石柱)
    [12, 20, -30, -18],   // 巌窟王・くらげの滝のぼり
    [-8, 12, -40, -28],   // 五月雨御殿 (マリア観音)
    [-2, 4, -44, -40],    // 黒谷口 (三億年のタイムトンネル)
    [-30, -24, -34, -20], // 支洞 (千畳敷側)
    [-24, -8, -34, -30]   // 支洞 (五月雨御殿へ抜ける)
  ];
  carveRock(boxes, R, 0, H, N, OFF, ROCK_A, ROCK_B);
  boxes.push(B(0, H, 0, 92, 1, 92, 0x2e2620, 'stone', { deco: 1 }));

  // --- 正面洞口 (青天井): 洞口の外光と滝 ---
  boxes.push(B(11, 0.1, 43.4, 13, 9, 0.4, 0xbfe0ff, 'sign', { deco: 1, glow: 1 }));
  boxes.push(B(6.5, 0, 41, 4, 0.2, 5, WATER, 'water', { deco: 1, glow: 1 }));
  boxes.push(B(15, 0, 41.5, 1.6, 0.05, 3, 0x3f6a4a, 'leaf', { deco: 1 }));
  boxes.push(B(9.5, 0, 38, 1.2, 0.05, 2, 0x4a7a55, 'leaf', { deco: 1 }));

  // --- 長淵: 通路西側を流れる地下川 ---
  boxes.push(B(7.2, 0, 25, 2.4, 0.16, 14, WATER, 'water', { deco: 1 }));
  boxes.push(B(7.5, 0, 34, 3, 0.16, 4, WATER, 'water', { deco: 1 }));
  boxes.push(B(8.6, 0, 25, 0.5, 0.45, 13, RS));

  // --- 冒険コース: 岩棚の上を渡る (両端に岩の階段) ---
  boxes.push(B(16, 0, 25, 4, 2.6, 10, RS));
  boxes.push(...stairs(16, 0, 33.8, 'n', 3, 9, 0.289, 0.45, RS));
  boxes.push(...stairs(16, 0, 16.1, 's', 3, 9, 0.289, 0.45, RS));
  boxes.push(B(14.2, 2.6, 25, 0.12, 0.85, 10, 0x8a7a5a, 'rail', { deco: 1 }));

  // --- 百枚皿: 段々に連なる畦石池 (西へ上る) ---
  for (let k = 0; k < 7; k++) {
    const x1 = 8 - 2 * (k + 1), x2 = 8 - 2 * k;
    const h = 0.26 * (k + 1);
    boxes.push(B((x1 + x2) / 2, 0, 11, 2, h, 10, LIME));
    boxes.push(B((x1 + x2) / 2, h, 11, 1.7, 0.05, 9.4, 0x2b7f9f, 'water', { deco: 1, glow: 1 }));
  }
  boxes.push(B(1, 2.2, 16.8, 14, 0.6, 0.15, 0xe8dcc0, 'stone', { deco: 1 }));

  // --- 洞内富士: 末広がりの巨大石筍 ---
  boxes.push(B(-24, 0, 4, 8, 1, 8, LIME));
  boxes.push(B(-24, 1, 4, 6, 1, 6, 0xd8cdb0));
  boxes.push(B(-24, 2, 4, 4.4, 1, 4.4, LIME));
  boxes.push(B(-24, 3, 4, 3, 0.9, 3, 0xe4dac2));
  boxes.push(B(-24, 3.9, 4, 1.6, 0.5, 1.6, 0xf0e8d4, 'stone', { deco: 1 }));

  // --- 千畳敷: 大黒柱と傘づくし ---
  boxes.push(B(-16, 0, -12, 2.4, H, 2.4, 0xbfb493));
  boxes.push(B(-16, 0, -12, 3.6, 1.2, 3.6, LIME));
  for (const [sx, sz] of [[-28, -10], [-26, -13], [-29, -14], [-25, -8], [-27, -16], [-30, -8]]) {
    const l = 2.2 + (((sx * 7 + sz * 13) % 8) + 8) % 8 / 4;
    boxes.push(B(sx, H - l, sz, 0.55, l, 0.55, 0xd8cdb0, 'stone', { deco: 1 }));
  }

  // --- 千町田: 棚田状の畦石と水たまり ---
  for (let r = 0; r < 3; r++) {
    const z = -6.5 - r * 2.6;
    boxes.push(B(0, 0, z, 10, 0.2, 0.5, LIME));
    boxes.push(B(0, 0, z - 1.3, 9.4, 0.06, 1.9, 0x2b7f9f, 'water', { deco: 1 }));
  }

  // --- エレベーター口 (実際に洞内中間部にある) + 牢屋 ---
  boxes.push(B(12.7, 0, -9, 2.2, H, 2.2, 0x8a94a8, 'metal'));
  boxes.push(B(11.5, 1.1, -9, 0.15, 1.0, 1.4, 0x9fe8b8, 'sign', { deco: 1, glow: 1 }));
  boxes.push(...wallX(7.2, 10.8, -6.8, 0, 1.1, 0.2, [[8.3, 9.7]], 0x8a7a5a, 'rail'));
  boxes.push(...wallX(7.2, 10.8, -11.2, 0, 1.1, 0.2, [], 0x8a7a5a, 'rail'));
  boxes.push(...wallZ(-11.2, -6.8, 7.2, 0, 1.1, 0.2, [], 0x8a7a5a, 'rail'));

  // --- 黄金柱: 秋芳洞のシンボル (直径4m・金色に輝く石柱) ---
  boxes.push(B(4, 0, -21, 5.2, 1.6, 5.2, 0xcaa43e, 'crystal', { glow: 1 }));
  boxes.push(B(4, 0, -21, 3.8, H, 3.8, 0xd9b24a, 'crystal', { glow: 1 }));
  boxes.push(B(4, 0, -21, 4.4, 4.5, 4.4, 0xd4ac44, 'crystal', { glow: 1 }));

  // --- 巌窟王: 人の形をした石筍 ---
  boxes.push(B(18, 0, -24, 1.3, 1.5, 1.3, LIME));
  boxes.push(B(18, 1.5, -24, 0.95, 0.9, 0.95, 0xd8cdb0, 'stone', { deco: 1 }));
  boxes.push(B(18, 2.4, -24, 0.6, 0.5, 0.6, 0xe4dac2, 'stone', { deco: 1 }));

  // --- くらげの滝のぼり: 東壁のフローストーン ---
  for (let i = 0; i < 4; i++) {
    boxes.push(B(19.5, 0.5 + i * 2.4, -26 + i * 0.9, 0.7, 2.6, 2.2 - i * 0.3, 0xd0e4e8, 'crystal', { deco: 1, glow: 1 }));
  }

  // --- 五月雨御殿: 細い石柱が林立する広間 + マリア観音 ---
  for (const [px, pz] of [[-4, -31], [2, -33], [8, -31], [-2, -37], [6, -37], [10, -34]]) {
    boxes.push(B(px, 0, pz, 0.7, H, 0.7, 0xbfb493));
    boxes.push(B(px, 0, pz, 1.2, 0.8, 1.2, LIME));
  }
  boxes.push(B(-6, 0, -37, 0.6, 1.1, 0.6, 0xf0ece0, 'stone', { deco: 1 }));
  boxes.push(B(-6, 1.1, -37, 0.4, 0.5, 0.4, 0xf6f2e8, 'stone', { deco: 1 }));

  // --- 黒谷口: 三億年のタイムトンネル (色が変わる光の輪) ---
  for (let i = 0; i < 3; i++) {
    const cc = [0xff8a5f, 0x8a6fff, 0x5fd4ff][i];
    boxes.push(B(1, 0.1, -40.8 - i * 1.3, 4.6, 0.15, 0.3, cc, 'sign', { deco: 1, glow: 1 }));
  }
  boxes.push(B(1, 0.1, -43.5, 4, 4.5, 0.3, 0xbfd8ff, 'sign', { deco: 1, glow: 1 }));

  // --- 鍾乳石・石筍・観光路の照明灯 ---
  const stal = [[11, 30], [-4, 6], [-12, 8], [-30, 2], [-32, -16], [-10, -18], [0, -26], [10, -26], [-4, -34], [-20, -32], [-28, -26], [16, -20]];
  for (const [sx, sz] of stal) {
    boxes.push(B(sx, 0, sz, 0.8, 2.0 + ((sx * 7 + sz * 13) % 10) / 8, 0.8, 0x51443a, 'stone', { deco: 1 }));
    boxes.push(B(sx + 0.6, 0, sz - 0.4, 0.45, 1.0, 0.45, 0x51443a, 'stone', { deco: 1 }));
  }
  const stalac = [[9, 27], [3, 12], [-2, 15], [-20, 8], [-26, 6], [-14, -8], [-22, -14], [2, -10], [8, -18], [0, -32], [6, -34], [16, -26], [-26, -30], [-14, -32], [10, 38]];
  for (const [sx, sz] of stalac) {
    const h = 1.2 + (((sx * 5 + sz * 11) % 8) + 8) % 8 / 6;
    boxes.push(B(sx, H - h, sz, 0.5, h, 0.5, 0x4a3d30, 'stone', { deco: 1 }));
    boxes.push(B(sx + 0.45, H - 0.7, sz + 0.3, 0.28, 0.7, 0.28, 0x4a3d30, 'stone', { deco: 1 }));
  }
  const lamps = [[10.5, 36], [10.5, 22], [11, 8], [-12, 6], [-28, 8], [-30, -12], [-4, -8], [10, -16], [14, -28], [-4, -30], [1, -39], [-26, -22]];
  for (const [lx, lz] of lamps) {
    boxes.push(B(lx, 0, lz, 0.14, 0.85, 0.14, 0x3a342c, 'metal', { deco: 1 }));
    boxes.push(B(lx, 0.85, lz, 0.3, 0.22, 0.3, 0xffd9a0, 'sign', { deco: 1, glow: 1 }));
  }

  return {
    id: 'cave', name: '地下洞窟', boxes,
    sky: 0x07070c, fog: { color: 0x0a0a12, near: 10, far: 62 },
    ambient: 0.5, sun: 0.35, sunColor: 0x8899cc,
    lights: [
      { x: 11, y: 6, z: 38, c: 0xbfd8ff, i: 30, d: 26 }, { x: 0, y: 5, z: 11, c: 0x9fd4ff, i: 26, d: 22 },
      { x: -24, y: 6, z: 6, c: 0xffd9a0, i: 24, d: 24 }, { x: -20, y: 7, z: -12, c: 0x9fd4ff, i: 26, d: 26 },
      { x: 4, y: 6, z: -21, c: 0xffcf6a, i: 36, d: 26 }, { x: 10, y: 4, z: -9, c: 0xa8ffcf, i: 20, d: 18 },
      { x: 2, y: 6, z: -34, c: 0x9fb8ff, i: 24, d: 24 }, { x: 1, y: 4, z: -42, c: 0xbfd8ff, i: 22, d: 18 }
    ],
    bounds: { minX: -44, maxX: 44, minZ: -44, maxZ: 44 },
    jail: { x: 9, y: 0, z: -9, w: 3.4, d: 3.6 },
    spawns: {
      oni: [[-24, 0.1, -12], [-21, 0.1, -9], [-27, 0.1, -9], [-21, 0.1, -15], [-27, 0.1, -15], [-24, 0.1, -8], [-24, 0.1, -16], [-19, 0.1, -16]],
      run: [
        [10, 0.1, 40], [9.5, 0.1, 26], [16, 2.7, 25], [11, 0.1, 8], [-13, 0.1, 7], [-28, 0.1, 8],
        [8, 0.1, -26], [16, 0.1, -22], [2, 0.1, -34], [1, 0.1, -42], [-16, 0.1, -32], [0, 0.1, -12]
      ]
    }
  };
}

// ============================================================
// ショッピングモール = Southdale Center (1956, ミネソタ州)
// Victor Gruen設計・世界初の完全屋内型モールの平面計画準拠:
//   ダンベル型 = 両端に2つのアンカー百貨店 (Dayton's / Donaldson's)
//   中央に2層吹抜けの「ガーデンコート」(泉・池・カフェ・彫刻・
//   高さ約14mの巨大鳥かご) / 72の専門店が両側に並ぶ / 2層構成
// ============================================================
function buildMall() {
  const WALL = 0xf2efe9, F1C = 0xe8e4dc, F2C = 0xdfdbd2, SHOP = 0xcfc8bc, BACK = 0xb8b2a6;
  const boxes = [];
  const F2 = 5, WH = 11;

  boxes.push(B(0, -0.5, 0, 114, 0.5, 62, F1C, 'tile'));
  boxes.push(...wallX(-56, 56, -29.7, 0, WH, 0.8, [], WALL), ...wallX(-56, 56, 29.7, 0, WH, 0.8, [], WALL));
  boxes.push(...wallZ(-30, 30, -55.7, 0, WH, 0.8, [], WALL), ...wallZ(-30, 30, 55.7, 0, WH, 0.8, [], WALL));

  // ============ アンカー百貨店 ×2 (ダンベルの両端) ============
  for (const s of [-1, 1]) {
    const xw = s * 34;                       // モール側の壁
    boxes.push(...wallZ(-30, 30, xw, 0, F2, 0.5, [[-10, -4], [4, 10]], WALL));
    boxes.push(...wallZ(-30, 30, xw, F2, WH - F2, 0.5, [[-10, -4], [4, 10]], WALL));
    // 大看板 (西=桃色 Dayton's / 東=水色 Donaldson's)
    boxes.push(B(s * 33.6, 8.0, 0, 0.3, 1.8, 18, s < 0 ? 0xc42a76 : 0x2a6fc4, 'sign', { deco: 1, glow: 1 }));
    // 1F 売場: 商品棚の列
    for (let r = 0; r < 6; r++) {
      const gz = -17.5 + r * 7;
      boxes.push(B(s * 50, 0, gz, 7, 1.9, 1.0, 0xbcc8d0, 'goods'));
      boxes.push(B(s * 41, 0, gz, 7, 1.9, 1.0, 0x9fb8c8, 'goods'));
    }
    boxes.push(B(s * 54.9, 0, 0, 1.2, 1.9, 40, 0xbcc8d0, 'goods'));
    boxes.push(B(s * 36.5, 0, -7, 1.1, 0.95, 2.6, 0xd0d5da, 'metal'));
    boxes.push(B(s * 36.5, 0, 7, 1.1, 0.95, 2.6, 0xd0d5da, 'metal'));
    // 2F 床 (階段孔を除く)
    const sl = (x1, x2, z1, z2) => boxes.push(B((x1 + x2) / 2, F2 - 0.4, (z1 + z2) / 2, x2 - x1, 0.4, z2 - z1, F2C, 'tile'));
    if (s < 0) {
      sl(-55.5, -34, -30, -21.4); sl(-55.5, -46.2, -21.4, -18.6); sl(-40.1, -34, -21.4, -18.6); sl(-55.5, -34, -18.6, 30);
      boxes.push(...stairs(-50.5, 0, -20, 'e', 2.4, 20, 0.25, 0.5, 0x99a0aa, 'metal'));
    } else {
      sl(34, 55.5, -30, 18.6); sl(34, 40.1, 18.6, 21.4); sl(46.2, 55.5, 18.6, 21.4); sl(34, 55.5, 21.4, 30);
      boxes.push(...stairs(50.5, 0, 20, 'w', 2.4, 20, 0.25, 0.5, 0x99a0aa, 'metal'));
    }
    // 2F 売場
    for (let r = 0; r < 4; r++) {
      boxes.push(B(s * 50, F2, -12 + r * 8, 6, 1.4, 1.0, 0xd0aab8, 'metal'));
      boxes.push(B(s * 41, F2, -12 + r * 8, 6, 1.4, 1.0, 0xb8c8d8, 'metal'));
    }
    boxes.push(B(s * 45, F2 + 4.2, 0, 10, 1.0, 0.3, s < 0 ? 0xc42a76 : 0x2a6fc4, 'sign', { deco: 1, glow: 1 }));
  }

  // ============ 専門店街 (南北2列・前面z=±10 / 奥行12m) ============
  const shopColors = [0xff6b81, 0x54c2ff, 0xffd166, 0x8ce99a, 0xffa94d, 0x9b8cff];
  const segs = [[-34, -26], [-26, -18], [-18, -11], [-11, -4], [-4, 4], [4, 11], [11, 18], [18, 26], [26, 34]];
  for (const s of [-1, 1]) {
    const front = s * 10, back = s * 22;
    for (let i = 0; i < segs.length; i++) {
      const [x1, x2] = segs[i], cx = (x1 + x2) / 2;
      // 1F 店舗
      boxes.push(...wallX(x1, x2, front, 0, 4.6, 0.5, [[x1 + 1.4, x1 + 3.8], [x2 - 3.8, x2 - 1.4]], SHOP));
      const bg = (i % 3 === 1) ? [[cx - 1.1, cx + 1.1]] : [];
      boxes.push(...wallX(x1, x2, back, 0, 4.6, 0.4, bg, BACK));
      if (x1 !== -34) boxes.push(...wallZ(Math.min(front, back), Math.max(front, back), x1, 0, 4.6, 0.4, [], SHOP));
      boxes.push(B(cx, 4.7, front, (x2 - x1) - 2.2, 1.0, 0.3, shopColors[(i + (s === 1 ? 3 : 0)) % 6], 'sign', { deco: 1, glow: 1 }));
      boxes.push(B(cx, 0, s * 18.5, 2.6, 0.95, 1.0, 0x9c8f80, 'wood'));
      if (i % 2 === 0) boxes.push(B(cx - 1.5, 0, s * 14, 1.0, 1.5, 2.6, 0x7fa8d0, 'goods'));
      else boxes.push(B(cx + 1.5, 0, s * 14.5, 2.6, 1.35, 1.1, 0xd0aab8, 'metal'));
      // 2F 店舗
      boxes.push(...wallX(x1, x2, front, F2, 4, 0.5, [[cx - 1.8, cx + 1.8]], SHOP));
      boxes.push(...wallX(x1, x2, back, F2, 4, 0.4, [], BACK));
      if (x1 !== -34) boxes.push(...wallZ(Math.min(front, back), Math.max(front, back), x1, F2, 4, 0.4, [], SHOP));
      boxes.push(B(cx, F2 + 4.1, front, (x2 - x1) - 2.6, 0.9, 0.3, shopColors[(i + (s === 1 ? 1 : 4)) % 6], 'sign', { deco: 1, glow: 1 }));
      boxes.push(B(cx, F2, s * 16, 2.6, 1.1, 1.0, 0xc8a878, 'wood'));
    }
  }

  // ============ 案内所 (牢屋) = 東側コンコースに面した開放カウンター ============
  // コンコース(z -8..8)の東寄りに、柵で3方を囲みコート側(西)を開口
  boxes.push(...wallX(28, 33, -2.4, 0, 1.1, 0.22, [], 0xc8ccd4, 'rail'));
  boxes.push(...wallX(28, 33, 2.4, 0, 1.1, 0.22, [], 0xc8ccd4, 'rail'));
  boxes.push(...wallZ(-2.4, 2.4, 33, 0, 1.1, 0.22, [], 0xc8ccd4, 'rail'));
  boxes.push(B(32.0, 0, 0, 1.8, 0.95, 0.6, 0x9c8f80, 'wood'));           // 受付カウンター(東奥)
  boxes.push(B(32.6, 1.0, 0, 0.6, 1.4, 2.6, 0x707a90, 'metal', { deco: 1 })); // 案内板
  boxes.push(B(30.4, 2.3, 0, 4.0, 0.8, 0.3, 0xff5555, 'sign', { deco: 1, glow: 1 }));

  // ============ ガーデンコート (Southdaleの象徴・2層吹抜け) ============
  // 巨大鳥かご (高さ約14ft x3の名物アビアリー)
  boxes.push(B(0, 0, -2, 3.4, 0.5, 3.4, 0xdfe8ee, 'tile'));
  for (const [px, pz] of [[-1.4, -3.4], [1.4, -3.4], [-1.4, -0.6], [1.4, -0.6]]) {
    boxes.push(B(px, 0.5, pz, 0.16, 9, 0.16, 0xd8b24a, 'metal'));
  }
  boxes.push(B(0, 9.5, -2, 3.7, 0.4, 3.7, 0xd8b24a, 'metal', { deco: 1 }));
  boxes.push(B(0, 10, -2, 0.9, 0.9, 0.9, 0xd8b24a, 'metal', { deco: 1 }));
  boxes.push(B(0, 2, -3.35, 3.2, 7, 0.06, 0xe8d9a8, 'rail', { deco: 1 }));
  boxes.push(B(0, 2, -0.65, 3.2, 7, 0.06, 0xe8d9a8, 'rail', { deco: 1 }));
  boxes.push(B(-1.35, 2, -2, 0.06, 7, 2.6, 0xe8d9a8, 'rail', { deco: 1 }));
  boxes.push(B(1.35, 2, -2, 0.06, 7, 2.6, 0xe8d9a8, 'rail', { deco: 1 }));
  for (const [bx, by, bz, bc] of [[-0.6, 2.4, -2.4, 0xff6b81], [0.5, 3.6, -1.6, 0x54c2ff], [0.1, 5.2, -2.2, 0xffd166]]) {
    boxes.push(B(bx, by, bz, 0.3, 0.25, 0.3, bc, 'sign', { deco: 1, glow: 1 }));
  }
  // 泉と池 (Garden Court of Perpetual Spring)
  boxes.push(B(6.5, 0, 4.5, 6.5, 0.55, 4.5, 0xdfe8ee, 'tile'));
  boxes.push(B(6.5, 0.55, 4.5, 5.4, 0.2, 3.4, 0x58b8e8, 'water', { deco: 1, glow: 1 }));
  boxes.push(B(6.5, 0.55, 4.5, 0.8, 2.4, 0.8, 0xdfe8ee, 'tile'));
  boxes.push(B(6.5, 3.0, 4.5, 0.4, 1.2, 0.4, 0x9fdcf8, 'crystal', { deco: 1, glow: 1 }));
  // サイドウォークカフェ
  boxes.push(B(-8.9, 0, -5, 1.0, 1.0, 3.2, 0x8a6a44, 'wood'));
  for (const [tx, tz] of [[-6.2, -6.3], [-4.4, -4.2], [-6.6, -3.2], [-4.2, -6.6]]) {
    boxes.push(B(tx, 0, tz, 1.1, 0.75, 1.1, 0xc9a06a, 'wood'));
    boxes.push(B(tx, 0.75, tz, 0.1, 1.4, 0.1, 0x8a6a44, 'wood', { deco: 1 }));
    boxes.push(B(tx, 2.15, tz, 1.7, 0.12, 1.7, [0xff6b81, 0x54c2ff, 0xffd166, 0x8ce99a][((tx * 3 + tz) & 3 + 4) % 4], 'leaf', { deco: 1 }));
  }
  boxes.push(B(-8.9, 3.2, -5, 1.2, 0.7, 3.4, 0xffb14d, 'sign', { deco: 1, glow: 1 }));
  // 彫刻 (モダンアート) と植栽
  boxes.push(B(-6, 0, 4, 1.5, 0.5, 1.5, 0x9aa2ac, 'stone'));
  boxes.push(B(-6, 0.5, 4, 0.5, 2.6, 0.5, 0xd88a3a, 'metal', { deco: 1, glow: 1 }));
  boxes.push(B(-6.3, 2.2, 4.3, 1.3, 0.18, 0.18, 0xd88a3a, 'metal', { deco: 1 }));
  for (const [px, pz] of [[-9, 7], [9, -7], [-9, -8.5], [9.3, 0.5]]) {
    boxes.push(B(px, 0, pz, 1.9, 0.65, 1.9, 0x8a7a64, 'wood'));
    boxes.push(B(px, 0.65, pz, 1.2, 1.9, 1.2, 0x3f9b4f, 'leaf', { deco: 1 }));
  }
  for (const [bx, bz] of [[3.5, -6.5], [-2.5, 6.5], [3.5, 7.5]]) {
    boxes.push(B(bx, 0, bz, 2.4, 0.55, 0.8, 0xb08a5f, 'wood'));
  }
  // 天窓 (コート上部)
  boxes.push(B(0, 10.55, 0, 22, 0.15, 16, 0xbfe8ff, 'glass', { deco: 1, glow: 1 }));
  for (const lx of [-24, -15, 15, 24]) boxes.push(B(lx, 10.4, 0, 7, 0.15, 1.2, 0xfff2dd, 'sign', { deco: 1, glow: 1 }));

  // ============ コートの大階段 ×2 (2層を結ぶ) ============
  boxes.push(...stairs(-24.3, 0, -8.6, 'e', 2.4, 20, 0.25, 0.5, 0x99a0aa, 'metal'));
  boxes.push(...stairs(24.3, 0, 8.6, 'w', 2.4, 20, 0.25, 0.5, 0x99a0aa, 'metal'));

  // ============ 2F 回廊スラブ (吹抜け・階段孔を除く) ============
  const slab = (x1, x2, z1, z2) => boxes.push(B((x1 + x2) / 2, F2 - 0.4, (z1 + z2) / 2, x2 - x1, 0.4, z2 - z1, F2C, 'tile'));
  slab(-34, 34, -22, -9.8);
  slab(-34, -19.5, -9.8, -8); slab(-14.2, 34, -9.8, -8);
  slab(-34, -11, -8, 7.4); slab(11, 34, -8, 7.4);
  slab(-34, -11, 7.4, 8); slab(11, 14.2, 7.4, 8); slab(19.5, 34, 7.4, 8);
  slab(-34, 14.2, 8, 9.8); slab(19.5, 34, 8, 9.8);
  slab(-34, 34, 9.8, 22);

  // 吹抜けまわりの手すり
  const RAIL = 0xc8ccd4;
  boxes.push(...wallX(-11, 11, -8.15, F2, 1.0, 0.22, [], RAIL, 'rail'));
  boxes.push(...wallX(-11, 11, 8.15, F2, 1.0, 0.22, [], RAIL, 'rail'));
  boxes.push(...wallZ(-8, 8, -11.15, F2, 1.0, 0.22, [], RAIL, 'rail'));
  boxes.push(...wallZ(-8, 8, 11.15, F2, 1.0, 0.22, [], RAIL, 'rail'));
  boxes.push(...wallX(-19.5, -14.2, -7.35, F2, 1.0, 0.22, [], RAIL, 'rail'));
  boxes.push(...wallX(14.2, 19.5, 7.35, F2, 1.0, 0.22, [], RAIL, 'rail'));

  // 2F 回廊のベンチ・植栽
  for (const [bx, bz] of [[-16, -14], [16, 14], [0, -14], [0, 14]]) {
    boxes.push(B(bx, F2, bz, 2.4, 0.55, 0.8, 0xb08a5f, 'wood'));
  }
  for (const [px, pz] of [[-28, 14], [28, -14]]) {
    boxes.push(B(px, F2, pz, 1.4, 0.6, 1.4, 0x8a7a64, 'wood'));
    boxes.push(B(px, F2 + 0.6, pz, 0.9, 1.3, 0.9, 0x3f9b4f, 'leaf', { deco: 1 }));
  }

  // 案内サイン・ゴミ箱などの小物
  for (const sx of [-22, 22]) {
    boxes.push(B(sx, 3.9, 0, 2.6, 0.7, 0.12, 0xf8f8f4, 'sign', { deco: 1, glow: 1 }));
    boxes.push(B(sx, 4.6, 0, 0.08, 0.35, 0.08, 0x9aa2ac, 'metal', { deco: 1 }));
  }
  boxes.push(B(-13, 0, 8.5, 0.25, 1.7, 1.1, 0x2a3856, 'sign', { deco: 1, glow: 1 }));
  for (let i = 0; i < 3; i++) boxes.push(B(-12.6, 0, -7 + i * 1.1, 0.6, 1.3, 0.6, shopColors[i], 'metal', { deco: 1, glow: 1 }));

  return {
    id: 'mall', name: 'ショッピングモール', boxes,
    sky: 0x252a34, fog: { color: 0x2a303c, near: 34, far: 140 },
    ambient: 0.78, sun: 0.62, sunColor: 0xfff2dd,
    lights: [
      { x: 0, y: 8, z: 0, c: 0xffeecc, i: 34, d: 34 }, { x: -45, y: 7, z: 0, c: 0xffeecc, i: 24, d: 28 },
      { x: 45, y: 7, z: 0, c: 0xffeecc, i: 24, d: 28 }, { x: -22, y: 7, z: 0, c: 0xffeecc, i: 18, d: 22 },
      { x: 22, y: 7, z: 0, c: 0xffeecc, i: 18, d: 22 }
    ],
    bounds: { minX: -55, maxX: 55, minZ: -29, maxZ: 29 },
    jail: { x: 29.8, y: 0, z: 0, w: 2.6, d: 3.4 },
    spawns: {
      oni: [[-3, 0.1, 1], [-1, 0.1, 4], [3, 0.1, -0.5], [0, 0.1, 6.5], [-4, 0.1, -2], [3, 0.1, 1.5], [-1, 0.1, -5], [-6, 0.1, 0.5]],
      run: [
        [-45, 0.1, 0], [-50, 0.1, -14], [45, 0.1, 10], [50, 0.1, -5], [-20, 0.1, 0], [20, 0.1, 0],
        [0, 0.1, 25.5], [-20, 0.1, -25.5], [-45, 5.1, 12], [45, 5.1, -12], [-25, 5.1, 15], [25, 5.1, -15]
      ]
    }
  };
}

// ============================================================
// 学校 = 文部省「鉄筋コンクリート造校舎の標準設計」(1950) 準拠
//   (日本建築学会作成・全国のRC校舎の原型)
//   - 普通教室 7m(奥行)×9m(間口) を一列に6室
//   - 北側片廊下 幅2.7m / 教室は南面採光
//   - 両端に階段室 / 3階建 / 中央昇降口
//   - 別棟の体育館・プール・校庭 (校門/朝礼台/鉄棒/砂場)
// ============================================================
function buildSchool() {
  const WALL = 0xe6ddca, CORR = 0xcabfa8, CLS = 0xd8ceba, GYMC = 0xc8b494, SLAB = 0xb8ad96, FENCE = 0x8a9aa8;
  const boxes = [];
  const FH = 3.8, FLOORS = 3, ROOF = FH * FLOORS; // 階高3.8m・3階建
  boxes.push(B(0, -0.5, 0, 106, 0.5, 82, 0xb99a6b, 'dirt'));
  boxes.push(...wallX(-52, 52, -39.7, 0, 2.2, 0.5, [], FENCE, 'fence'), ...wallX(-52, 52, 39.7, 0, 2.2, 0.5, [[-3, 3]], FENCE, 'fence'));
  boxes.push(...wallZ(-40, 40, -51.7, 0, 2.2, 0.5, [], FENCE, 'fence'), ...wallZ(-40, 40, 51.7, 0, 2.2, 0.5, [], FENCE, 'fence'));

  // ---- 校舎: 北壁z=-38 / 廊下2.7m / 間仕切りz=-34.85 / 南壁z=-27.5 ----
  // 教室グリッド x: -27,-18,-9,0,9,18,27 (9m間口×6) / 両端階段室4.5m
  const ROOMS = [[-27, -18], [-18, -9], [-9, 0], [0, 9], [9, 18], [18, 27]];
  const LANE_A = 30.2, LANE_B = 28.1; // 階段2レーン (|x|, 東西対称)

  for (let fl = 0; fl < FLOORS; fl++) {
    const Y = fl * FH, is1F = fl === 0;
    // 外壁
    boxes.push(...wallX(-31.5, 31.5, -38, Y, FH, 0.5, [], WALL));
    boxes.push(...wallX(-31.5, 31.5, -27.5, Y, FH, 0.5,
      is1F ? [[-2.5, 2.5], [-30.7, -28.6], [28.6, 30.7]] : [], WALL));
    boxes.push(...wallZ(-38, -27.5, -31.5, Y, FH, 0.5, [], WALL));
    boxes.push(...wallZ(-38, -27.5, 31.5, Y, FH, 0.5, [], WALL));
    // 廊下と教室の間仕切り (各教室に引き戸2箇所 / 中央は昇降口ホール)
    const gaps = [];
    for (const [x1, x2] of ROOMS) {
      if (is1F && (x1 === -9 || x1 === 0)) continue;
      gaps.push([x1 + 0.7, x1 + 2.5], [x2 - 2.5, x2 - 0.7]);
    }
    if (is1F) gaps.push([-3, 3]);
    boxes.push(...wallX(-27, 27, -34.85, Y, FH, 0.4, gaps, CLS));
    // 階段室との仕切り (廊下部分だけ通り抜け)
    boxes.push(...wallZ(-38, -27.5, -27, Y, FH, 0.4, [[-37.75, -35.05]], CLS));
    boxes.push(...wallZ(-38, -27.5, 27, Y, FH, 0.4, [[-37.75, -35.05]], CLS));
    // 教室間の間仕切り
    const divs = (is1F) ? [-18, -9, 9, 18] : [-18, -9, 0, 9, 18];
    for (const dx of divs) boxes.push(...wallZ(-34.65, -27.5, dx, Y, FH, 0.3, [], CLS));

    // ---- 各階の室内 ----
    if (is1F) {
      // 昇降口ホール (下駄箱) x -9..9
      for (const gx of [-6.5, -3.5, 3.5, 6.5]) boxes.push(B(gx, Y, -33.5, 2.4, 1.5, 0.8, 0x9a8a74, 'locker'));
      boxes.push(B(0, Y, -33.8, 2.2, 0.5, 1.6, 0xc9a878, 'wood'));
      // 理科室 [-27,-18]
      for (const tz of [-33.4, -30.6]) {
        boxes.push(B(-24.5, Y, tz, 3.4, 0.85, 1.2, 0x2a2a30, 'wood'));
        boxes.push(B(-20.5, Y, tz, 3.4, 0.85, 1.2, 0x2a2a30, 'wood'));
      }
      // 保健室 [-18,-9]
      boxes.push(B(-15.5, Y, -33.8, 2.0, 0.6, 3.6, 0xe8e8f0, 'tile'));
      boxes.push(B(-12.5, Y, -33.8, 2.0, 0.6, 3.6, 0xe8e8f0, 'tile'));
      boxes.push(B(-16.4, Y, -29.5, 1.5, 0.75, 1.0, 0xc9a878, 'wood'));
      // 職員室 [9,18]
      for (const [dx, dz] of [[11.5, -33.5], [15.5, -33.5], [11.5, -31], [15.5, -31]])
        boxes.push(B(dx, Y, dz, 3.0, 0.75, 1.1, 0xc9a878, 'wood'));
      boxes.push(B(13.5, Y + 3.0, -27.7, 5, 0.7, 0.3, 0x2a9d5c, 'sign', { deco: 1, glow: 1 }));
      // 図書室 [18,27]
      for (const sz of [-34.2, -32, -29.8]) boxes.push(B(22.5, Y, sz, 7, 1.9, 0.8, 0x8a6a44, 'books'));
    } else {
      // 2F/3F: 普通教室 ×6 (机2列×3・教壇・教卓)
      for (const [x1, x2] of ROOMS) {
        const cx = (x1 + x2) / 2;
        for (const [dx, dz] of [[-1.8, -33.6], [1.8, -33.6], [-1.8, -31.9], [1.8, -31.9], [-1.8, -30.2], [1.8, -30.2]])
          boxes.push(B(cx + dx, Y, dz, 1.0, 0.72, 0.7, 0xc9a878, 'wood'));
        boxes.push(B(cx, Y, -36.5, 2.6, 0.18, 1.3, 0xb08a54, 'wood'));      // 教壇
        boxes.push(B(cx + 1.6, Y + 0.18, -36.5, 1.4, 0.68, 0.8, 0x8a6a44, 'wood')); // 教卓
        boxes.push(B(cx, Y + 1.0, -37.6, 4.2, 1.15, 0.12, 0x2a5a44, 'board', { deco: 1 })); // 黒板
      }
    }
    // 廊下の掲示物・消火器
    boxes.push(B(-19.5, Y, -37.55, 0.22, 0.55, 0.22, 0xdd3333, 'metal', { deco: 1 }));
    boxes.push(B(19.5, Y, -37.55, 0.22, 0.55, 0.22, 0xdd3333, 'metal', { deco: 1 }));
    boxes.push(B(-6, Y + 1.2, -37.7, 3, 1.2, 0.1, 0x7a9a6a, 'poster', { deco: 1 }));
    boxes.push(B(6, Y + 1.2, -37.7, 3, 1.2, 0.1, 0xc9b98a, 'poster', { deco: 1 }));

    // ---- 両端の階段室 (階ごとにレーンを交互に折り返す) ----
    for (const s of [-1, 1]) {
      if (fl % 2 === 0) boxes.push(...stairs(s * LANE_A, Y, -31.8, 'n', 2.0, 14, FH / 14, 0.42, CORR));
      else boxes.push(...stairs(s * LANE_B, Y, -33.8, 's', 2.0, 14, FH / 14, 0.42, CORR));
    }
  }

  // ---- 床スラブ (2F/3F/屋上) 階段孔つき ----
  for (let fl = 1; fl <= FLOORS; fl++) {
    const Y = fl * FH, isRoof = fl === FLOORS;
    const c = isRoof ? 0xb0b8c0 : SLAB;
    boxes.push(B(0, Y - 0.35, -32.75, 54, 0.35, 11, c, 'tile')); // 中央部 x -27..27
    for (const s of [-1, 1]) {
      // 階段室部分 x 27..31.75
      const hx1 = s < 0 ? -31.25 : 29.2, hx2 = s < 0 ? -29.2 : 31.25;   // laneA範囲
      const bx1 = s < 0 ? -29.0 : 27.0, bx2 = s < 0 ? -27.0 : 29.0;     // laneB範囲
      if (fl % 2 === 1) {
        // 北側laneAに孔 (下階の上り階段が到着)
        boxes.push(B((bx1 + bx2) / 2, Y - 0.35, -32.75, bx2 - bx1, 0.35, 11, c, 'tile'));
        boxes.push(B((hx1 + hx2) / 2, Y - 0.35, -30.6, hx2 - hx1, 0.35, 6.7, c, 'tile'));
        boxes.push(B(s * 31.5, Y - 0.35, -32.75, 0.55, 0.35, 11, c, 'tile'));
      } else {
        // 南側laneBに孔
        boxes.push(B((hx1 + hx2) / 2, Y - 0.35, -32.75, hx2 - hx1, 0.35, 11, c, 'tile'));
        boxes.push(B((bx1 + bx2) / 2, Y - 0.35, -35.05, bx2 - bx1, 0.35, 6.4, c, 'tile'));
        boxes.push(B(s * 31.5, Y - 0.35, -32.75, 0.55, 0.35, 11, c, 'tile'));
      }
    }
  }
  // 屋上フェンス・給水塔
  boxes.push(...wallX(-31.5, 31.5, -38, ROOF, 1.1, 0.3, [], FENCE, 'fence'));
  boxes.push(...wallX(-31.5, 31.5, -27.5, ROOF, 1.1, 0.3, [], FENCE, 'fence'));
  boxes.push(...wallZ(-38, -27.5, -31.5, ROOF, 1.1, 0.3, [], FENCE, 'fence'));
  boxes.push(...wallZ(-38, -27.5, 31.5, ROOF, 1.1, 0.3, [], FENCE, 'fence'));
  boxes.push(B(10, ROOF, -33, 3, 2.4, 3, 0x98a2ac, 'metal'));
  boxes.push(B(-10, ROOF, -34, 4.5, 0.6, 2, 0xb0b8c0, 'metal'));

  // ---- 校舎の窓 (南面採光・北廊下窓) と屋上時計 ----
  const GLASS = 0x9fc8e8;
  for (let fl = 0; fl < FLOORS; fl++) {
    const Y = fl * FH;
    for (let wx = -25; wx <= 25; wx += 4.5) {
      if (fl === 0 && Math.abs(wx) < 3.5) continue;
      boxes.push(B(wx, Y + 1.2, -27.14, 2.8, 1.6, 0.18, GLASS, 'glass', { deco: 1 }));
    }
    for (let wx = -28; wx <= 28; wx += 7) {
      boxes.push(B(wx, Y + 1.4, -38.36, 3.2, 1.3, 0.18, GLASS, 'glass', { deco: 1 }));
    }
  }
  boxes.push(B(0, ROOF - 1.9, -27.2, 1.6, 1.6, 0.15, 0xf6f6f0, 'metal', { deco: 1 }));
  boxes.push(B(0, ROOF - 1.25, -27.15, 0.1, 0.6, 0.08, 0x22262c, 'metal', { deco: 1 }));
  boxes.push(B(0.24, ROOF - 1.2, -27.15, 0.45, 0.1, 0.08, 0x22262c, 'metal', { deco: 1 }));

  // ---- 体育館 (別棟) + 器具庫=牢屋 ----
  boxes.push(B(-34, 0, 24, 24, 0.12, 20, 0xd8b06a, 'wood'));
  boxes.push(...wallX(-46, -22, 14, 0, 7.5, 0.5, [[-40, -37], [-28, -25]], GYMC));
  boxes.push(...wallX(-46, -22, 34, 0, 7.5, 0.5, [], GYMC));
  boxes.push(...wallZ(14, 34, -46, 0, 7.5, 0.5, [], GYMC));
  boxes.push(...wallZ(14, 34, -22, 0, 7.5, 0.5, [[21, 24]], GYMC));
  boxes.push(B(-43.5, 0, 24, 4, 1.1, 14, 0xb08a54, 'wood'));
  boxes.push(...stairs(-41.2, 0, 18.5, 'w', 1.6, 4, 0.275, 0.4, 0xb08a54, 'wood'));
  boxes.push(B(-32, 0, 30, 1.3, 1.0, 1.3, 0xcc6655, 'wood'), B(-28, 0, 18, 1.3, 1.3, 1.3, 0xcc6655, 'wood'));
  boxes.push(B(-34, 6.2, 16, 1.8, 1.2, 0.3, 0xffffff, 'metal', { deco: 1 }));
  boxes.push(B(-34, 6.2, 32, 1.8, 1.2, 0.3, 0xffffff, 'metal', { deco: 1 }));
  const LINE = 0xf0ead8;
  boxes.push(B(-34, 0.125, 16.5, 15, 0.012, 0.12, LINE, 'tile', { deco: 1 }));
  boxes.push(B(-34, 0.125, 31.5, 15, 0.012, 0.12, LINE, 'tile', { deco: 1 }));
  boxes.push(B(-26.5, 0.125, 24, 0.12, 0.012, 15, LINE, 'tile', { deco: 1 }));
  boxes.push(B(-41.5, 0.125, 24, 0.12, 0.012, 15, LINE, 'tile', { deco: 1 }));
  boxes.push(B(-34, 0.125, 24, 15, 0.012, 0.12, LINE, 'tile', { deco: 1 }));
  boxes.push(B(-22.35, 4.5, 24, 0.15, 1.2, 2.6, 0x1e2a22, 'metal', { deco: 1 }));
  // 器具庫 (牢屋)
  boxes.push(...wallX(-27, -22, 28, 0, 3.0, 0.4, [[-26.2, -24.2]], 0x9a8a74));
  boxes.push(...wallZ(28, 34, -27, 0, 3.0, 0.4, [], 0x9a8a74));
  boxes.push(B(-23.5, 0, 33, 2.5, 0.9, 1.2, 0x8a7a64, 'wood'));

  // ---- 渡り廊下 (校舎西端→体育館) ----
  boxes.push(B(-29, 0, -6.5, 3, 0.1, 41, 0x9aa4ae, 'tile'));
  for (const pz of [-24, -14, -4, 6]) {
    boxes.push(B(-30.3, 0, pz, 0.25, 2.7, 0.25, 0x98a2ac, 'metal'));
    boxes.push(B(-27.7, 0, pz, 0.25, 2.7, 0.25, 0x98a2ac, 'metal'));
  }
  boxes.push(B(-29, 2.7, -5, 3.4, 0.18, 38, 0xb0b8c0, 'metal'));

  // ---- プール (25m級・フェンス囲い) ----
  boxes.push(B(36, 0, 25, 20, 0.12, 18, 0x9fc8d8, 'tile'));
  boxes.push(...wallX(26, 46, 16, 0, 1.9, 0.25, [[27, 29.4]], FENCE, 'fence'));
  boxes.push(...wallX(26, 46, 34, 0, 1.9, 0.25, [], FENCE, 'fence'));
  boxes.push(...wallZ(16, 34, 26, 0, 1.9, 0.25, [[19, 21.4]], FENCE, 'fence'));
  boxes.push(...wallZ(16, 34, 46, 0, 1.9, 0.25, [], FENCE, 'fence'));
  boxes.push(...wallX(29, 45, 19.5, 0, 0.45, 0.35, [], 0xd8e2e8, 'tile'));
  boxes.push(...wallX(29, 45, 30.5, 0, 0.45, 0.35, [], 0xd8e2e8, 'tile'));
  boxes.push(...wallZ(19.5, 30.5, 29, 0, 0.45, 0.35, [], 0xd8e2e8, 'tile'));
  boxes.push(...wallZ(19.5, 30.5, 45, 0, 0.45, 0.35, [], 0xd8e2e8, 'tile'));
  boxes.push(B(37, 0, 25, 15.6, 0.28, 10.6, 0x58b8e8, 'water', { deco: 1, glow: 1 }));
  for (const sx of [31, 34, 37, 40, 43]) boxes.push(B(sx, 0, 18.4, 1.2, 0.55, 0.9, 0xd0d5da, 'metal'));

  // ---- 校庭: 朝礼台・国旗掲揚塔・サッカーゴール・鉄棒・砂場 ----
  boxes.push(B(0, 0, -22, 2.2, 0.9, 2.2, 0x98a2ac, 'metal'));
  boxes.push(...stairs(1.6, 0, -22, 'e', 1.4, 3, 0.3, 0.4, 0x98a2ac, 'metal'));
  boxes.push(B(-4, 0, -24, 0.14, 7.5, 0.14, 0xb8c0c8, 'metal', { deco: 1 }));
  boxes.push(B(-3.45, 6.6, -24, 1.0, 0.7, 0.06, 0xffffff, 'metal', { deco: 1 }));
  for (const gz of [-16, 4]) {
    boxes.push(B(-8 - 2.2, 0, gz, 0.15, 1.9, 0.15, 0xffffff, 'metal', { deco: 1 }));
    boxes.push(B(-8 + 2.2, 0, gz, 0.15, 1.9, 0.15, 0xffffff, 'metal', { deco: 1 }));
    boxes.push(B(-8, 1.9, gz, 4.55, 0.15, 0.15, 0xffffff, 'metal', { deco: 1 }));
  }
  boxes.push(B(-8, 0.005, -6, 0.1, 0.02, 19.5, 0xe8e0cc, 'dirt', { deco: 1 }));
  boxes.push(B(-8, 0.005, -6, 14, 0.02, 0.1, 0xe8e0cc, 'dirt', { deco: 1 }));
  for (let i = 0; i < 3; i++) boxes.push(B(14 + i * 2.2, 0, -14, 0.15, 1.3 + i * 0.25, 0.15, 0x888888, 'metal', { deco: 1 }));
  boxes.push(B(21, 0, -13.5, 5, 0.25, 4, 0xe0cfa0, 'dirt'));
  boxes.push(B(14, 0, 2, 0.7, 1.3, 0.7, 0xf4f4ee, 'wood', { deco: 1 }));
  boxes.push(B(14, 1.3, 2, 0.9, 0.15, 0.9, 0x8a8478, 'wood', { deco: 1 }));
  // 校門・門柱・二宮金次郎像・校名板
  boxes.push(B(-3.5, 0, 39.2, 1.0, 2.0, 1.0, 0x8a8478, 'stone'));
  boxes.push(B(3.5, 0, 39.2, 1.0, 2.0, 1.0, 0x8a8478, 'stone'));
  boxes.push(B(4.2, 1.0, 38.65, 0.55, 0.95, 0.1, 0xe8e2d4, 'stone', { deco: 1 }));
  boxes.push(B(0, 0, 8, 3, 0.1, 62, 0x9aa4ae, 'tile'));
  boxes.push(B(6.5, 0, -25.5, 0.5, 0.9, 0.5, 0x8a8478, 'stone', { deco: 1 }));
  boxes.push(B(6.5, 0.9, -25.5, 0.4, 0.7, 0.4, 0x6a7480, 'stone', { deco: 1 }));
  // 桜並木
  for (const [tx, tz] of [[49, -30], [49, -20], [49, 20], [49, 30], [14, 37], [-14, 37], [26, 37], [-49, -20], [-49, 0], [-49, 10], [-42, -34], [40, -34], [-38, 37], [-46, 37]]) {
    boxes.push(B(tx, 0, tz, 0.7, 2.6, 0.7, 0x6a4a34, 'wood'));
    boxes.push(B(tx, 2.4, tz, 3.4, 2.4, 3.4, ((tx + tz) & 1) ? 0xf7c1d4 : 0xf0a8c0, 'leaf', { deco: 1 }));
  }
  // 飼育小屋
  boxes.push(...wallX(40, 46, -34, 0, 1.6, 0.2, [], FENCE, 'fence'));
  boxes.push(...wallX(40, 46, -30, 0, 1.6, 0.2, [[42, 44]], FENCE, 'fence'));
  boxes.push(...wallZ(-34, -30, 40, 0, 1.6, 0.2, [], FENCE, 'fence'));
  boxes.push(...wallZ(-34, -30, 46, 0, 1.6, 0.2, [], FENCE, 'fence'));
  boxes.push(B(43, 1.7, -32, 6.6, 0.15, 4.6, 0x8a7a5a, 'wood', { deco: 1 }));

  return {
    id: 'school', name: '学校', boxes,
    sky: 0xffb37a, fog: { color: 0xffc490, near: 55, far: 185 },
    ambient: 0.65, sun: 0.9, sunColor: 0xffd9a8,
    lights: [{ x: -34, y: 6.5, z: 24, c: 0xfff4dd, i: 24, d: 28 }, { x: 0, y: 4, z: -20, c: 0xfff4dd, i: 16, d: 20 }, { x: 36, y: 4.5, z: 25, c: 0xfff4dd, i: 20, d: 24 }],
    bounds: { minX: -51, maxX: 51, minZ: -39, maxZ: 39 },
    jail: { x: -24.5, y: 0, z: 31, w: 4.5, d: 5 },
    spawns: {
      oni: [[0, 0.1, -6], [2.5, 0.1, -3], [-2.5, 0.1, -3], [2.5, 0.1, -9], [-2.5, 0.1, -9], [0, 0.1, -1], [4.5, 0.1, -6], [-4.5, 0.1, -6]],
      run: [
        [-24, 0.3, -36.3], [24, 0.3, -36.3], [0, 0.3, -36.3], [-24, FH + 0.3, -36.3], [24, FH + 0.3, -36.3],
        [0, FH * 2 + 0.3, -36.3], [0, ROOF + 0.1, -33], [-34, 0.3, 24], [36, 0.4, 25],
        [21, 0.4, -13.5], [0, 0.1, 36], [0, 0.1, -30]
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
