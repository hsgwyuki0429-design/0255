// ============================================================
// ONI RUSH - クライアント本体
// 画面遷移 / 3Dゲームループ / カメラ / ネット同期 / HUD
// ============================================================
import * as THREE from 'three';
import { Net } from './net.js';
import { Input } from './input.js';
import { Humanoid } from './humanoid.js';
import { buildWorld, clampCamera } from './world.js';
import { moveCapsule } from '/shared/collision.js';
import { Minimap } from './minimap.js';
import { VFX } from './vfx.js';
import { initAudio, SFX } from './sfx.js';

// ---------------- 基本状態 ----------------
const $ = id => document.getElementById(id);
const net = new Net();
const input = new Input();
input.attach();

let me = { id: null, name: '', rating: 1000, cpuRating: 1000 };
let currentRoom = null;
let game = null;   // ゲーム中の全状態

const deviceId = localStorage.getItem('oni-device') || (crypto.randomUUID ? crypto.randomUUID() : 'd' + Math.random().toString(36).slice(2));
localStorage.setItem('oni-device', deviceId);

const TIERS = [[1400, '🌋 マグマ'], [1250, '💎 ダイヤ'], [1100, '🥇 ゴールド'], [1000, '🥈 シルバー'], [0, '🥉 ブロンズ']];
function tierOf(r) { return TIERS.find(([m]) => r >= m)[1]; }
// CPU戦: レート帯 → CPUの賢さ (サーバー側 bots.js と対応)
const CPU_LEVELS = [[1400, '👺 鬼神'], [1250, '🧠 鬼軍師'], [1100, '📚 かしこい鬼'], [1000, '🎯 しっかり鬼'], [900, '👹 ふつうの鬼'], [0, '🐣 みならい鬼']];
function cpuLevelNameOf(r) { return CPU_LEVELS.find(([m]) => r >= m)[1]; }
function updateCpuBadge() {
  $('my-cpu-rating').textContent = me.cpuRating;
  $('my-cpu-tier').textContent = cpuLevelNameOf(me.cpuRating);
}

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------------- 接続 & ホーム ----------------
async function connect() {
  const name = ($('inp-name').value || localStorage.getItem('oni-name') || 'プレイヤー' + (Math.random() * 1000 | 0)).trim();
  $('inp-name').value = name;
  localStorage.setItem('oni-name', name);
  const res = await net.hello(name, deviceId);
  if (res?.ok) {
    me = { id: res.id, name: res.name, rating: res.rating, cpuRating: res.cpuRating ?? 1000 };
    $('my-rating').textContent = res.rating;
    $('my-tier').textContent = tierOf(res.rating);
    updateCpuBadge();
  }
}

async function refreshRooms() {
  const rooms = await net.listRooms();
  renderRooms(rooms);
  const rank = await net.ranking();
  $('ranking').innerHTML = (rank || []).map((p, i) =>
    `<li><span>${i + 1}. ${esc(p.name)}</span><b>${p.rating}</b></li>`).join('') || '<div class="empty">まだ記録なし</div>';
}
function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

function renderRooms(rooms) {
  const el = $('room-list');
  if (!rooms || !rooms.length) { el.innerHTML = '<div class="empty">部屋がありません。作ってみよう!</div>'; return; }
  el.innerHTML = '';
  for (const r of rooms) {
    const d = document.createElement('div');
    d.className = 'room-item';
    d.innerHTML = `<div style="flex:1;min-width:0"><div class="rname">${esc(r.name)}</div>
      <div class="rmeta">${r.modeName} / ${r.mapName} / 鬼${r.oniCount}人 / ${Math.round(r.timeLimit / 60)}分</div></div>
      <div class="rcount">${r.count}/${r.max}</div>`;
    d.onclick = async () => {
      initAudio();
      const res = await net.joinRoom({ roomId: r.id });
      if (res.ok) enterLobby(res.room);
      else toast(res.error);
    };
    el.appendChild(d);
  }
}

net.on('roomsChanged', rooms => { if ($('screen-home').classList.contains('active')) renderRooms(rooms); });
net.on('connect', async () => { await connect(); refreshRooms(); });
net.on('disconnect', () => { if (game) toast('サーバーとの接続が切れました'); });

$('btn-refresh').onclick = refreshRooms;
$('inp-name').addEventListener('change', connect);

