// 入力: 左半分=仮想スティック / 右下=撃つボタン / 右半分タップ=ジャンプ / 右半分ドラッグ=カメラ
// PC: WASD+Space+マウスドラッグ+クリック射撃
export class Input {
  constructor() {
    this.move = { x: 0, y: 0 };     // -1..1
    this.jumpQueued = false;
    this.shootQueued = false;
    this.lookDX = 0; this.lookDY = 0;
    this.isTouch = 'ontouchstart' in window;
    this.keys = {};
    this.stickId = null;
    this.lookId = null;
    this.stickOrigin = { x: 0, y: 0 };
    this.lookLast = { x: 0, y: 0 };
    this.lookMoved = 0;
    this.lookStart = 0;
    this.lastLookT = 0;      // 最後にスワイプ/ドラッグで視点を動かした時刻
    this.sprintTouch = false;
    this.enabled = false;
  }

  attach() {
    const stickZone = document.getElementById('stick-zone');
    const rightZone = document.getElementById('right-zone');
    const base = document.getElementById('stick-base');
    const knob = document.getElementById('stick-knob');
    const shootBtn = document.getElementById('btn-shoot');

    // ---- 左: 仮想スティック (触れた場所が原点になる動的スティック) ----
    stickZone.addEventListener('touchstart', e => {
      if (!this.enabled) return;
      e.preventDefault();
      const t = e.changedTouches[0];
      if (this.stickId !== null) return;
      this.stickId = t.identifier;
      this.stickOrigin = { x: t.clientX, y: t.clientY };
      base.classList.remove('hidden');
      base.style.left = t.clientX + 'px';
      base.style.top = t.clientY + 'px';
      knob.style.transform = 'translate(-50%,-50%)';
    }, { passive: false });
    stickZone.addEventListener('touchmove', e => {
      if (!this.enabled) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== this.stickId) continue;
        const dx = t.clientX - this.stickOrigin.x, dy = t.clientY - this.stickOrigin.y;
        const len = Math.hypot(dx, dy), max = 52;
        const k = len > max ? max / len : 1;
        this.move.x = (dx * k) / max;
        this.move.y = (dy * k) / max;
        knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
      }
    }, { passive: false });
    const stickEnd = e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.stickId) continue;
        this.stickId = null;
        this.move.x = 0; this.move.y = 0;
        base.classList.add('hidden');
      }
    };
    stickZone.addEventListener('touchend', stickEnd);
    stickZone.addEventListener('touchcancel', stickEnd);

    // ---- 右: タップ=ジャンプ / ドラッグ=カメラ ----
    rightZone.addEventListener('touchstart', e => {
      if (!this.enabled) return;
      e.preventDefault();
      const t = e.changedTouches[0];
      if (this.lookId !== null) return;
      this.lookId = t.identifier;
      this.lookLast = { x: t.clientX, y: t.clientY };
      this.lookMoved = 0;
      this.lookStart = performance.now();
    }, { passive: false });
    rightZone.addEventListener('touchmove', e => {
      if (!this.enabled) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== this.lookId) continue;
        const dx = t.clientX - this.lookLast.x, dy = t.clientY - this.lookLast.y;
        this.lookMoved += Math.abs(dx) + Math.abs(dy);
        this.lookDX += dx; this.lookDY += dy;
        if (Math.abs(dx) + Math.abs(dy) > 1) this.lastLookT = performance.now();
        this.lookLast = { x: t.clientX, y: t.clientY };
      }
    }, { passive: false });
    const lookEnd = e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.lookId) continue;
        // 小さい動きの短いタッチ = ジャンプ
        if (this.lookMoved < 14 && performance.now() - this.lookStart < 260) this.jumpQueued = true;
        this.lookId = null;
      }
    };
    rightZone.addEventListener('touchend', lookEnd);
    rightZone.addEventListener('touchcancel', lookEnd);

    // ---- 撃つボタン ----
    shootBtn.addEventListener('touchstart', e => {
      if (!this.enabled) return;
      e.preventDefault(); e.stopPropagation();
      this.shootQueued = true;
    }, { passive: false });
    shootBtn.addEventListener('mousedown', e => { if (this.enabled) { e.stopPropagation(); this.shootQueued = true; } });

    // ---- ダッシュボタン (モバイル: 押している間ダッシュ) ----
    const dashBtn = document.getElementById('btn-dash');
    if (dashBtn) {
      dashBtn.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); this.sprintTouch = true; }, { passive: false });
      const dashEnd = e => { e.preventDefault(); this.sprintTouch = false; };
      dashBtn.addEventListener('touchend', dashEnd, { passive: false });
      dashBtn.addEventListener('touchcancel', dashEnd, { passive: false });
      dashBtn.addEventListener('mousedown', e => { e.stopPropagation(); this.sprintTouch = true; });
      window.addEventListener('mouseup', () => { this.sprintTouch = false; });
    }

    // ---- PC: キーボード + マウス ----
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (e.code === 'Space' && this.enabled) { this.jumpQueued = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    // マウスはタッチゾーンのdivに遮られるため window で拾う
    let mouseDown = false, lastM = null;
    window.addEventListener('mousedown', e => {
      if (!this.enabled || this.isTouch) return;
      if (e.target.closest('button')) return;
      mouseDown = true; lastM = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mousemove', e => {
      if (!mouseDown || !this.enabled) return;
      const dx = e.clientX - lastM.x, dy = e.clientY - lastM.y;
      this.lookDX += dx;
      this.lookDY += dy;
      if (Math.abs(dx) + Math.abs(dy) > 1) this.lastLookT = performance.now();
      lastM = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mouseup', e => {
      if (mouseDown && this.enabled && lastM && Math.hypot(e.clientX - lastM.x, e.clientY - lastM.y) < 4) {
        // 短いクリック → 撃つ (鬼のとき)
        this.shootQueued = true;
      }
      mouseDown = false;
    });
  }

  // キーボードの移動を合成して返す
  getMove() {
    let x = this.move.x, y = this.move.y;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) y -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) y += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) x += 1;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  consumeLook() {
    const r = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0; this.lookDY = 0;
    return r;
  }
  consumeJump() { const j = this.jumpQueued; this.jumpQueued = false; return j; }
  getSprint() { return !!(this.sprintTouch || this.keys['ShiftLeft'] || this.keys['ShiftRight']); }
  consumeShoot() { const s = this.shootQueued; this.shootQueued = false; return s; }
}
