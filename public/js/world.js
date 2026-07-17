// マップデータ → Three.js シーン構築 + 衝突用AABBリスト生成
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAPS } from '/shared/mapdata.js';

export function buildWorld(scene, mapId, quality) {
  const map = MAPS[mapId];
  const group = new THREE.Group();
  const solids = [];

  // 色+材質ごとにジオメトリをマージして描画コールを削減
  const buckets = new Map();
  for (const b of map.boxes) {
    if (b.w <= 0 || b.h <= 0 || b.d <= 0) continue;
    const key = b.c + '|' + b.m + '|' + (b.glow ? 1 : 0);
    if (!buckets.has(key)) buckets.set(key, []);
    const g = new THREE.BoxGeometry(b.w, b.h, b.d);
    g.translate(b.x, b.y + b.h / 2, b.z);
    buckets.get(key).push(g);
    if (!b.deco) {
      solids.push({
        minX: b.x - b.w / 2, maxX: b.x + b.w / 2,
        minY: b.y, maxY: b.y + b.h,
        minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2
      });
    }
  }
  for (const [key, geos] of buckets) {
    const [c, m, glow] = key.split('|');
    const merged = mergeGeometries(geos);
    geos.forEach(g => g.dispose());
    const params = { color: parseInt(c), roughness: 0.85, metalness: 0.05 };
    if (m === 'metal') { params.roughness = 0.4; params.metalness = 0.5; }
    if (m === 'tile') params.roughness = 0.55;
    if (m === 'water') { params.roughness = 0.15; params.transparent = true; params.opacity = 0.85; }
    if (m === 'crystal') { params.transparent = true; params.opacity = 0.85; params.roughness = 0.2; }
    if (glow === '1') { params.emissive = parseInt(c); params.emissiveIntensity = m === 'crystal' ? 0.9 : 0.6; }
    const mat = new THREE.MeshStandardMaterial(params);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = quality.shadows;
    mesh.castShadow = quality.shadows;
    group.add(mesh);
  }
  scene.add(group);

  // 環境光・太陽光・フォグ・空
  scene.background = new THREE.Color(map.sky);
  scene.fog = new THREE.Fog(map.fog.color, map.fog.near, map.fog.far);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, map.ambient);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(map.sunColor, map.sun);
  sun.position.set(30, 50, 20);
  if (quality.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const S = 45;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 5, far: 120 });
    sun.shadow.bias = -0.0005;
  }
  scene.add(sun);
  // マップ固有のポイントライト (洞窟のクリスタルなど)
  const maxLights = quality.high ? 8 : 4;
  for (const l of (map.lights || []).slice(0, maxLights)) {
    const pl = new THREE.PointLight(l.c, l.i, l.d, 1.8);
    pl.position.set(l.x, l.y, l.z);
    scene.add(pl);
  }
  // 牢屋のマーカー (光る床)
  const jail = map.jail;
  const jm = new THREE.Mesh(
    new THREE.PlaneGeometry(jail.w, jail.d),
    new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.14, side: THREE.DoubleSide })
  );
  jm.rotation.x = -Math.PI / 2;
  jm.position.set(jail.x, jail.y + 0.06, jail.z);
  group.add(jm);

  return { map, group, solids };
}

// カメラの壁めり込み防止: 注視点→カメラ位置の間に遮蔽があれば手前に寄せる
export function clampCamera(from, to, solids) {
  const dir = to.clone().sub(from);
  const len = dir.length();
  if (len < 0.001) return to;
  dir.normalize();
  const steps = 14;
  for (let i = 2; i <= steps; i++) {
    const t = (i / steps) * len;
    const p = from.clone().addScaledVector(dir, t);
    for (const s of solids) {
      if (p.x > s.minX - 0.18 && p.x < s.maxX + 0.18 &&
          p.y > s.minY - 0.18 && p.y < s.maxY + 0.18 &&
          p.z > s.minZ - 0.18 && p.z < s.maxZ + 0.18) {
        return from.clone().addScaledVector(dir, Math.max(0.4, t - 0.35));
      }
    }
  }
  return to;
}