// ---------------- 部屋作成 ----------------
const cState = { mode: 'doro', mapId: 'school' };
function segInit(id, cb) {
  $(id).querySelectorAll('button').forEach(b => b.onclick = () => {
    $(id).querySelectorAll('button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    cb(b.dataset.v);
  });
}
segInit('c-mode', v => cState.mode = v);
segInit('c-map', v => cState.mapId = v);
$('c-private').onchange = e => $('c-password').classList.toggle('hidden', !e.target.checked);
$('btn-create').onclick = () => { initAudio(); $('modal-create').classList.remove('hidden'); };
$('c-cancel').onclick = () => $('modal-create').classList.add('hidden');
$('c-ok').onclick = async () => {
  const isPublic = !$('c-private').checked;
  if (!isPublic && !$('c-password').value.trim()) return toast('合言葉を入れてください');
  const res = await net.createRoom({
    name: $('c-name').value, mode: cState.mode, mapId: cState.mapId,
    oniCount: +$('c-oni').value, timeLimit: +$('c-time').value,
    isPublic, password: $('c-password').value.trim()
  });
  if (res.ok) { $('modal-create').classList.add('hidden'); enterLobby(res.room); }
  else toast(res.error);
};
// ---------------- CPU戦 ----------------
const cpuState = { mode: 'doro', mapId: 'school', myRole: 'random' };
segInit('cpu-mode', v => cpuState.mode = v);
segInit('cpu-map', v => cpuState.mapId = v);
segInit('cpu-role', v => cpuState.myRole = v);
$('btn-cpu').onclick = () => {
  initAudio();
  $('cpu-strength').innerHTML = `CPUの強さ: <b>${cpuLevelNameOf(me.cpuRating)}</b> (CPUレート ${me.cpuRating})<br><small>勝つとCPUレートが上がり、CPUの思考が賢くなる</small>`;
  $('modal-cpu').classList.remove('hidden');
};
$('cpu-cancel').onclick = () => $('modal-cpu').classList.add('hidden');
$('cpu-ok').onclick = async () => {
  const cpuCount = +$('cpu-count').value;
  const res = await net.startCpu({
    mode: cpuState.mode, mapId: cpuState.mapId, myRole: cpuState.myRole,
    cpuCount, timeLimit: +$('cpu-time').value,
    oniCount: Math.max(1, Math.round((cpuCount + 1) / 3))
  });
  if (res.ok) { $('modal-cpu').classList.add('hidden'); currentRoom = null; }
  else toast(res.error || '開始できませんでした');
};

$('btn-join-private').onclick = async () => {
  initAudio();
  const pw = $('inp-password-join').value.trim();
  if (!pw) return toast('合言葉を入れてください');
  const res = await net.joinRoom({ password: pw });
  if (res.ok) enterLobby(res.room);
  else toast(res.error);
};

// ---------------- ロビー ----------------
function enterLobby(room) {
  currentRoom = room;
  show('screen-lobby');
  renderLobby(room);
}
function renderLobby(room) {
  currentRoom = room;
  const isHost = room.hostId === me.id;
  $('lobby-title').textContent = room.name;
  $('lobby-info').innerHTML =
    `<span class="tag">${room.modeName}</span><span class="tag">${room.mapName}</span>` +
    `<span class="tag">👹 鬼 ${room.oniCount}人</span><span class="tag">⏱ ${Math.round(room.timeLimit / 60)}分</span>` +
    `<span class="tag">${room.isPublic ? '公開' : '🔒 合言葉'}</span>`;
  $('lobby-players').innerHTML = room.players.map(p =>
    `<div class="lp"><span>${esc(p.name)}${p.isHost ? '<span class="host">👑 ホスト</span>' : ''}</span><span class="rt">${p.rating}</span></div>`).join('');
  $('lobby-opts').classList.toggle('hidden', !isHost);
  $('btn-start').classList.toggle('hidden', !isHost);
  $('wait-host').classList.toggle('hidden', isHost);
  if (isHost) {
    ['l-mode', 'l-map'].forEach(id => $(id).querySelectorAll('button').forEach(b => {
      b.classList.toggle('on', b.dataset.v === (id === 'l-mode' ? room.mode : room.mapId));
    }));
    $('l-oni').value = room.oniCount;
    $('l-time').value = room.timeLimit;
  }
}
segInit('l-mode', v => net.setOpts({ mode: v }));
segInit('l-map', v => net.setOpts({ mapId: v }));
$('l-oni').onchange = e => net.setOpts({ oniCount: +e.target.value });
$('l-time').onchange = e => net.setOpts({ timeLimit: +e.target.value });
$('btn-leave').onclick = () => { net.leaveRoom(); currentRoom = null; show('screen-home'); refreshRooms(); };
$('btn-start').onclick = () => { initAudio(); net.startGame(); };

net.on('roomUpdate', room => {
  if (room.isCpu) return; // CPU戦はロビーを使わない
  if ($('screen-lobby').classList.contains('active') || $('screen-result').classList.contains('active')) renderLobby(room);
  else currentRoom = room;
});
net.on('countdown', ({ n }) => {
  const el = $('countdown-overlay');
  el.classList.remove('hidden');
  el.textContent = n;
  SFX.countdown();
});

// ---------------- 3D ゲーム ----------------
const MOVE_SPEED_RUN = 5.3;   // 逃げ
const MOVE_SPEED_ONI = 5.75;  // 鬼は少し速い
const JUMP_V = 5.6;
const GRAVITY = -14.5;

let renderer = null, scene = null, camera = null, vfx = null, minimap = null;

function initRenderer() {
  if (renderer) return;
  const canvas = $('game-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !input.isTouch, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, input.isTouch ? 2 : 2));
  renderer.shadowMap.enabled = !input.isTouch;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  camera = new THREE.PerspectiveCamera(140, innerWidth / innerHeight, 0.1, 320); // 視野を従来(70)の2倍に
  window.addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });
  renderer.setSize(innerWidth, innerHeight);
  minimap = new Minimap($('minimap'));
}

