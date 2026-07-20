// NavGrid 到達性検証: スポーン↔牢屋の往復到達性と、歩けるのに到達できない「島」を洗い出す。
import { MAPS, solidsOf } from '../public/shared/mapdata.js';
import { NavGrid } from '../server/nav.js';

const CELL = 0.6;
const WALK_DH = 0.45, JUMP_DH = 1.05, DROP_DH = 3.8;

function neighbors(nav, ci, cj, li) {
  const NZ = nav.nz;
  const lv = nav.levels[ci * NZ + cj];
  if (li >= lv.length) return [];
  const h = lv[li];
  const out = [];
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [1, 1, 1], [1, -1, 1], [-1, 1, 1], [-1, -1, 1]];
  for (const [di, dj, diag] of DIRS) {
    const ni = ci + di, nj = cj + dj;
    if (ni < 0 || nj < 0 || ni >= nav.nx || nj >= nav.nz) continue;
    const nlv = nav.levels[ni * NZ + nj];
    for (let nli = 0; nli < nlv.length; nli++) {
      const dh = nlv[nli] - h;
      let ok = false;
      if (Math.abs(dh) <= WALK_DH) ok = true;
      else if (!diag && dh > 0 && dh <= JUMP_DH) ok = true;
      else if (!diag && dh < 0 && -dh <= DROP_DH) ok = true;
      if (!ok) continue;
      if (diag) {
        const a = nav.levels[ci * NZ + nj].some(v => Math.abs(v - h) <= WALK_DH);
        const b = nav.levels[ni * NZ + cj].some(v => Math.abs(v - h) <= WALK_DH);
        if (!a || !b) continue;
      }
      out.push([ni, nj, nli]);
    }
  }
  return out;
}

function floodFrom(nav, starts) {
  const NZ = nav.nz, MAXL = 6;
  const seen = new Set();
  const key = (i, j, li) => (i * NZ + j) * MAXL + li;
  const stack = [];
  for (const [x, y, z] of starts) {
    const n = nav.sample(x, y, z, 3);
    if (n) { const k = key(n.i, n.j, n.li); if (!seen.has(k)) { seen.add(k); stack.push([n.i, n.j, n.li]); } }
  }
  while (stack.length) {
    const [ci, cj, li] = stack.pop();
    for (const [ni, nj, nli] of neighbors(nav, ci, cj, li)) {
      const k = key(ni, nj, nli);
      if (!seen.has(k)) { seen.add(k); stack.push([ni, nj, nli]); }
    }
  }
  return { seen, key };
}

let anyFail = false;
for (const mapId of ['cave', 'mall', 'school']) {
  const map = MAPS[mapId];
  const solids = solidsOf(map);
  const nav = new NavGrid(map, solids);
  const NZ = nav.nz, MAXL = 6;
  const key = (i, j, li) => (i * NZ + j) * MAXL + li;

  // 全歩行可能ノード数
  let totalNodes = 0;
  for (let i = 0; i < nav.nx; i++) for (let j = 0; j < nav.nz; j++) totalNodes += nav.levels[i * nav.nz + j].length;

  // 鬼スポーン(中央)から到達可能な集合
  const { seen } = floodFrom(nav, map.spawns.oni);

  console.log(`\n===== ${mapId} (${map.name}) =====`);
  console.log(`grid ${nav.nx}x${nav.nz}, walkable nodes=${totalNodes}, reachable=${seen.size} (${(100 * seen.size / totalNodes).toFixed(1)}%)`);

  // スポーン全点 + 牢屋 の到達性
  const checkPt = (label, x, y, z) => {
    const n = nav.sample(x, y, z, 3);
    const ok = n && seen.has(key(n.i, n.j, n.li));
    if (!ok) { anyFail = true; console.log(`  ❌ ${label} (${x},${y},${z}) 到達不可` + (n ? '' : ' [nav未サンプル]')); }
    return ok;
  };
  map.spawns.oni.forEach((s, i) => checkPt(`oniスポーン#${i}`, ...s));
  map.spawns.run.forEach((s, i) => checkPt(`runスポーン#${i}`, ...s));
  const j = map.jail;
  checkPt('牢屋', j.x, j.y, j.z);

  // 牢屋からの往復(牢屋→鬼スポーンへ戻れるか)
  const backFromJail = floodFrom(nav, [[j.x, j.y, j.z]]);
  const oni0 = nav.sample(...map.spawns.oni[0], 3);
  if (oni0 && !backFromJail.seen.has(key(oni0.i, oni0.j, oni0.li))) {
    anyFail = true; console.log('  ❌ 牢屋から鬼スポーンへ戻れない(往復不可)');
  }

  // 到達できない「島」を検出(周囲より広いまとまり=入れない部屋の候補)
  const islands = [];
  const visited = new Set(seen);
  for (let i = 0; i < nav.nx; i++) for (let j2 = 0; j2 < nav.nz; j2++) {
    const lv = nav.levels[i * nav.nz + j2];
    for (let li = 0; li < lv.length; li++) {
      const k = key(i, j2, li);
      if (visited.has(k)) continue;
      // BFSで島を収集
      const cells = [];
      const st = [[i, j2, li]]; visited.add(k);
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, hSum = 0, hMin = 1e9;
      while (st.length) {
        const [ci, cj, cli] = st.pop();
        const wx = nav.minX + (ci + 0.5) * CELL, wz = nav.minZ + (cj + 0.5) * CELL;
        const hh = nav.levels[ci * nav.nz + cj][cli];
        minX = Math.min(minX, wx); maxX = Math.max(maxX, wx);
        minZ = Math.min(minZ, wz); maxZ = Math.max(maxZ, wz);
        hSum += hh; hMin = Math.min(hMin, hh);
        cells.push([ci, cj, cli]);
        for (const [ni, nj, nli] of neighbors(nav, ci, cj, cli)) {
          const kk = key(ni, nj, nli);
          if (!visited.has(kk)) { visited.add(kk); st.push([ni, nj, nli]); }
        }
      }
      if (cells.length >= 12) islands.push({ n: cells.length, minX, maxX, minZ, maxZ, h: hSum / cells.length });
    }
  }
  islands.sort((a, b) => b.n - a.n);
  // 床レベル(h<1.6)の島は「入れない部屋」の可能性が高い。屋根/壁上面(h高)と区別して表示。
  const ground = islands.filter(is => is.h < 1.6);
  if (ground.length) {
    console.log(`  🚨 床レベルの到達不能領域(入れない部屋の疑い) ${ground.length}件:`);
    for (const is of ground) console.log(`     ${is.n}セル h≈${is.h.toFixed(1)}  x[${is.minX.toFixed(1)}..${is.maxX.toFixed(1)}] z[${is.minZ.toFixed(1)}..${is.maxZ.toFixed(1)}]`);
  }
  if (islands.length) {
    console.log(`  ⚠️ 到達不能な島 全${islands.length}件(上位):`);
    for (const is of islands.slice(0, 10)) console.log(`     ${is.n}セル h≈${is.h.toFixed(1)}  x[${is.minX.toFixed(1)}..${is.maxX.toFixed(1)}] z[${is.minZ.toFixed(1)}..${is.maxZ.toFixed(1)}]`);
  } else {
    console.log('  ✅ 到達不能な広い島なし');
  }
}
console.log('\n' + (anyFail ? '=== 到達性: 失敗あり ===' : '=== 到達性: スポーン/牢屋は全てOK ==='));
process.exit(anyFail ? 1 : 0);
