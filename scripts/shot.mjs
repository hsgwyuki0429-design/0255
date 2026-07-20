// Screenshot harness: loads /preview.html at given camera setups and saves PNGs.
// Usage: node scripts/shot.mjs <outdir> <shotsJsonFile>
import { chromium } from 'playwright-core';
import fs from 'fs';

const OUT = process.argv[2] || '/tmp/shots';
const SHOTS = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const BASE = process.env.BASE || 'http://localhost:3000';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: fs.existsSync(EXE) ? EXE : undefined,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
page.on('console', m => { if (m.type() === 'error') console.log('  [pageerr]', m.text()); });
page.on('pageerror', e => console.log('  [pageerror]', e.message));

for (const s of SHOTS) {
  const url = `${BASE}/preview.html?` + new URLSearchParams(s.params).toString();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(400);
  const file = `${OUT}/${s.name}.png`;
  await page.screenshot({ path: file });
  console.log('saved', file);
}
await browser.close();
