/* End-to-end smoke test of the main editing workflows.
 * Usage:  npm run build && npm run test:e2e
 * Requires the `playwright` package with Chromium (npx playwright install chromium).
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 4179;
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-e2e-'));
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✔' : '✘'} ${msg}`);
  if (!cond) failures++;
};

async function waitForServer(url, ms = 20000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('server did not start');
}

(async () => {
  let server;
  if (!process.env.BASE_URL) {
    server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' });
    await waitForServer(BASE);
  }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const E = (fn, arg) => page.evaluate(fn, arg);
  const idle = () => page.waitForFunction(() => !document.querySelector('[data-testid=busy]'), null, { timeout: 60000 });
  const layers = () => page.$$eval('[data-testid=layer-row]', (els) => els.map((e) => e.dataset.name));
  const toScreen = (x, y) =>
    E(([x, y]) => {
      const e = window.__editor;
      const v = e.canvas.viewportTransform;
      const r = e.canvas.upperCanvasEl.getBoundingClientRect();
      return { x: r.left + v[4] + x * v[0], y: r.top + v[5] + y * v[3] };
    }, [x, y]);
  const drag = async (x1, y1, x2, y2) => {
    const a = await toScreen(x1, y1);
    const b = await toScreen(x2, y2);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(150);
  };

  try {
    await page.goto(BASE);
    await page.waitForSelector('[data-testid=welcome]');
    // --- make a test image
    const b64 = await E(() => {
      const c = document.createElement('canvas');
      c.width = 900;
      c.height = 600;
      const x = c.getContext('2d');
      x.fillStyle = '#9ec5ff';
      x.fillRect(0, 0, 900, 600);
      x.fillStyle = '#4a8f3c';
      x.fillRect(0, 420, 900, 180);
      x.fillStyle = '#d33';
      x.beginPath();
      x.arc(450, 300, 80, 0, 7);
      x.fill();
      return c.toDataURL('image/png').split(',')[1];
    });
    const imgPath = path.join(tmp, 'photo.png');
    fs.writeFileSync(imgPath, Buffer.from(b64, 'base64'));

    // --- import
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-testid=welcome-open]')]);
    await fc.setFiles(imgPath);
    await page.waitForTimeout(700);
    const doc = await E(() => window.__editor.doc);
    ok(doc.width === 900 && doc.height === 600, 'import sets canvas size to image size');

    // --- annotations & shapes
    await page.keyboard.press('r');
    await drag(50, 50, 250, 150);
    await page.keyboard.press('a');
    await drag(60, 350, 200, 250);
    await page.keyboard.press('b');
    await drag(690, 90, 770, 170);
    await page.keyboard.press('k');
    await drag(20, 540, 200, 580);
    await page.keyboard.press('t');
    const t = await toScreen(450, 60);
    await page.mouse.click(t.x, t.y);
    await page.waitForTimeout(200);
    await page.keyboard.type('Hello');
    await page.keyboard.press('Escape');
    await page.keyboard.press('v');
    const names = await layers();
    ok(['Rect', 'Arrow', 'Blur region', 'Redaction', 'Hello'].every((n) => names.includes(n)), 'shapes, arrow, blur, redaction and text layers created');

    // --- adjustments + undo/redo
    await E(() => {
      const e = window.__editor;
      e.selectLayer(e.objects().find((o) => o.type === 'image').id);
    });
    await page.click('[data-testid=tab-adjust]');
    await page.locator('[data-testid=adj-brightness]').fill('40');
    await page.waitForTimeout(600);
    const bright = () => E(() => window.__editor.objects().find((o) => o.type === 'image').adjust?.brightness ?? 0);
    ok((await bright()) === 40, 'brightness adjustment applied');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    ok((await bright()) === 0, 'undo reverts adjustment');
    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(400);
    ok((await bright()) === 40, 'redo re-applies adjustment');

    // --- object removal via magic wand
    await page.click('[data-testid=tab-design]');
    await page.keyboard.press('w');
    const p = await toScreen(450, 300);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(300);
    const sel = await E(() => window.__editor.selectionBounds());
    ok(sel && sel.w > 100 && sel.w < 200, `magic wand selects the red circle (${JSON.stringify(sel)})`);
    await page.click('[data-testid=sel-remove]');
    await idle();
    ok((await layers()).includes('Object removal patch'), 'object removal creates a patch layer');
    const px = await E(async () => {
      const d = await window.__editor.composite();
      const at = (x, y) => { const i = (y * d.width + x) * 4; return [d.data[i], d.data[i + 1], d.data[i + 2]]; };
      return [at(450, 300), at(450, 160)];
    });
    const diff = px[0].reduce((s, v, i) => s + Math.abs(v - px[1][i]), 0);
    ok(diff < 60, `removed area is filled with surrounding colour (${JSON.stringify(px)})`);

    // --- crop
    await page.keyboard.press('v');
    await page.keyboard.press('c');
    await page.waitForTimeout(150);
    await E(() => {
      const r = window.__editor.cropRect;
      r.set({ left: 100, top: 50, width: 600, height: 400 });
      r.setCoords();
    });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const d2 = await E(() => window.__editor.doc);
    ok(d2.width === 600 && d2.height === 400, 'crop resizes canvas');

    // --- save to library, reload, reopen
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(1500);
    const count = (await layers()).length;
    await page.reload();
    await page.waitForSelector('[data-testid=project-card]');
    await page.locator('[data-testid=project-card]').first().click();
    await page.waitForTimeout(1200);
    ok((await layers()).length === count, 'project reopens from browser library with all layers');

    // --- download project file and reopen it
    const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+Shift+S')]);
    const projPath = path.join(tmp, 'p.pmproj');
    await dl.saveAs(projPath);
    await E(() => window.__editor.newDocument(300, 300));
    const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Control+Shift+O')]);
    await fc2.setFiles(projPath);
    await page.waitForTimeout(1200);
    const d3 = await E(() => window.__editor.doc);
    ok(d3.width === 600 && (await layers()).length === count, 'project file (.pmproj) round-trips');

    // --- export PNG / JPG / WebP
    for (const fmt of ['PNG', 'JPG', 'WebP']) {
      await page.keyboard.press('Control+e');
      await page.waitForSelector('[data-testid=export-download]');
      await page.click(`.modal .seg button:has-text("${fmt}")`);
      const [d] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=export-download]')]);
      const out = path.join(tmp, d.suggestedFilename());
      await d.saveAs(out);
      const head = fs.readFileSync(out).subarray(0, 12);
      const magic = fmt === 'PNG' ? head[1] === 0x50 : fmt === 'JPG' ? head[0] === 0xff : head.toString('ascii', 8, 12) === 'WEBP';
      ok(magic && fs.statSync(out).size > 1000, `export ${fmt} produces a valid file`);
    }

    // --- quick background removal (offline engine)
    await E(() => {
      const e = window.__editor;
      e.selectLayer(e.objects().find((o) => o.type === 'image').id);
    });
    await page.click('[data-testid=tab-ai]');
    await page.click('[data-testid=quick-remove-bg]');
    await idle();
    const ln = await layers();
    ok(ln.some((n) => /cutout/.test(n)) && ln.some((n) => /original/.test(n)), 'background removal adds cutout and keeps original');

    // --- batch
    await page.keyboard.press('Control+Shift+B');
    const [fc3] = await Promise.all([page.waitForEvent('filechooser'), page.click('.drop-zone')]);
    await fc3.setFiles([imgPath, imgPath]);
    await page.click('[data-testid=batch-run]');
    await page.waitForSelector('[data-testid=batch-download]', { timeout: 60000 });
    const [dz] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=batch-download]')]);
    const zipPath = path.join(tmp, 'b.zip');
    await dz.saveAs(zipPath);
    ok(fs.readFileSync(zipPath).subarray(0, 2).toString() === 'PK', 'batch produces a ZIP');

    ok(errors.length === 0, `no uncaught page errors ${errors.length ? JSON.stringify(errors) : ''}`);
  } catch (e) {
    console.error(e);
    failures++;
  } finally {
    await browser.close();
    server?.kill();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})();