net.on('gameStart', data => {
  $('countdown-overlay').classList.add('hidden');
  initRenderer();
  startGame(data);
});

function startGame(data) {
  scene = new THREE.Scene();
  const quality = { shadows: !input.isTouch, high: !input.isTouch };
  const { map, solids } = buildWorld(scene, data.mapId, quality);
  vfx = new VFX(scene);
  minimap.setMap(data.mapId);

  const remotes = new Map();
  let ci = 0;
  for (const p of data.players) {
    const h = new Humanoid(ci++, p.name);
    h.setRole(p.role);
    h.root.position.set(...p.pos);
    scene.add(h.root);
    remotes.set(p.id, {
      id: p.id, name: p.name, role: p.role, hum: h,
      jailed: false, frozen: false,
      // 補間バッファ
      buf: [], cur: new THREE.Vector3(...p.pos), ry: 0, speed: 0, onG: true, lastY: p.pos[1]
    });
  }
  const meR = remotes.get(data.you.id);

  game = {
    mode: data.mode, map, solids, remotes, meId: data.you.id,
    role: data.you.role, jailed: false, frozen: false,
    pos: new THREE.Vector3(...data.you.pos),
    vel: new THREE.Vector3(),
    yaw: Math.atan2(-data.you.pos[0], -data.you.pos[2]), // 中央を向いてスタート
    camYaw: 0, camPitch: 0.32,
    // サーバーとの時計ずれを避けるため、経過時間ベースでローカル時刻に換算
    onGround: true,
    endsAt: Date.now() + data.timeLimit * 1000,
    graceUntil: Date.now() + Math.max(0, data.graceUntil - (data.endsAt - data.timeLimit * 1000)),
    lastSend: 0, lastTouch: 0, stepAcc: 0, stepAlt: false,
    over: false,
    stamina: 100, stamLock: false,      // ダッシュ用スタミナ
    camEyeY: data.you.pos[1]            // カメラ高さは階段でガタつかないよう平滑化
  };
  game.camYaw = game.yaw - Math.PI;
  meR.hum.root.position.copy(game.pos);
  if (meR.hum.tag) meR.hum.tag.visible = false; // 自分の名札は非表示
  applyViewMode();

  updateRoleHUD();
  updateCountHUD();
  $('hud-msg').innerHTML = '';
  $('status-overlay').classList.add('hidden');
  $('touch-hint').classList.add('hidden');
  show('screen-game');
  input.enabled = true;
  SFX.go();
  if (!animating) { animating = true; requestAnimationFrame(loop); }
}

