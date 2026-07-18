// マップデータ → Three.js シーン構築 + 衝突用AABBリスト生成
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAPS, solidsOf } from '/shared/mapdata.js';

// ============================================================
// 手続きテクスチャ: 画像ファイルを増やさず、既存の材質分類 (b.m) ごとに
// canvas へ模様を描いて生成する。ほぼグレースケールで描き、マテリアル色との
// 乗算で発色させるため、マップごとの配色デザインはそのまま保たれる。
// ============================================================
const texCache = new Map();

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const gray = v => `rgb(${v | 0},${v | 0},${v | 0})`;

const TEX_DRAW = {
  // 岩肌: まだら + ひび
  stone(g, S, r) {
    g.fillStyle = gray(220); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = gray(204 + r() * 34);
      g.beginPath();
      g.ellipse(r() * S, r() * S, 5 + r() * 16, 4 + r() * 10, r() * 3.2, 0, 6.3);
      g.fill();
    }
    g.strokeStyle = 'rgba(90,90,90,.28)'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      let x = r() * S, y = r() * S;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += r() * 34 - 17; y += r() * 34 - 17; g.lineTo(x, y); }
      g.stroke();
    }
  },
  // 土: 細かい砂粒 + 湿り気のむら
  dirt(g, S, r) {
    g.fillStyle = gray(216); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 12; i++) {
      g.fillStyle = `rgba(105,95,80,${0.04 + r() * 0.05})`;
      g.beginPath(); g.ellipse(r() * S, r() * S, 16 + r() * 26, 12 + r() * 18, r() * 3.2, 0, 6.3); g.fill();
    }
    for (let i = 0; i < 420; i++) {
      g.fillStyle = gray(192 + r() * 48);
      g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
    }
  },
  // 木: 縦板 + 木目 (木目だけ暖色にして乗算後もぬくもりを出す)
  wood(g, S, r) {
    for (let p = 0; p < 4; p++) {
      g.fillStyle = gray(212 + r() * 22);
      g.fillRect(p * 32, 0, 32, S);
      g.strokeStyle = 'rgba(115,90,65,.20)'; g.lineWidth = 1;
      for (let l = 0; l < 3; l++) {
        const x0 = p * 32 + 6 + l * 9 + r() * 4;
        g.beginPath(); g.moveTo(x0, 0);
        for (let y = 0; y <= S; y += 16) g.lineTo(x0 + Math.sin(y * 0.11 + p + l) * 2.4, y);
        g.stroke();
      }
      if (r() < 0.6) { // 節
        g.strokeStyle = 'rgba(105,80,55,.30)';
        g.beginPath(); g.ellipse(p * 32 + 8 + r() * 16, r() * S, 2.5, 4, 0, 0, 6.3); g.stroke();
      }
    }
    g.fillStyle = 'rgba(80,70,60,.35)';
    for (let p = 0; p <= 4; p++) g.fillRect(p * 32 - 1, 0, 2, S);
  },
  // タイル: 目地グリッド + タイルごとの色むら
  tile(g, S, r) {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      g.fillStyle = gray(229 + r() * 14);
      g.fillRect(i * 32, j * 32, 32, 32);
    }
    g.strokeStyle = 'rgba(125,125,130,.55)'; g.lineWidth = 2;
    for (let k = 0; k <= 4; k++) {
      g.beginPath(); g.moveTo(k * 32, 0); g.lineTo(k * 32, S); g.stroke();
      g.beginPath(); g.moveTo(0, k * 32); g.lineTo(S, k * 32); g.stroke();
    }
  },
  // 金属: ヘアライン + わずかな汚れ
  metal(g, S, r) {
    g.fillStyle = gray(228); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.05})`;
      g.fillRect(0, r() * S, S, 1);
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(55,58,66,${0.04 + r() * 0.05})`;
      g.fillRect(0, r() * S, S, 1);
    }
  },
  // 陳列棚: 棚板の横ライン + 商品の色むら
  shelf(g, S, r) {
    g.fillStyle = gray(226); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 46; i++) {
      g.fillStyle = gray(186 + r() * 56);
      g.fillRect(r() * S, ((r() * 4) | 0) * 30 + 10, 4 + r() * 9, 9 + r() * 9);
    }
    for (let y = 4; y < S; y += 30) {
      g.fillStyle = 'rgba(70,70,80,.30)'; g.fillRect(0, y, S, 3);
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, y + 3, S, 2);
    }
  },
  // 葉: 木漏れ日のまだら
  leaf(g, S, r) {
    g.fillStyle = gray(198); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 110; i++) {
      g.fillStyle = gray(168 + r() * 74);
      g.beginPath(); g.arc(r() * S, r() * S, 3 + r() * 8, 0, 6.3); g.fill();
    }
  },
  // 水面: 横に流れるさざ波
  water(g, S, r) {
    g.fillStyle = gray(232); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 16; i++) {
      const y0 = r() * S;
      g.strokeStyle = i % 2 ? 'rgba(255,255,255,.35)' : 'rgba(110,135,150,.22)';
      g.lineWidth = 1 + r() * 1.5;
      g.beginPath(); g.moveTo(0, y0);
      for (let x = 0; x <= S; x += 8) g.lineTo(x, y0 + Math.sin(x * 0.12 + i * 2) * 3);
      g.stroke();
    }
  },
  // 骨: 縦のすじ + 小さな窪み
  bone(g, S, r) {
    g.fillStyle = gray(236); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(150,140,115,${0.06 + r() * 0.09})`;
      g.fillRect(r() * S, 0, 1 + r() * 2, S);
    }
    for (let i = 0; i < 20; i++) {
      g.fillStyle = 'rgba(120,112,95,.18)';
      g.beginPath(); g.arc(r() * S, r() * S, 1 + r() * 2, 0, 6.3); g.fill();
    }
  },
  // フェンス: 金網のひし形クロス
  fence(g, S, r) {
    g.fillStyle = gray(232); g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(85,92,100,.4)'; g.lineWidth = 2;
    for (let k = -S; k <= S * 2; k += 16) {
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k + S, S); g.stroke();
      g.beginPath(); g.moveTo(k, S); g.lineTo(k + S, 0); g.stroke();
    }
  },
  // 結晶: 斜めのファセット筋
  crystal(g, S, r) {
    g.fillStyle = gray(232); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 14; i++) {
      const x = r() * S;
      g.fillStyle = i % 2 ? 'rgba(255,255,255,.28)' : 'rgba(140,150,170,.16)';
      g.beginPath();
      g.moveTo(x, 0); g.lineTo(x + 20 + r() * 20, S); g.lineTo(x + 26 + r() * 24, S); g.lineTo(x + 5, 0);
      g.closePath(); g.fill();
    }
  }
};
TEX_DRAW.rail = TEX_DRAW.metal;

function texFor(m) {
  if (m === 'sign') return null; // 看板は発光パネルなので無地のまま
  const name = TEX_DRAW[m] ? m : 'stone';
  if (texCache.has(name)) return texCache.get(name);
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  let seed = 0;
  for (const ch of name) seed = seed * 31 + ch.charCodeAt(0);
  TEX_DRAW[name](cv.getContext('2d'), S, rng(seed));
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(name, tex);
  return tex;
}

// BoxGeometryのUVを実寸に合わせて伸ばし、テクスチャ密度を全ボックスで均一にする
// (1タイル=2m)。ボックスごとに位相をずらして繰り返しの単調さを消す。
const UV_K = 0.5;
function scaleBoxUV(geo, b) {
  const uv = geo.attributes.uv;
  const ou = (b.x * 0.37 + b.y * 0.11) % 1, ov = (b.z * 0.37 + b.y * 0.13) % 1;
  const dims = [[b.d, b.h], [b.d, b.h], [b.w, b.d], [b.w, b.d], [b.w, b.h], [b.w, b.h]]; // +x,-x,+y,-y,+z,-z
  for (let f = 0; f < 6; f++) {
    const [du, dv] = dims[f];
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * du * UV_K + ou, uv.getY(i) * dv * UV_K + ov);
    }
  }
}

export function buildWorld(scene, mapId, quality) {
  const map = MAPS[mapId];
  const group = new THREE.Group();
  const solids = solidsOf(map);

  // 色+材質ごとにジオメトリをマージして描画コールを削減
  const buckets = new Map();
  for (const b of map.boxes) {
    if (b.w <= 0 || b.h <= 0 || b.d <= 0) continue;
    const key = b.c + '|' + b.m + '|' + (b.glow ? 1 : 0);
    if (!buckets.has(key)) buckets.set(key, []);
    const g = new THREE.BoxGeometry(b.w, b.h, b.d);
    scaleBoxUV(g, b);
    g.translate(b.x, b.y + b.h / 2, b.z);
    buckets.get(key).push(g);
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
    const tex = texFor(m);
    if (tex) {
      params.map = tex;
      if (glow === '1') params.emissiveMap = tex; // 発光にも模様を通して質感を保つ
    }
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
    const S = 75;
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
