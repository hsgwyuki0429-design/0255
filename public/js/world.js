import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAPS, solidsOf } from '/shared/mapdata.js';

// ============================================================
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
      if (r() < 0.6) {
        g.strokeStyle = 'rgba(105,80,55,.30)';
        g.beginPath(); g.ellipse(p * 32 + 8 + r() * 16, r() * S, 2.5, 4, 0, 0, 6.3); g.stroke();
      }
    }
    g.fillStyle = 'rgba(80,70,60,.35)';
    for (let p = 0; p <= 4; p++) g.fillRect(p * 32 - 1, 0, 2, S);
  },
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
  leaf(g, S, r) {
    g.fillStyle = gray(198); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 110; i++) {
      g.fillStyle = gray(168 + r() * 74);
      g.beginPath(); g.arc(r() * S, r() * S, 3 + r() * 8, 0, 6.3); g.fill();
    }
  },
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
  fence(g, S, r) {
    g.fillStyle = gray(232); g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(85,92,100,.4)'; g.lineWidth = 2;
    for (let k = -S; k <= S * 2; k += 16) {
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k + S, S); g.stroke();
      g.beginPath(); g.moveTo(k, S); g.lineTo(k + S, 0); g.stroke();
    }
  },
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

// ============================================================
// ============================================================
function css(hex, f = 1) {
  const r = Math.min(255, ((hex >> 16) & 255) * f) | 0;
  const g = Math.min(255, ((hex >> 8) & 255) * f) | 0;
  const b = Math.min(255, (hex & 255) * f) | 0;
  return `rgb(${r},${g},${b})`;
}
const SPINES = [0xb3453e, 0x3e68b3, 0x3e9b57, 0xc9973b, 0x7a4ab0, 0x2a8a9a, 0xb35c8a, 0x8a8a3e, 0xd0d0c8, 0x4a4a55];
const PACKS = [0xe05555, 0xf0a030, 0x50a8e0, 0x60c070, 0xf0e060, 0xd070c0, 0xffffff, 0x8060d0];

