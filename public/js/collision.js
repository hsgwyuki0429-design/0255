// カプセル(円柱近似) vs AABB の移動・衝突解決
// 階段は「段差0.34mまで自動でせり上がる」ステップアップ方式
const R = 0.32;        // 半径
const H = 1.66;        // 身長
const STEP = 0.34;     // 乗り越えられる段差
const EPS = 0.001;

function overlaps(px, py, pz, s) {
  return px + R > s.minX && px - R < s.maxX &&
         py + H > s.minY && py < s.maxY &&
         pz + R > s.minZ && pz - R < s.maxZ;
}

// 位置pos{x,y,z}, 速度vel{x,y,z} を dt 進める。solids は AABB配列。
// 戻り値: {onGround, hitWall}
export function moveCapsule(pos, vel, dt, solids) {
  let onGround = false, hitWall = false;
  // 近傍だけに絞る
  const near = [];
  for (const s of solids) {
    if (pos.x + 3 > s.minX && pos.x - 3 < s.maxX && pos.z + 3 > s.minZ && pos.z - 3 < s.maxZ &&
        pos.y + 4 > s.minY && pos.y - 4 < s.maxY) near.push(s);
  }

  // ---- 水平 X ----
  let nx = pos.x + vel.x * dt;
  for (const s of near) {
    if (!overlaps(nx, pos.y, pos.z, s)) continue;
    // ステップアップ可能?(低い段差 + 頭上が空いている)
    if (s.maxY - pos.y <= STEP && s.maxY - pos.y > -EPS && canStand(nx, s.maxY, pos.z, near, s)) {
      pos.y = s.maxY; continue;
    }
    hitWall = true;
    if (vel.x > EPS) nx = s.minX - R - EPS;
    else if (vel.x < -EPS) nx = s.maxX + R + EPS;
    else nx = (nx > (s.minX + s.maxX) / 2) ? s.maxX + R + EPS : s.minX - R - EPS; // 速度0なら近い面へ押し出す
  }
  pos.x = nx;

  // ---- 水平 Z ----
  let nz = pos.z + vel.z * dt;
  for (const s of near) {
    if (!overlaps(pos.x, pos.y, nz, s)) continue;
    if (s.maxY - pos.y <= STEP && s.maxY - pos.y > -EPS && canStand(pos.x, s.maxY, nz, near, s)) {
      pos.y = s.maxY; continue;
    }
    hitWall = true;
    if (vel.z > EPS) nz = s.minZ - R - EPS;
    else if (vel.z < -EPS) nz = s.maxZ + R + EPS;
    else nz = (nz > (s.minZ + s.maxZ) / 2) ? s.maxZ + R + EPS : s.minZ - R - EPS;
  }
  pos.z = nz;

  // ---- 垂直 Y ----
  let ny = pos.y + vel.y * dt;
  for (const s of near) {
    if (!overlaps(pos.x, ny, pos.z, s)) continue;
    if (vel.y <= 0 && pos.y >= s.maxY - 0.35) {       // 落下 → 上面に着地
      ny = s.maxY; vel.y = 0; onGround = true;
    } else if (vel.y > 0 && pos.y + H <= s.minY + 0.35) { // 上昇 → 底面に頭ぶつけ
      ny = s.minY - H - EPS; vel.y = 0;
    }
  }
  pos.y = ny;
  if (pos.y < -20) { pos.y = 8; vel.y = 0; } // 万一の落下復帰
  // 接地の追加判定 (完全静止時)
  if (!onGround && vel.y <= 0) {
    for (const s of near) {
      if (pos.x + R > s.minX && pos.x - R < s.maxX && pos.z + R > s.minZ && pos.z - R < s.maxZ &&
          Math.abs(pos.y - s.maxY) < 0.02) { onGround = true; break; }
    }
  }
  return { onGround, hitWall };
}

function canStand(x, y, z, solids, ignore) {
  for (const s of solids) {
    if (s === ignore) continue;
    if (overlaps(x, y + EPS, z, s) && s.maxY - y > STEP) return false;
  }
  return true;
}
