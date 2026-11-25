/* ชุดทดสอบหน้าเว็บ (รันในเบราว์เซอร์) — เปิดทุกโมดูล × ทุกแท็บ × ทุกอำเภอ (+ตำบลตัวอย่าง) แล้วตรวจว่า
   1) หน้าไม่ว่าง  2) ไม่มีการ์ด "แสดงผลไม่สำเร็จ"  3) ไม่มี NaN/undefined/Infinity  4) ไม่มี console error  5) ตัวเลขหลักสอดคล้องกัน
   ใช้งาน: เปิด tests.html (รันอัตโนมัติ) หรือใน console ของหน้าเว็บ: await KPPSmoke.run(window) */
window.KPPSmoke = (function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function run(win, progress) {
    const doc = win.document, K = win.KPP, App = K.App, DA = K.Data;
    const fails = [], errs = [];
    let n = 0;
    const origErr = win.console.error;
    win.console.error = function () { errs.push([...arguments].map(String).join(' ').slice(0, 200)); return origErr.apply(this, arguments); };
    win.addEventListener('error', (e) => errs.push('onerror: ' + e.message));
    win.addEventListener('unhandledrejection', (e) => errs.push('rejection: ' + (e.reason && e.reason.message)));
    const fail = (where, what) => fails.push(where + ' → ' + what);
    const BAD = /\bNaN\b|\bundefined\b|\bInfinity\b|\[object Object\]/;

    function check(where) {
      n++;
      const body = doc.getElementById('sideBody'), text = body.innerText || '';
      if (text.trim().length < 80) fail(where, 'หน้าว่าง/สั้นผิดปกติ (' + text.trim().length + ' ตัวอักษร)');
      if (/แสดงผลไม่สำเร็จ|เริ่มระบบไม่สำเร็จ/.test(text)) fail(where, 'มีการ์ดข้อผิดพลาด');
      const bad = text.match(BAD); if (bad) fail(where, 'พบค่าผิดปกติใน body: ' + bad[0]);
      const kp = [...doc.querySelectorAll('.kpi')]; if (!kp.length) fail(where, 'ไม่มี KPI');
      kp.forEach((k) => { const b = k.innerText.match(BAD); if (b) fail(where, 'KPI มี ' + b[0] + ': ' + k.innerText.replace(/\n+/g, ' ').slice(0, 60)); });
      const sum = doc.querySelectorAll('canvas').length; // ตรวจกราฟมี canvas แต่ไม่ตรวจพิกเซล
      return sum;
    }

    const mods = [...doc.querySelectorAll('.modbar .mod')].map((b) => b.dataset.mod);
    const districts = [...doc.getElementById('fDistrict').options].map((o) => o.value);   // '' = ทั้งจังหวัด
    for (const m of mods) {
      for (const d of districts) {
        App.selectDistrict(d || null); App.setModule(m); await sleep(120);
        const tabs = [...doc.querySelectorAll('#sideTabs .tab')].map((b) => b.dataset.tab);
        for (const t of tabs) {
          App.showTab(t); await sleep(60);
          check(`${m}/${t}/${d || 'ทั้งจังหวัด'}`);
        }
        // ตำบลตัวอย่าง 2 ตำบลแรกของอำเภอ
        if (d) {
          const tb = [...doc.getElementById('fTambon').options].map((o) => o.value).filter(Boolean).slice(0, 2);
          for (const tcode of tb) {
            App.selectTambon(tcode); await sleep(100);
            const cur = doc.querySelector('#sideTabs .tab.active'); check(`${m}/${cur ? cur.dataset.tab : '?'}/${d}/ต.${tcode}`);
          }
          App.selectTambon(null);
        }
        if (progress) progress(m, d, n);
      }
    }
    App.selectDistrict(null); App.setModule('overview'); await sleep(200);

    /* ตัวเลขหลักต้องสอดคล้องกัน */
    const y = 2569, tot = DA.agg(y, {}), ds = DA.D.districts.map((d) => DA.agg(y, { district: d.code }));
    const sumOf = (k) => ds.reduce((a, r) => a + (r[k] || 0), 0);
    [['planted', 0.005], ['cmd', 0.005], ['resist', 0.005], ['flood', 0.005]].forEach(([k, tol]) => {
      if (tot[k] > 0 && Math.abs(sumOf(k) - tot[k]) / tot[k] > tol) fail('สอดคล้อง', `Σอำเภอ ${k} = ${Math.round(sumOf(k))} ≠ จังหวัด ${Math.round(tot[k])}`);
    });
    if (tot.resistPct > 1 || tot.resistPct < 0) fail('สอดคล้อง', 'resistPct นอกช่วง 0–1: ' + tot.resistPct);
    if (tot.cmd > tot.standing * 1.001) fail('สอดคล้อง', 'พื้นที่ระบาด > พื้นที่ปลูก');
    const g = App.cmdGoal(null); if (g) {
      if (Math.abs(g.target - g.base * 0.7) > 1) fail('สอดคล้อง', 'เป้า ≠ ฐาน×0.7');
      if (g.replant < 0) fail('สอดคล้อง', 'พื้นที่ทดแทนติดลบ');
    }
    const S = DA.D.rep.support; if (S) {
      const bad = S.records.filter((r) => !(r.rai > 0) || (r.d && !DA.D.dByCode[r.d]));
      if (bad.length) fail('ทะเบียนสนับสนุน', bad.length + ' แถวไม่มีไร่หรือรหัสอำเภอไม่ถูกต้อง');
    }
    win.console.error = origErr;
    errs.forEach((e) => fail('console', e));
    return { checked: n, failures: fails, ok: !fails.length };
  }
  return { run };
})();