const ART_DRAW = {
  books(g, S, r, c) {
    g.fillStyle = css(c, 0.72); g.fillRect(0, 0, S, S);
    for (let row = 0; row < 4; row++) {
      const y = row * 32;
      let x = 2 + r() * 4;
      while (x < S - 5) {
        const w = 5 + r() * 8, h = 19 + r() * 8;
        g.fillStyle = css(SPINES[(r() * SPINES.length) | 0], 0.85 + r() * 0.3);
        g.fillRect(x, y + 28 - h, w, h);
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.fillRect(x + 1, y + 31 - h, w - 2, 1.5);
        x += w + 1 + (r() < 0.12 ? 6 : 0);
      }
      g.fillStyle = css(c, 1.2); g.fillRect(0, y + 28, S, 4);
    }
  },
  goods(g, S, r, c) {
    g.fillStyle = css(c, 0.8); g.fillRect(0, 0, S, S);
    for (let row = 0; row < 4; row++) {
      const y = row * 32;
      let x = 2;
      while (x < S - 7) {
        const w = 8 + r() * 8, h = 13 + r() * 11;
        g.fillStyle = css(PACKS[(r() * PACKS.length) | 0], 0.9 + r() * 0.25);
        g.fillRect(x, y + 27 - h, w, h);
        g.fillStyle = 'rgba(255,255,255,.7)';
        g.fillRect(x + 1, y + 27 - h * 0.45, w - 2, 3);
        x += w + 2;
      }
      g.fillStyle = css(c, 1.22); g.fillRect(0, y + 27, S, 5);
    }
  },
  locker(g, S, r, c) {
    g.fillStyle = css(c, 0.65); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      g.fillStyle = css(c, 1.0 + ((i * 4 + j) % 3) * 0.07);
      g.fillRect(i * 32 + 1.5, j * 32 + 1.5, 29, 29);
      g.fillStyle = 'rgba(30,30,35,.5)';
      g.fillRect(i * 32 + 24, j * 32 + 13, 4, 6);
      g.fillStyle = 'rgba(30,30,35,.25)';
      for (let v = 0; v < 3; v++) g.fillRect(i * 32 + 7, j * 32 + 5 + v * 3, 14, 1.2);
    }
  },
  vend(g, S, r, c) {
    g.fillStyle = css(c, 0.95); g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(15,15,25,.9)'; g.fillRect(10, 8, S - 20, 62);
    for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) {
      g.fillStyle = css(PACKS[(r() * PACKS.length) | 0]);
      g.fillRect(15 + i * 17, 14 + row * 28, 12, 20);
      g.fillStyle = 'rgba(255,255,255,.6)';
      g.fillRect(15 + i * 17, 22 + row * 28, 12, 3);
    }
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(10, 76, S - 20, 10);
    g.fillStyle = 'rgba(15,15,25,.85)'; g.fillRect(24, 96, S - 48, 22);
  },
  board(g, S, r, c) {
    g.fillStyle = css(c); g.fillRect(0, 0, S, S);
    for (let row = 0; row < 5; row++) {
      const y = 14 + row * 22 + r() * 5;
      let x = 6 + r() * 10;
      g.strokeStyle = row === 1 ? 'rgba(250,230,140,.75)' : 'rgba(245,245,240,.7)';
      g.lineWidth = 2;
      while (x < S - 12) {
        const w = 8 + r() * 14;
        g.beginPath(); g.moveTo(x, y + (r() - 0.5) * 3);
        g.quadraticCurveTo(x + w / 2, y + (r() - 0.5) * 5, x + w, y + (r() - 0.5) * 3);
        g.stroke();
        x += w + 5 + r() * 8;
      }
    }
  },
  poster(g, S, r, c) {
    g.fillStyle = css(c, 0.9); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(120,90,60,${0.05 + r() * 0.08})`; g.fillRect(r() * S, r() * S, 2, 2); }
    const paper = [0xffffff, 0xfff3c0, 0xd8ecff, 0xffe0e6];
    for (let i = 0; i < 6; i++) {
      const w = 22 + r() * 14, h = 28 + r() * 12;
      const x = r() * (S - 38) + w / 2 + 1, y = r() * (S - 44) + h / 2 + 1;
      g.save();
      g.translate(x, y); g.rotate((r() - 0.5) * 0.18);
      g.fillStyle = css(paper[(r() * paper.length) | 0]);
      g.fillRect(-w / 2, -h / 2, w, h);
      g.fillStyle = 'rgba(60,60,70,.55)';
      for (let l = 0; l < 4; l++) g.fillRect(-w / 2 + 3, -h / 2 + 5 + l * 5, w - 6 - r() * 8, 1.6);
      g.fillStyle = '#d04040'; g.beginPath(); g.arc(0, -h / 2 + 2, 2, 0, 6.3); g.fill();
      g.restore();
    }
  },
  tatami(g, S, r, c) {
    g.fillStyle = css(c); g.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += 2) {
      g.fillStyle = `rgba(255,255,240,${x % 4 ? 0.06 : 0.12})`;
      g.fillRect(x, 0, 1, S);
    }
    g.fillStyle = 'rgba(35,45,35,.8)';
    g.fillRect(0, 0, S, 5); g.fillRect(0, 62, S, 5);
  },
  glass(g, S, r, c) {
    const grad = g.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0, css(c, 1.15)); grad.addColorStop(0.5, css(c, 0.85)); grad.addColorStop(1, css(c, 1.05));
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      g.beginPath(); g.moveTo(20 + i * 34, 0); g.lineTo(-10 + i * 34, S); g.stroke();
    }
    g.fillStyle = 'rgba(245,248,250,.95)';
    for (let k = 0; k <= 2; k++) { g.fillRect(k * 63, 0, 3, S); g.fillRect(0, k * 63, S, 3); }
  },
  arcade(g, S, r, c) {
    g.fillStyle = css(c, 0.55); g.fillRect(0, 0, S, S);
    g.fillStyle = css(c, 1.25); g.fillRect(0, 0, S, 14);
    g.fillStyle = '#101828'; g.fillRect(16, 20, S - 32, 54);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = css(PACKS[(r() * PACKS.length) | 0]);
      g.fillRect(20 + r() * (S - 44), 24 + r() * 46, 4, 4);
    }
    g.fillStyle = css(c, 0.9); g.fillRect(10, 84, S - 20, 24);
    const btn = [0xe04040, 0xf0d040, 0x40a0e0, 0x50c060];
    for (let i = 0; i < 4; i++) {
      g.fillStyle = css(btn[i]);
      g.beginPath(); g.arc(30 + i * 22, 96, 6, 0, 6.3); g.fill();
    }
  }
};

function texFor(m, c) {
  if (m === 'sign') return null;
  const art = ART_DRAW[m];
  const key = art ? m + '|' + c : (TEX_DRAW[m] ? m : 'stone');
  if (texCache.has(key)) return texCache.get(key);
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  let seed = (c || 0) >>> 0;
  for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  (art || TEX_DRAW[key])(cv.getContext('2d'), S, rng(seed), c);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const entry = { tex, full: !!art };
  texCache.set(key, entry);
  return entry;
}

const UV_K = 0.5;
function scaleBoxUV(geo, b) {
  const uv = geo.attributes.uv;
  const art = !!ART_DRAW[b.m];
  const ou = art ? 0 : (b.x * 0.37 + b.y * 0.11) % 1, ov = art ? 0 : (b.z * 0.37 + b.y * 0.13) % 1;
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
    const entry = texFor(m, parseInt(c));
    if (entry) {
      params.map = entry.tex;
      if (entry.full) params.color = 0xffffff;
      if (glow === '1') {
        params.emissiveMap = entry.tex;
        if (entry.full) { params.emissive = 0xffffff; params.emissiveIntensity = 0.4; }
      }
    }
    const mat = new THREE.MeshStandardMaterial(params);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = quality.shadows;
    mesh.castShadow = quality.shadows;
    group.add(mesh);
  }
  scene.add(group);

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
  const maxLights = quality.high ? 8 : 4;
  for (const l of (map.lights || []).slice(0, maxLights)) {
    const pl = new THREE.PointLight(l.c, l.i, l.d, 1.8);
    pl.position.set(l.x, l.y, l.z);
    scene.add(pl);
  }
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
