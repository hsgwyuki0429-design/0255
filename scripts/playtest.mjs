// Headless CPU-match smoke test: boots the game, starts a CPU match on the given
// map, plays a few seconds driving movement, and reports any JS errors.
import { chromium } from 'playwright-core';
import fs from 'fs';

const MAP = process.argv[2] || 'cave';
const BASE = process.env.BASE || 'http://localhost:3000';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({
  executablePath: fs.existsSync(EXE) ? EXE : undefined,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(1200);                 // connect / hello

// Open CPU modal, pick map, start.
await page.click('#btn-cpu');
await page.waitForTimeout(300);
await page.click(`#cpu-map button[data-v="${MAP}"]`);
await page.waitForTimeout(150);
await page.click('#cpu-ok');

// Wait for the game screen + game object.
await page.waitForFunction(() => window.__game && window.__game(), { timeout: 20000 });
console.log('game started on', MAP);

// Drive movement so collision/nav/humanoid update code runs.
const keys = ['KeyW', 'KeyA', 'KeyD', 'Space', 'KeyW'];
for (let i = 0; i < 12; i++) {
  const k = keys[i % keys.length];
  await page.keyboard.down(k);
  await page.waitForTimeout(650);
  await page.keyboard.up(k);
}

// Sample the player position to confirm the sim advanced.
const info = await page.evaluate(() => {
  const g = window.__game();
  return g ? { pos: [g.pos.x.toFixed(1), g.pos.y.toFixed(1), g.pos.z.toFixed(1)], role: g.role, remotes: g.remotes.size } : null;
});
console.log('after play:', JSON.stringify(info));
console.log('JS errors:', errors.length);
for (const e of errors.slice(0, 20)) console.log('  -', e);
await browser.close();
process.exit(errors.length ? 1 : 0);
