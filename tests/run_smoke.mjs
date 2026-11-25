// รันชุดทดสอบหน้าเว็บด้วย Chrome แบบไม่มีหน้าจอ (ใช้ใน GitHub Actions หลัง deploy)
// ใช้งาน: npx -y -p puppeteer@22.15.0 node tests/run_smoke.mjs [URL]
import puppeteer from 'puppeteer';
const base = process.argv[2] || 'https://kppdoaedev2026-eng.github.io/kpp-cassava-smart-gis/';
const url = base.replace(/\/?$/, '/') + 'tests.html?auto&t=' + Date.now();
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--window-size=1400,900'] });
let code = 1;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  console.log('เปิด', url);
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.KPP_SMOKE_RESULT || /ล้มเหลว/.test(document.getElementById('res').innerText), { timeout: 600000, polling: 2000 });
  const out = await page.evaluate(() => ({ r: window.KPP_SMOKE_RESULT || null, text: document.getElementById('res').innerText }));
  console.log(out.text);
  code = out.r && out.r.ok ? 0 : 1;
} catch (e) { console.error('ทดสอบไม่สำเร็จ:', e.message); }
await browser.close();
process.exit(code);
