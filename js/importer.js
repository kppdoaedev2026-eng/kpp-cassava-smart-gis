KPP.Importer = (function () {
  const U = KPP.U, C = KPP.CONFIG, DA = KPP.Data;
  const FIELD_LABELS = {
    '': '— ไม่ใช้ —', year: 'ปี (พ.ศ.)', district: 'อำเภอ', tambon: 'ตำบล', moo: 'หมู่ที่/หมู่บ้าน', planted: 'พื้นที่ปลูก (ไร่)',
    harvested: 'พื้นที่เก็บเกี่ยว (ไร่)', production: 'ผลผลิต (ตัน)', cmd: 'พื้นที่ระบาดใบด่าง (ไร่)', resist: 'พื้นที่พันธุ์ต้านทาน+ทนทาน (ไร่)',
    variety: 'ชื่อพันธุ์', clean_stem: 'แปลงพันธุ์สะอาด (ไร่)', name: 'ชื่อจุด/สถานที่', lat: 'Latitude', lng: 'Longitude',
    utm_x: 'UTM Easting (X)', utm_y: 'UTM Northing (Y)', zone: 'โซน UTM'
  };
  const NUM_FIELDS = ['planted', 'harvested', 'production', 'cmd', 'resist', 'clean_stem'];
  let parsed = null;

  const normH = (s) => String(s || '').toLowerCase().replace(/[\s_\-().:]/g, '').replace(/ไร่|ตัน|กก\./g, '');

  function autoMap(headers) {
    const used = new Set();
    const map = {};
    const syn = Object.entries(C.IMPORT_FIELDS).map(([k, list]) => [k, list.map(normH)]);
    // pass 1 exact, pass 2 contains
    [true, false].forEach((exact) => {
      headers.forEach((h, i) => {
        if (map[i] !== undefined) return;
        const n = normH(h);
        if (!n) return;
        for (const [k, list] of syn) {
          if (used.has(k)) continue;
          if (list.some((s) => (exact ? n === s : s.length > 1 && (n.includes(s) || (n.length > 2 && s.includes(n)))))) { map[i] = k; used.add(k); break; }
        }
      });
    });
    return map;
  }

  /* ---------- parse ---------- */
  function readFile(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onerror = () => rej(r.error);
      r.onload = () => res(r.result);
      if (/\.(xlsx|xls|zip)$/i.test(file.name)) r.readAsArrayBuffer(file); else r.readAsText(file, 'utf-8');
    });
  }

  async function parseTable(file) {
    const content = await readFile(file);
    let rows;
    if (/\.csv$/i.test(file.name)) {
      let txt = content;
      if (txt.includes('�')) txt = await readAs(file, 'windows-874');
      rows = Papa.parse(txt.replace(/^﻿/, ''), { skipEmptyLines: true }).data;
    } else {
      const wb = XLSX.read(content, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
    }
    rows = rows.filter((r) => r && r.some((c) => c !== null && c !== ''));
    let hi = rows.findIndex((r) => r.filter((c) => typeof c === 'string' && c.trim()).length >= 2);
    if (hi < 0) hi = 0;
    const headers = rows[hi].map((h, i) => (h === null || h === '' ? 'คอลัมน์ ' + (i + 1) : String(h).trim()));
    return { name: file.name, headers, rows: rows.slice(hi + 1), map: autoMap(headers) };
  }
  function readAs(file, enc) {
    return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsText(file, enc); });
  }

  /* ---------- table UI ---------- */
  function showMapping() {
    const p = parsed;
    document.getElementById('mapStep').hidden = false;
    document.getElementById('impFileName').textContent = p.name;
    document.getElementById('impRowCount').textContent = U.fmt(p.rows.length) + ' แถว';
    const yearInput = document.getElementById('impDefaultYear');
    if (!yearInput.value) yearInput.value = KPP.App.state.year;
    const opts = (sel) => Object.entries(FIELD_LABELS).map(([k, l]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${l}</option>`).join('');
    document.getElementById('mapGrid').innerHTML = `<table><tr><th>คอลัมน์ในไฟล์</th>${p.headers.map((h) => `<th>${U.esc(h)}</th>`).join('')}</tr>
      <tr><th>จับคู่เป็น</th>${p.headers.map((h, i) => `<td class="${p.map[i] ? 'auto' : ''}"><select data-col="${i}">${opts(p.map[i] || '')}</select></td>`).join('')}</tr></table>`;
    document.querySelectorAll('#mapGrid select').forEach((s) => s.addEventListener('change', () => {
      const i = +s.dataset.col;
      if (s.value) Object.keys(p.map).forEach((k) => { if (p.map[k] === s.value && +k !== i) { delete p.map[k]; } });
      if (s.value) p.map[i] = s.value; else delete p.map[i];
      showMapping();
    }));
    document.getElementById('previewGrid').innerHTML = `<table><tr>${p.headers.map((h) => `<th>${U.esc(h)}</th>`).join('')}</tr>${p.rows.slice(0, 8).map((r) => `<tr>${p.headers.map((h, i) => `<td>${U.esc(r[i] ?? '')}</td>`).join('')}</tr>`).join('')}</table>`;
    validate();
  }

  function buildRecords() {
    const p = parsed, m = {};
    Object.entries(p.map).forEach(([i, k]) => { m[k] = +i; });
    const defYear = +document.getElementById('impDefaultYear').value || KPP.App.state.year;
    const defZone = +document.getElementById('impZone').value || 47;
    const get = (r, k) => (m[k] === undefined ? null : r[m[k]]);
    const recs = [], points = [], issues = { noDistrict: 0, badCoord: 0 };
    p.rows.forEach((r, idx) => {
      let year = U.toNum(get(r, 'year'));
      if (year && year < 2400) year += 543;
      year = year || defYear;
      const dRaw = get(r, 'district');
      let dcode = dRaw ? DA.resolveDistrict(dRaw) : null;
      const tcode = DA.resolveTambon(dcode, get(r, 'tambon'));
      if (!dcode && tcode) dcode = tcode.slice(0, 4);
      let lat = U.toNum(get(r, 'lat')), lng = U.toNum(get(r, 'lng'));
      const ux = U.toNum(get(r, 'utm_x')), uy = U.toNum(get(r, 'utm_y'));
      if ((!U.isNum(lat) || !U.isNum(lng)) && U.isNum(ux) && U.isNum(uy) && ux > 100000 && uy > 1000000) {
        [lat, lng] = U.utmToLatLng(ux, uy, U.toNum(get(r, 'zone')) || defZone);
      }
      if (U.isNum(lat) && U.isNum(lng) && lat > 90 && lng < 90) [lat, lng] = [lng, lat];
      const hasCoord = U.isNum(lat) && U.isNum(lng) && lat > 5 && lat < 21 && lng > 97 && lng < 106;
      if ((U.isNum(lat) || U.isNum(ux)) && !hasCoord) issues.badCoord++;
      const rec = { year, dcode, tcode, moo: get(r, 'moo'), file: p.name };
      let anyNum = false;
      NUM_FIELDS.forEach((k) => { const v = U.toNum(get(r, k)); rec[k] = v; if (v !== null) anyNum = true; });
      const variety = get(r, 'variety');
      if (rec.resist === null && variety && rec.planted !== null) { rec.resist = ['resistant', 'tolerant'].includes(DA.varietyClass(variety)) ? rec.planted : 0; }
      if (!dcode && !hasCoord) issues.noDistrict++;
      if (anyNum && dcode) recs.push(rec);
      if (hasCoord) {
        const props = { ลำดับ: idx + 1 };
        p.headers.forEach((h, i) => { if (r[i] !== null && r[i] !== '') props[h] = r[i]; });
        points.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lng, lat] } });
      }
    });
    return { recs, points, issues };
  }

  function validate() {
    const { recs, points, issues } = buildRecords();
    const el = document.getElementById('impValidation');
    const mapped = Object.values(parsed.map);
    const warn = [];
    if (!mapped.includes('district') && !mapped.includes('tambon') && !points.length) warn.push('ไม่พบคอลัมน์อำเภอ/ตำบล หรือพิกัด');
    if (issues.noDistrict) warn.push(`${issues.noDistrict} แถวจับคู่อำเภอไม่ได้`);
    if (issues.badCoord) warn.push(`${issues.badCoord} แถวพิกัดอยู่นอกประเทศไทย`);
    el.innerHTML = `พร้อมนำเข้า: <b>${U.fmt(recs.length)}</b> แถวสถิติ · <b>${U.fmt(points.length)}</b> จุดพิกัด${warn.length ? ' · <span style="color:var(--critical-ink)">⚠ ' + warn.join(' · ') + '</span>' : ''}`;
    document.getElementById('btnDoImport').disabled = !recs.length && !points.length;
  }

  function doImport() {
    const { recs, points } = buildRecords();
    if (recs.length) DA.addImportRecords(recs);
    if (points.length) {
      const hasDisease = points.some((f) => Object.keys(f.properties).some((k) => /ระบาด|โรค|cmd/i.test(k)));
      const hasClean = Object.values(parsed.map).includes('clean_stem');
      KPP.Map.addCustomLayer(parsed.name.replace(/\.[^.]+$/, ''), { type: 'FeatureCollection', features: points },
        { color: hasDisease ? '#b91c1c' : hasClean ? '#0f766e' : '#0e7490', role: hasClean ? 'clean' : 'custom' });
    }
    const years = [...new Set(recs.map((r) => r.year))];
    U.toast(`นำเข้าแล้ว ${U.fmt(recs.length)} แถว${points.length ? ' และ ' + U.fmt(points.length) + ' จุด' : ''}${years.length ? ' (ปี ' + years.join(', ') + ')' : ''}`, 'ok');
    if (years.length === 1 && years[0] !== KPP.App.state.year && C.YEARS.includes(years[0])) KPP.App.setYear(years[0]);
    else KPP.App.update();
    parsed = null;
    document.getElementById('mapStep').hidden = true;
    renderManage();
  }

  /* ---------- spatial ---------- */
  function reprojectIfUTM(gj, zone) {
    let utm = false;
    const walk = (c) => {
      if (typeof c[0] === 'number') {
        if (Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) { utm = true; const [la, ln] = U.utmToLatLng(c[0], c[1], zone); c[0] = ln; c[1] = la; }
        return;
      }
      c.forEach(walk);
    };
    (gj.features || []).forEach((f) => f.geometry && f.geometry.coordinates && walk(f.geometry.coordinates));
    return utm;
  }
  async function importSpatial(file) {
    busy(true, 'กำลังอ่านชั้นข้อมูล ' + file.name);
    try {
      let gj;
      if (/\.zip$/i.test(file.name)) {
        const buf = await readFile(file);
        gj = await shp(buf);
        if (Array.isArray(gj)) gj = { type: 'FeatureCollection', features: gj.flatMap((x) => x.features) };
      } else if (/\.kml$/i.test(file.name)) {
        const txt = await readFile(file);
        gj = toGeoJSON.kml(new DOMParser().parseFromString(txt, 'text/xml'));
      } else {
        gj = JSON.parse(await readFile(file));
      }
      if (gj.type === 'Feature') gj = { type: 'FeatureCollection', features: [gj] };
      if (!gj.features || !gj.features.length) throw new Error('ไม่พบ feature ในไฟล์');
      const zone = +document.getElementById('impZone').value || 47;
      const utm = reprojectIfUTM(gj, zone);
      const role = document.getElementById('spatialRole').value;
      const color = document.getElementById('spatialColor').value;
      const name = file.name.replace(/\.[^.]+$/, '');
      if (role === 'flood') {
        DA.setFloodPolygons(gj.features);
        KPP.Map.layers.flood.on = true;
        KPP.App.update();
        const a = DA.agg(KPP.App.state.year);
        U.toast(`ใช้ขอบเขตน้ำท่วม "${name}" แล้ว: ทับซ้อนแปลงมันฯ ${U.fmt(a.flood)} ไร่`, 'ok', 5000);
      } else {
        if (role === 'soil') KPP.Map.layers.soil.on = true;
        KPP.Map.addCustomLayer(name, gj, { color, role });
        U.toast(`เพิ่มชั้นข้อมูล "${name}" (${gj.features.length} รายการ)${utm ? ' · แปลง UTM→WGS84 แล้ว' : ''}`, 'ok');
      }
      renderManage();
    } catch (e) {
      console.error(e);
      U.toast('อ่านไฟล์ไม่สำเร็จ: ' + e.message, 'err', 6000);
    } finally { busy(false); }
  }

  /* ---------- templates ---------- */
  const TPL_HEAD = ['ปี', 'อำเภอ', 'ตำบล', 'หมู่ที่', 'พื้นที่ปลูก', 'พื้นที่เก็บเกี่ยว', 'ผลผลิต', 'พื้นที่ระบาดใบด่าง', 'พื้นที่พันธุ์ต้านทาน', 'แปลงพันธุ์สะอาด', 'ชื่อพันธุ์', 'lat', 'lng', 'utm_x', 'utm_y', 'zone'];
  const TPL_ROWS = [
    [2569, 'ปางศิลาทอง', 'ปางตาไว', 5, 320, 300, 960, 12.5, 40, 0, 'อิทธิ 1', 16.0631, 99.4523, '', '', ''],
    [2569, 'เมืองกำแพงเพชร', 'อ่างทอง', 9, 210, 210, 690, 4, 15, 5, 'เกษตรศาสตร์ 50', '', '', 546282, 1826491, 47]
  ];
  function template(kind) {
    if (kind === 'csv') U.download('แม่แบบ_ผลสำรวจมันสำปะหลัง.csv', '﻿' + Papa.unparse([TPL_HEAD, ...TPL_ROWS]), 'text/csv;charset=utf-8');
    if (kind === 'xlsx') {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([TPL_HEAD, ...TPL_ROWS]), 'ผลสำรวจ');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['อำเภอ', 'ตำบล', 'รหัสตำบล'], ...Object.values(DA.D.tambons).map((t) => [(DA.D.dByCode[t.district_code] || {}).name, t.name, t.code])]), 'รายชื่อตำบล');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ชื่อพันธุ์ (ตามทะเบียน)'], ...DA.D.P.breeds.map((b) => [b])]), 'รายชื่อพันธุ์');
      XLSX.writeFile(wb, 'แม่แบบ_ผลสำรวจมันสำปะหลัง.xlsx');
    }
    if (kind === 'geojson') {
      const gj = { type: 'FeatureCollection', features: [
        { type: 'Feature', properties: { ปี: 2569, อำเภอ: 'คลองขลุง', ตำบล: 'คลองสมบูรณ์', หมู่ที่: 3, โรค: 'ใบด่าง', พื้นที่ระบาด: 6.5, ระดับ: 'ปานกลาง', วันที่สำรวจ: '2569-11-20' }, geometry: { type: 'Point', coordinates: [99.6912, 16.1675] } },
        { type: 'Feature', properties: { ปี: 2569, อำเภอ: 'ขาณุวรลักษบุรี', ตำบล: 'วังชะพลู', หมู่ที่: 7, โรค: 'ใบด่าง', พื้นที่ระบาด: 2, ระดับ: 'ต่ำ', วันที่สำรวจ: '2569-11-21' }, geometry: { type: 'Point', coordinates: [99.5468, 16.0312] } }
      ] };
      U.download('แม่แบบ_จุดสำรวจโรค.geojson', JSON.stringify(gj, null, 2), 'application/geo+json');
    }
  }

  /* ---------- varieties, settings & manage ---------- */
  function renderSettings() {
    const s = DA.D.settings;
    const rai = Object.fromEntries(DA.varietyBreakdown().map((v) => [v.name, v.rai]));
    const order = Object.fromEntries(C.VARIETY_CLASSES.map((v) => [v.key, v.rank]));
    const list = DA.allVarieties().map((n) => ({ n, cls: DA.varietyClass(n), rai: rai[n] || 0 }))
      .sort((a, b) => order[a.cls] - order[b.cls] || b.rai - a.rai);
    const opts = (sel) => C.VARIETY_CLASSES.map((v) => `<option value="${v.key}" ${sel === v.key ? 'selected' : ''}>${v.label}</option>`).join('');
    const col = Object.fromEntries(C.VARIETY_CLASSES.map((v) => [v.key, v.color]));
    document.getElementById('varietyList').innerHTML = list.map((v) => `<div class="vrow" style="--vc:${col[v.cls]}"><span class="vn" title="${U.esc(v.n)}">${U.esc(v.n)}</span><small>${v.rai ? U.fmt(v.rai) + ' ไร่' : 'ยังไม่มีในทะเบียน'}</small><select data-v="${U.esc(v.n)}">${opts(v.cls)}</select></div>`).join('');
    document.getElementById('varietyList').querySelectorAll('select').forEach((sel) => sel.addEventListener('change', () => { sel.parentElement.style.setProperty('--vc', col[sel.value]); }));
    document.getElementById('newVarClass').innerHTML = opts('resistant');
    document.getElementById('setPrice').value = s.price;
  }
  function addVariety() {
    const name = document.getElementById('newVarName').value.trim();
    if (!name) { U.toast('กรุณาระบุชื่อพันธุ์', 'err'); return; }
    DA.addVariety(name, document.getElementById('newVarClass').value);
    document.getElementById('newVarName').value = '';
    renderSettings();
    U.toast(`เพิ่มพันธุ์ "${name}" แล้ว — กด "บันทึกและคำนวณใหม่" เพื่อใช้งาน`, 'ok');
  }
  function saveSettings() {
    document.querySelectorAll('#varietyList select').forEach((sel) => DA.setVarietyClass(sel.dataset.v, sel.value));
    const pr = U.toNum(document.getElementById('setPrice').value);
    if (U.isNum(pr) && pr > 0) DA.D.settings.price = pr;
    busy(true, 'กำลังคำนวณใหม่…');
    setTimeout(() => { DA.saveSettings(); KPP.App.update(); busy(false); U.toast('บันทึกการตั้งค่าและคำนวณใหม่แล้ว', 'ok'); }, 30);
  }
  function renderManage() {
    const files = {};
    DA.D.imports.records.forEach((r) => { files[r.file] = (files[r.file] || 0) + 1; });
    const h = [];
    Object.entries(files).forEach(([f, n]) => h.push(`<div class="imp-item"><span>📄 ${U.esc(f)} — ${U.fmt(n)} แถวสถิติ <span class="badge src-import">บันทึกในเบราว์เซอร์</span></span><button class="btn sm danger" data-del-file="${U.esc(f)}">ลบ</button></div>`));
    if (DA.D.flood.polygons) h.push(`<div class="imp-item"><span>🌊 ขอบเขตน้ำท่วมซ้ำซากที่นำเข้า (${DA.D.flood.polygons.length} รูปปิด)</span><button class="btn sm danger" data-del-flood>ยกเลิก (กลับไปใช้รายงานอุทกภัย)</button></div>`);
    KPP.Map.custom.forEach((c) => h.push(`<div class="imp-item"><span>🗺️ ${U.esc(c.name)} — ${c.count} รายการ</span><button class="btn sm danger" data-del-layer="${c.id}">ลบ</button></div>`));
    document.getElementById('importList').innerHTML = h.join('') || '<p class="hint">ยังไม่มีข้อมูลที่นำเข้า</p>';
  }

  function busy(on, txt) {
    document.getElementById('busy').hidden = !on;
    if (txt) document.getElementById('busyText').textContent = txt;
  }

  async function onTableFile(file) {
    if (!file) return;
    busy(true, 'กำลังอ่าน ' + file.name);
    try { parsed = await parseTable(file); showMapping(); }
    catch (e) { console.error(e); U.toast('อ่านไฟล์ไม่สำเร็จ: ' + e.message, 'err', 6000); }
    finally { busy(false); }
  }

  function bindDrop(labelId, inputId, handler) {
    const lab = document.getElementById(labelId), inp = document.getElementById(inputId);
    inp.addEventListener('change', () => { handler(inp.files[0]); inp.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => lab.addEventListener(ev, (e) => { e.preventDefault(); lab.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => lab.addEventListener(ev, (e) => { e.preventDefault(); lab.classList.remove('over'); }));
    lab.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) handler(f); });
  }

  function open(tab) {
    document.getElementById('importModal').hidden = false;
    renderSettings(); renderManage();
    if (tab) switchTab(tab);
  }
  function close() { document.getElementById('importModal').hidden = true; }
  function switchTab(t) {
    document.querySelectorAll('#impTabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.itab === t));
    document.querySelectorAll('.itab').forEach((p) => p.classList.toggle('active', p.id === 'itab-' + t));
  }

  function init() {
    bindDrop('dropTable', 'fileTable', onTableFile);
    bindDrop('dropSpatial', 'fileSpatial', (f) => f && importSpatial(f));
    document.getElementById('impDefaultYear').addEventListener('change', () => parsed && validate());
    document.getElementById('impZone').addEventListener('change', () => parsed && validate());
    document.getElementById('btnDoImport').addEventListener('click', doImport);
    document.querySelectorAll('[data-tpl]').forEach((b) => b.addEventListener('click', () => template(b.dataset.tpl)));
    document.getElementById('btnSaveSettings').addEventListener('click', saveSettings);
    document.getElementById('btnAddVar').addEventListener('click', addVariety);
    document.getElementById('newVarName').addEventListener('keydown', (e) => { if (e.key === 'Enter') addVariety(); });
    document.getElementById('btnResetVar').addEventListener('click', () => { DA.resetVarieties(); renderSettings(); U.toast('คืนค่าการจัดกลุ่มพันธุ์เริ่มต้นแล้ว — กดบันทึกเพื่อคำนวณใหม่', 'ok'); });
    document.getElementById('btnClearImports').addEventListener('click', () => {
      if (!confirm('ล้างข้อมูลที่นำเข้าทั้งหมด (สถิติ ชั้นข้อมูล และขอบเขตน้ำท่วม)?')) return;
      [...KPP.Map.custom].forEach((c) => KPP.Map.removeCustom(c.id));
      DA.clearImports(); KPP.App.update(); renderManage();
      U.toast('ล้างข้อมูลนำเข้าแล้ว', 'ok');
    });
    document.getElementById('importList').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.delFile) { DA.D.imports.records = DA.D.imports.records.filter((r) => r.file !== b.dataset.delFile); DA.addImportRecords([]); KPP.App.update(); }
      if (b.dataset.delFlood !== undefined) { DA.setFloodPolygons(null); KPP.App.update(); }
      if (b.dataset.delLayer) KPP.Map.removeCustom(b.dataset.delLayer);
      renderManage();
    });
    document.querySelectorAll('#impTabs .tab').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.itab)));
    document.querySelectorAll('#importModal [data-close]').forEach((b) => b.addEventListener('click', close));
    document.getElementById('importModal').addEventListener('click', (e) => { if (e.target.id === 'importModal') close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }

  return { init, open, close, parseTable, autoMap, buildRecords, importSpatial, template, busy,
    _setParsed: (p) => { parsed = p; }, _doImport: () => doImport() };
})();