function updateRoleHUD() {
  if (!game) return;
  const el = $('hud-role');
  if (game.role === 'oni') { el.textContent = '👹 鬼'; el.className = 'hud-role'; }
  else { el.textContent = '🏃 逃げ'; el.className = 'hud-role run'; }
  $('jump-hint').textContent = input.isTouch ? '右側タップでジャンプ' : 'Space=ジャンプ / Shift=ダッシュ';
  $('btn-dash').style.display = input.isTouch ? '' : 'none';
}

// ---------------- 視点切替 (一人称/三人称) ----------------
let viewMode = localStorage.getItem('oni-view') || 'tp'; // 'tp'=三人称 / 'fp'=一人称
function applyViewMode() {
  $('btn-view').textContent = viewMode === 'fp' ? '👁 一人称' : '🎥 三人称';
  if (game) {
    const meR = game.remotes.get(game.meId);
    if (meR) meR.hum.root.visible = viewMode !== 'fp'; // 一人称では自分の体を消す
  }
}
$('btn-view').addEventListener('click', e => { e.stopPropagation(); toggleView(); });
$('btn-view').addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); toggleView(); }, { passive: false });
function toggleView() {
  viewMode = viewMode === 'fp' ? 'tp' : 'fp';
  localStorage.setItem('oni-view', viewMode);
  applyViewMode();
}
applyViewMode();
function updateCountHUD() {
  if (!game) return;
  const rs = [...game.remotes.values()].filter(r => r.role === 'run');
  const free = rs.filter(r => !r.jailed && !r.frozen).length;
  const label = game.mode === 'koori' ? '🧊' : game.mode === 'doro' ? '🚔' : '🔄';
  $('hud-count').textContent = `${label} 逃げ残り ${free}/${rs.length}`;
}

function hudMsg(text, color = '#fff') {
  const el = document.createElement('div');
  el.className = 'msg-line';
  el.style.color = color;
  el.textContent = text;
  $('hud-msg').appendChild(el);
  while ($('hud-msg').children.length > 4) $('hud-msg').firstChild.remove();
  setTimeout(() => el.remove(), 3500);
}

// ---------------- スナップショット受信 (補間用にバッファ) ----------------
net.on('snap', ({ ps }) => {
  if (!game) return;
  const t = Date.now(); // 受信時刻基準 (サーバーとの時計ずれの影響を受けない)
  for (const [id, arr] of Object.entries(ps)) {
    const r = game.remotes.get(id);
    if (!r || id === game.meId) continue;
    r.buf.push({ t, x: arr[0], y: arr[1], z: arr[2], ry: arr[3], s: arr[4] });
    if (r.buf.length > 20) r.buf.shift();
  }
});

net.on('timeSync', ({ remain }) => {
  if (!game) return;
  game.endsAt = Date.now() + remain;
});

