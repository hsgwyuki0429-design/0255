const R = 0.32;
const H = 1.66;
const STEP = 0.34;
const EPS = 0.001;
const BOUNCE_V = 9.2;

function overlaps(px, py, pz, s) {
  return px + R > s.minX && px - R < s.maxX &&
         py + H > s.minY && py < s.maxY &&
         pz + R > s.minZ && pz - R < s.maxZ;
}

export function moveCapsule(pos, vel, dt, solids) {
  let onGround = false, hitWall = false, bounced = false;
  const near = [];
  for (const s of solids) {
    if (pos.x + 3 > s.minX && pos.x - 3 < s.maxX && pos.z + 3 > s.minZ && pos.z - 3 < s.maxZ &&
        pos.y + 4 > s.minY && pos.y - 4 < s.maxY) near.push(s);
  }

  let nx = pos.x + vel.x * dt;
  for (const s of near) {
    if (!overlaps(nx, pos.y, pos.z, s)) continue;
    if (s.maxY - pos.y <= STEP && s.maxY - pos.y > -EPS && canStand(nx, s.maxY, pos.z, near, s)) {
      pos.y = s.maxY; continue;
    }
    hitWall = true;
    if (vel.x > EPS) nx = s.minX - R - EPS;
    else if (vel.x < -EPS) nx = s.maxX + R + EPS;
    else nx = (nx > (s.minX + s.maxX) / 2) ? s.maxX + R + EPS : s.minX - R - EPS;
  }
  pos.x = nx;

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

  let ny = pos.y + vel.y * dt;
  for (const s of near) {
    if (!overlaps(pos.x, ny, pos.z, s)) continue;
    if (vel.y <= 0 && pos.y >= s.maxY - 0.35) {
      if (s.bounce && vel.y < -2.5) {
        ny = s.maxY; vel.y = BOUNCE_V; bounced = true;
      } else {
        ny = s.maxY; vel.y = 0; onGround = true;
      }
    } else if (vel.y > 0 && pos.y + H <= s.minY + 0.35) {
      ny = s.minY - H - EPS; vel.y = 0;
    }
  }
  pos.y = ny;
  if (pos.y < -20) { pos.y = 8; vel.y = 0; }
  if (!onGround && vel.y <= 0) {
    for (const s of near) {
      if (pos.x + R > s.minX && pos.x - R < s.maxX && pos.z + R > s.minZ && pos.z - R < s.maxZ &&
          Math.abs(pos.y - s.maxY) < 0.02) { onGround = true; break; }
    }
  }
  return { onGround, hitWall, bounced };
}

function canStand(x, y, z, solids, ignore) {
  for (const s of solids) {
    if (s === ignore) continue;
    if (overlaps(x, y + EPS, z, s) && s.maxY - y > STEP) return false;
  }
  return true;
}
