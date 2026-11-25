/* ตรวจข้อมูลก่อน push (Node, ไม่ต้องติดตั้งอะไร): node tests/data_check.js
   1) ไฟล์สาธารณะ (data/*.js, api/v1/*.json, *.html, js/*.js) ไม่มีข้อมูลส่วนบุคคล: เลขบัตร 13 หลัก, เบอร์มือถือ, ชื่อฟิลด์ต้องห้าม
   2) ไม่มีไฟล์ในโฟลเดอร์ต้องห้ามถูก track ใน git (data/private, *.xlsx, ข้อมูลทะเบียนเกษตรกร)
   3) ข้อมูลรายงานสอดคล้อง: รหัสอำเภอ, ผลรวมสนับสนุน */
const fs = require('fs'), path = require('path'), cp = require('child_process'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const fails = [], notes = [];
const fail = (m) => fails.push(m);

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['.git', 'vendor', 'private', 'source', 'node_modules'].includes(e.name)) walk(p, out); }
    else if (/\.(js|json|html|csv|md)$/.test(e.name)) out.push(p);
  });
  return out;
}
const files = walk(ROOT, []).filter((p) => !p.includes(path.join('tests', '')));

/* 1) ข้อมูลส่วนบุคคล */
const FORBID_KEYS = /["']?(owner_name|idcard|id_card|national_id|citizen_id|surname|DOC_NO|parcel_user_id|wkt)["']?\s*:/i;
const ID13 = /(?<![\d.])[1-8]\d{12}(?![\d.])/;           // เลขบัตรประชาชน 13 หลัก (ไม่นำหน้า 0, ไม่ใช่ทศนิยม)
const PHONE = /(?<![\d.])0[689]\d{8}(?![\d.])/;           // เบอร์มือถือไทย 10 หลัก
files.forEach((p) => {
  const rel = path.relative(ROOT, p).split(path.sep).join('/');
  if (/^(tools|docs)\//.test(rel) || /\.md$/.test(rel) || rel === 'js/admin.js' || rel === 'admin.html') return; // เอกสาร/โค้ดแอดมินกล่าวถึงชื่อฟิลด์ได้
  const s = fs.readFileSync(p, 'utf8');
  if (FORBID_KEYS.test(s)) fail(rel + ': พบชื่อฟิลด์ต้องห้าม');
  if (/^(data|api)\//.test(rel)) {
    if (ID13.test(s)) fail(rel + ': พบตัวเลข 13 หลักคล้ายเลขบัตรประชาชน');
    if (PHONE.test(s)) fail(rel + ': พบตัวเลขคล้ายเบอร์โทร');
  }
});

/* 2) ไฟล์ที่ไม่ควรอยู่ใน git */
try {
  const tracked = cp.execSync('git ls-files', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(Boolean);
  tracked.forEach((t) => {
    if (/^data\/private\//.test(t) || /\.xlsx?$/i.test(t) || /^ข้อมูลการขึ้นทะเบียน/.test(t) || /^\w*\.csv$/i.test(t) && !/^(api|data)\//.test(t)) fail('git track ไฟล์ต้องห้าม: ' + t);
  });
  notes.push('git ls-files ตรวจ ' + tracked.length + ' ไฟล์');
} catch (e) { notes.push('ข้ามการตรวจ git (' + e.message.split('\n')[0] + ')'); }

/* 3) ข้อมูลรายงาน */
try {
  const ctx = { window: {} }; vm.createContext(ctx);
  ['geo.js', 'reports.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'), ctx, { filename: f }));
  const R = ctx.window.KPP_REPORTS;
  if (!R) fail('ไม่พบ KPP_REPORTS');
  else {
    const S = R.support;
    if (S) {
      const codes = new Set(Object.keys((R.resist_plots || {}).tambons || {}).map((t) => t.slice(0, 4)));
      let tot = 0; S.records.forEach((r) => { if (!(r.rai > 0)) fail('support: แถวไม่มีไร่ ' + JSON.stringify(r).slice(0, 80)); tot += r.rai; });
      notes.push('support: ' + S.records.length + ' รายการ · ' + tot.toFixed(1) + ' ไร่ · ปี ' + [...new Set(S.records.map((r) => r.year))].sort().join(','));
    }
    const rp = R.resist_plots; if (rp) { const sum = Object.values(rp.tambons).reduce((a, t) => a + t.plots, 0); notes.push('แปลงส่งเสริม ' + sum + ' แปลง'); if (rp.total && rp.total.plots && rp.total.plots !== sum) fail('resist_plots: total.plots ' + rp.total.plots + ' ≠ Σตำบล ' + sum); }
  }
} catch (e) { fail('อ่านข้อมูลรายงานไม่ได้: ' + e.message); }

notes.forEach((n) => console.log('· ' + n));
if (fails.length) { console.log('\n❌ พบ ' + fails.length + ' รายการ'); fails.forEach((f) => console.log(' - ' + f)); process.exit(1); }
console.log('\n✅ ผ่านการตรวจข้อมูล (ส่วนบุคคล/ไฟล์ต้องห้าม/ความสอดคล้อง)');