// ---------------- ゲームイベント ----------------
net.on('ev', ev => {
  if (!game && ev.type !== 'joined' && ev.type !== 'left' && ev.type !== 'chat') return;
  const r = ev.id ? game?.remotes.get(ev.id) : null;
  // ペイント弾が当たった相手の体にインクの痕を付ける
  const paintOn = (target, shooterId) => {
    if (!target) return;
    const sh = shooterId ? game.remotes.get(shooterId) : null;
    const ink = sh ? sh.hum.color : 0xff4444;
    target.hum.addPaint(ink);
    vfx.paintBurst(target.hum.root.position.clone().add(new THREE.Vector3(0, 1.1, 0)), ink);
    SFX.hit();
  };
  switch (ev.type) {
    case 'jailed': {
      SFX.jailed();
      paintOn(r, ev.by);
      if (r) {
        r.jailed = true;
        vfx.burst(r.hum.root.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff4444);
        vfx.ring(new THREE.Vector3(...ev.pos), 0xff8844);
        r.cur.set(...ev.pos); r.buf.length = 0;
        r.hum.root.position.set(...ev.pos);
      }
      if (ev.id === game.meId) {
        game.jailed = true;
        game.pos.set(...ev.pos);
        game.vel.set(0, 0, 0);
        showStatus('🚔 つかまった!', '味方がタッチすると復活できる');
      }
      hudMsg(`🚔 ${ev.byName} が ${ev.name} をつかまえた!`, '#ff8888');
      updateCountHUD();
      break;
    }
    case 'rescued': {
      SFX.rescued();
      if (r) { r.jailed = false; vfx.sparkle(r.hum.root.position.clone().add(new THREE.Vector3(0, 1, 0))); }
      if (ev.id === game.meId) { game.jailed = false; hideStatus(); }
      hudMsg(`🤝 ${ev.byName} が ${ev.name} を助けた!`, '#88ffbb');
      updateCountHUD();
      break;
    }
    case 'frozen': {
      SFX.frozen();
      paintOn(r, ev.by);
      if (r) { r.frozen = true; r.hum.setFrozen(true); vfx.sparkle(r.hum.root.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x88ccff); }
      if (ev.id === game.meId) {
        game.frozen = true; game.vel.set(0, 0, 0);
        showStatus('🧊 こおった!', '味方がタッチすると溶けるよ');
      }
      hudMsg(`🧊 ${ev.byName} が ${ev.name} をこおらせた!`, '#88ccff');
      updateCountHUD();
      break;
    }
    case 'unfrozen': {
      SFX.unfrozen();
      if (r) { r.frozen = false; r.hum.setFrozen(false); vfx.sparkle(r.hum.root.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xaaeeff); }
      if (ev.id === game.meId) { game.frozen = false; hideStatus(); }
      hudMsg(`🔥 ${ev.byName} が ${ev.name} をとかした!`, '#ffcc88');
      updateCountHUD();
      break;
    }
    case 'swapped': {
      SFX.swapped();
      if (ev.newRun) paintOn(game.remotes.get(ev.newOni), ev.newRun); // タッチした側のインクが付く
      const no = game.remotes.get(ev.newOni), nr = ev.newRun ? game.remotes.get(ev.newRun) : null;
      if (no) { no.role = 'oni'; no.hum.setRole('oni'); vfx.burst(no.hum.root.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff4444); }
      if (nr) { nr.role = 'run'; nr.hum.setRole('run'); }
      if (ev.newOni === game.meId) { game.role = 'oni'; updateRoleHUD(); showStatusFlash('👹 きみが鬼だ!'); }
      if (ev.newRun === game.meId) { game.role = 'run'; updateRoleHUD(); showStatusFlash('🏃 にげろ!'); }
      hudMsg(`🔄 ${ev.newOniName} が鬼になった!`, '#ffaa66');
      updateCountHUD();
      break;
    }
    case 'joined': SFX.join(); break;
    case 'left': if (game) { const rr = game.remotes.get(ev.id); if (rr) { scene.remove(rr.hum.root); rr.hum.dispose(); game.remotes.delete(ev.id); hudMsg(`👋 ${ev.name} が退出`, '#aaa'); updateCountHUD(); } } break;
  }
});

function showStatus(title, sub) {
  $('status-overlay').innerHTML = `${title}<small>${sub}</small>`;
  $('status-overlay').classList.remove('hidden');
}
function hideStatus() { $('status-overlay').classList.add('hidden'); }
function showStatusFlash(text) {
  showStatus(text, '');
  setTimeout(hideStatus, 1600);
}

// ---------------- 結果 ----------------
net.on('gameEnd', ({ winner, mode, isCpu, results }) => {
  if (!game) return;
  input.enabled = false;
  const meRes = results.find(r => r.id === game.meId);
  const iWon = meRes?.win;
  (iWon ? SFX.win : SFX.lose)();
  game.over = true;

  $('result-title').textContent = iWon ? '🎉 勝利!' : '😭 敗北…';
  const wname = winner === 'oni' ? '👹 鬼チームの勝ち!' : '🏃 逃げチームの勝ち!';
  $('result-winner').innerHTML = esc(mode === 'kawari' ? '⏱ タイムアップ!' : wname) + (isCpu ? ' <span class="nowrap">〔CPU戦〕</span>' : '');
  $('result-list').innerHTML = results.map(r => {
    const stats = mode === 'kawari'
      ? `タッチ${r.tags} / 鬼時間${r.oniTime}秒`
      : r.role === 'oni' ? `つかまえた ${r.tags}人` : `救出${r.rescues} / つかまり${r.caught}`;
    return `<div class="res ${r.id === game.meId ? 'me' : ''}">
      <span class="role ${r.role === 'run' ? 'run' : ''}">${r.role === 'oni' ? '鬼' : '逃げ'}</span>
      <span>${esc(r.name)}<div class="stats">${stats}</div></span>
      <span class="delta ${r.delta >= 0 ? 'up' : 'down'}">${r.delta >= 0 ? '+' : ''}${r.delta}</span>
      <span class="newrate">${r.rating}</span></div>`;
  }).join('');
  if (meRes) {
    if (isCpu) {
      me.cpuRating = meRes.rating; // CPU戦は専用レートのみ変動
      updateCpuBadge();
    } else {
      me.rating = meRes.rating;
      $('my-rating').textContent = me.rating;
      $('my-tier').textContent = tierOf(me.rating);
    }
  }
  if (isCpu) currentRoom = null; // CPU部屋はサーバー側で解散される
  setTimeout(() => {
    cleanupGame();
    show('screen-result');
  }, 1800);
});
$('btn-back-lobby').onclick = () => {
  if (currentRoom) { show('screen-lobby'); renderLobby(currentRoom); }
  else { show('screen-home'); refreshRooms(); }
};

function cleanupGame() {
  if (!game) return;
  input.enabled = false;
  for (const r of game.remotes.values()) { r.hum.dispose(); }
  scene?.traverse(o => { o.geometry?.dispose?.(); });
  scene = null;
  game = null;
}

// ---------------- メインループ ----------------
let animating = false;
let lastT = performance.now();
const tmpV = new THREE.Vector3();

function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;
  if (!game || !scene) return;

  const g = game;
  const meR = g.remotes.get(g.meId);
  const now = Date.now();
  const inGrace = now < g.graceUntil;

  // ---- カメラ回転 (スワイプ/ドラッグ) ----
  const look = input.consumeLook();
  g.camYaw -= look.dx * 0.0042; // 右ドラッグ=右を向く (three.jsは+z向き時+xが左)
  const fp = viewMode === 'fp';
  g.camPitch = fp
    ? THREE.MathUtils.clamp(g.camPitch + look.dy * 0.0035, -1.25, 1.25)
    : THREE.MathUtils.clamp(g.camPitch + look.dy * 0.0035, -0.5, 1.1);

  // ---- ダッシュ & スタミナ ----
  const mv = input.getMove();
  const moving = !!(mv.x || mv.y);
  const wantSprint = input.getSprint() && moving;
  if (g.stamLock && g.stamina > 30) g.stamLock = false;
  const sprinting = wantSprint && !g.stamLock && g.stamina > 0;
  if (sprinting) {
    g.stamina = Math.max(0, g.stamina - dt * 26);
    if (g.stamina <= 0) g.stamLock = true;
  } else {
    g.stamina = Math.min(100, g.stamina + dt * (moving ? 11 : 22));
  }
  const stBar = $('stamina-bar');
  stBar.style.width = g.stamina + '%';
  stBar.classList.toggle('low', g.stamina < 30);

  // ---- 移動 (現実の人間のように慣性がある: 切り返し時は踏ん張る分だけ反応が鈍い) ----
  const locked = g.jailed || g.frozen || g.over || (inGrace && g.role === 'oni');
  if (!locked && moving) {
    let maxSp = g.role === 'oni' ? MOVE_SPEED_ONI : MOVE_SPEED_RUN;
    if (sprinting) maxSp *= 1.33;
    // カメラ基準の移動方向
    const ang = Math.atan2(mv.x, -mv.y); // 上=前
    const wish = g.camYaw + Math.PI - ang; // (+z向き時+xは左なので右入力=角度マイナス)
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    const tvx = Math.sin(wish) * maxSp * mag;
    const tvz = Math.cos(wish) * maxSp * mag;
    // 現在速度と希望方向のずれで機動力を変える: 逆へ切り返すほど加速が効きにくい
    const curSp = Math.hypot(g.vel.x, g.vel.z);
    let align = 1;
    if (curSp > 0.8) {
      align = (g.vel.x * tvx + g.vel.z * tvz) / (curSp * Math.hypot(tvx, tvz));
    }
    const agility = g.onGround ? (6.5 + 6.5 * Math.max(0, align)) : 3.0;
    const k = Math.min(1, dt * agility);
    g.vel.x += (tvx - g.vel.x) * k;
    g.vel.z += (tvz - g.vel.z) * k;
    // キャラの向きをなめらかに移動方向へ
    const targetYaw = wish;
    let dy = targetYaw - g.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    g.yaw += dy * Math.min(1, dt * 10);
  } else {
    g.vel.x *= Math.max(0, 1 - dt * (g.onGround ? 9 : 2.5)); // 減速にも慣性 (空中はほぼ滑る)
    g.vel.z *= Math.max(0, 1 - dt * (g.onGround ? 9 : 2.5));
  }

  // ---- 視点の自動追従: スワイプしていない間は進行方向へゆっくり向く ----
  if (moving && performance.now() - input.lastLookT > 900) {
    let dyaw = (g.yaw - Math.PI) - g.camYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    // 真後ろへ走るときは回さない (カメラが暴れるため)
    if (Math.abs(dyaw) < 2.55) g.camYaw += dyaw * Math.min(1, dt * 3.0);
  }

  // ジャンプ
  if (input.consumeJump() && !locked && g.onGround) {
    g.vel.y = JUMP_V;
    g.onGround = false;
    SFX.jump();
    vfx.dust(g.pos.clone());
  }
  // 重力
  g.vel.y += GRAVITY * dt;
  if (g.vel.y < -18) g.vel.y = -18;

  const wasGround = g.onGround;
  if (!g.jailed && !g.frozen) {
    const res = moveCapsule(g.pos, g.vel, dt, g.solids);
    g.onGround = res.onGround;
    if (g.onGround && g.vel.y < 0) g.vel.y = 0;
    if (g.onGround && !wasGround) { SFX.land(); vfx.dust(g.pos.clone()); }
    if (res.bounced) { SFX.jump(); vfx.sparkle(g.pos.clone(), 0x66ddff); } // トランポリン
  }

  // 足音
  const hSpeed = Math.hypot(g.vel.x, g.vel.z);
  if (g.onGround && hSpeed > 1) {
    g.stepAcc += hSpeed * dt;
    if (g.stepAcc > 2.1) { g.stepAcc = 0; g.stepAlt = !g.stepAlt; SFX.step(g.stepAlt); }
  }

  // ---- 救出 / 氷とかし (逃げが拘束された味方に近づいてタップ or 自動) ----
  let touchTarget = null;
  if (g.role === 'run' && !g.jailed && !g.frozen && !g.over) {
    for (const r of g.remotes.values()) {
      if (r.id === g.meId || r.role !== 'run') continue;
      if (!(r.jailed || r.frozen)) continue;
      if (g.pos.distanceTo(r.hum.root.position) < 1.5) { touchTarget = r; break; }
    }
  }
  $('touch-hint').classList.toggle('hidden', !touchTarget);
  if (touchTarget && now - g.lastTouch > 700) {
    g.lastTouch = now;
    net.touchPlayer(touchTarget.id);
    SFX.touch();
  }

  // ---- 自機の見た目更新 ----
  meR.hum.root.position.copy(g.pos);
  meR.hum.root.rotation.y = g.yaw;
  meR.hum.setFrozen(g.frozen);
  meR.hum.update({ dt, speed: hSpeed, velY: g.vel.y, onGround: g.onGround, frozen: g.frozen, jailed: g.jailed });

  // ---- リモートプレイヤー補間 (100ms遅延再生) ----
  const renderT = now - 130;
  for (const r of g.remotes.values()) {
    if (r.id === g.meId) continue;
    const buf = r.buf;
    let a = null, b = null;
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].t <= renderT) { a = buf[i]; b = buf[i + 1] || null; break; }
    }
    let tx, ty, tz, tr;
    if (a && b) {
      const k = Math.min(1, (renderT - a.t) / Math.max(1, b.t - a.t));
      tx = a.x + (b.x - a.x) * k; ty = a.y + (b.y - a.y) * k; tz = a.z + (b.z - a.z) * k;
      let dr = b.ry - a.ry;
      while (dr > Math.PI) dr -= Math.PI * 2;
      while (dr < -Math.PI) dr += Math.PI * 2;
      tr = a.ry + dr * k;
    } else if (buf.length) {
      const l = buf[buf.length - 1];
      tx = l.x; ty = l.y; tz = l.z; tr = l.ry;
    } else { tx = r.cur.x; ty = r.cur.y; tz = r.cur.z; tr = r.ry; }
    const prev = r.cur.clone();
    r.cur.set(tx, ty, tz);
    r.ry = tr ?? r.ry;
    const sp = prev.distanceTo(r.cur) / Math.max(dt, 0.001);
    r.speed += (Math.min(sp, 8) - r.speed) * Math.min(1, dt * 8);
    const risingOrFall = Math.abs(ty - r.lastY) > 0.06;
    r.onG = !risingOrFall;
    r.lastY = ty;
    r.hum.root.position.copy(r.cur);
    r.hum.root.rotation.y = r.ry;
    r.hum.update({ dt, speed: r.speed, velY: (ty - prev.y) / Math.max(dt, 0.001), onGround: r.onG, frozen: r.frozen, jailed: r.jailed });
  }

  // ---- カメラ ----
  // 階段のステップアップで pos.y が小刻みに跳ねるため、目線の高さだけ平滑化して振動を消す
  const eyeFollow = g.onGround ? 9 : 25; // 空中(ジャンプ/落下)は素早く追従
  g.camEyeY += (g.pos.y - g.camEyeY) * Math.min(1, dt * eyeFollow);
  if (Math.abs(g.pos.y - g.camEyeY) > 2.5) g.camEyeY = g.pos.y; // 大きく離れたら追い付く
  if (fp) {
    // ---- 一人称: 目の位置にカメラを置き、視線方向をそのまま見る ----
    const eye = tmpV.set(g.pos.x, g.camEyeY + 0.78, g.pos.z).clone();
    const fyaw = g.camYaw + Math.PI; // カメラは自分の背後基準なので前方へ反転
    const look = new THREE.Vector3(
      eye.x + Math.sin(fyaw) * Math.cos(g.camPitch),
      eye.y - Math.sin(g.camPitch),
      eye.z + Math.cos(fyaw) * Math.cos(g.camPitch)
    );
    camera.position.copy(eye);
    camera.lookAt(look);
  } else {
    // ---- 三人称: 背後から見下ろす (壁めり込み防止つき) ----
    const eye = tmpV.set(g.pos.x, g.camEyeY + 0.95, g.pos.z).clone();
    const dist = 2.8;
    const cx = eye.x - Math.sin(g.camYaw + Math.PI) * Math.cos(g.camPitch) * dist;
    const cz = eye.z - Math.cos(g.camYaw + Math.PI) * Math.cos(g.camPitch) * dist;
    const cy = eye.y + Math.sin(g.camPitch) * dist;
    let camPos = new THREE.Vector3(cx, cy, cz);
    camPos = clampCamera(eye, camPos, g.solids);
    camera.position.lerp(camPos, Math.min(1, dt * 14));
    camera.lookAt(eye);
  }

  // ---- HUD ----
  const remain = Math.max(0, g.endsAt - now);
  const mm = Math.floor(remain / 60000), ss = Math.floor(remain / 1000) % 60;
  const timerEl = $('hud-timer');
  timerEl.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
  timerEl.classList.toggle('urgent', remain < 15000 && remain > 0);
  if (remain < 10500 && remain > 0) {
    const sec = Math.ceil(remain / 1000);
    if (g._lastTickSec !== sec) { g._lastTickSec = sec; SFX.tick(); }
  }
  if (inGrace) {
    $('grace-overlay').classList.remove('hidden');
    $('grace-n').textContent = Math.ceil((g.graceUntil - now) / 1000);
  } else {
    $('grace-overlay').classList.add('hidden');
  }

  // ---- ミニマップ (自分の位置だけ) ----
  minimap.draw(g.pos.x, g.pos.y, g.pos.z, g.yaw);

  // ---- VFX ----
  vfx.update(dt);

  // ---- 状態送信 (20Hz) ----
  if (t - g.lastSend > 50) {
    g.lastSend = t;
    let s = 0;
    if (hSpeed > 0.3) s |= 1;
    if (!g.onGround) s |= 2;
    net.sendState({ p: [+g.pos.x.toFixed(2), +g.pos.y.toFixed(2), +g.pos.z.toFixed(2)], ry: +g.yaw.toFixed(2), s });
  }

  renderer.render(scene, camera);
}

// デバッグ/テスト用フック
window.__game = () => game;

// ---------------- 起動 ----------------
document.body.addEventListener('touchstart', () => initAudio(), { once: true });
document.body.addEventListener('mousedown', () => initAudio(), { once: true });
show('screen-home');
