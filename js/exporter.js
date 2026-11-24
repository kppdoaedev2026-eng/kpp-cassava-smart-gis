KPP.Exporter = (function () {
  const U = KPP.U, C = KPP.CONFIG, DA = KPP.Data;
  const busy = (on, t) => KPP.Importer.busy(on, t);
  const stamp = () => new Date().toISOString().slice(0, 10);
  const scopeName = (S) => (S.tambon ? 'ต.' + DA.D.tambons[S.tambon].name + ' ' : '') + (S.district ? 'อ.' + DA.D.dByCode[S.district].name : 'จังหวัดกำแพงเพชร');
  const fontsReady = () => (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve());

  async function png() {
    busy(true, 'กำลังสร้างภาพแดชบอร์ด…');
    try {
      await fontsReady();
      const mapEl = document.getElementById('map');
      const staticUrl = KPP.Map.renderStatic(mapEl.clientWidth, mapEl.clientHeight).toDataURL('image/png');
      const c = await html2canvas(document.getElementById('app'), {
        useCORS: true, logging: false, scale: Math.min(2, window.devicePixelRatio || 1), backgroundColor: getComputedStyle(document.body).backgroundColor,
        onclone: (doc) => { doc.getElementById('map').innerHTML = `<img src="${staticUrl}" style="width:100%;height:100%;object-fit:contain;background:#fff">`; }
      });
      c.toBlob((b) => U.download(`KPP-Cassava-Dashboard_${stamp()}.png`, b));
    } catch (e) { console.error(e); U.toast('สร้างภาพไม่สำเร็จ: ' + e.message, 'err'); }
    finally { busy(false); }
  }

  function canvasToPdf(canvas, name, orientation = 'landscape') {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const pw = orientation === 'landscape' ? 297 : 210, ph = orientation === 'landscape' ? 210 : 297, m = 8;
    const r = Math.min((pw - 2 * m) / canvas.width, (ph - 2 * m) / canvas.height);
    doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (pw - canvas.width * r) / 2, (ph - canvas.height * r) / 2, canvas.width * r, canvas.height * r);
    doc.save(name);
  }

  async function atlas(fmt) {
    const S = KPP.App.state;
    busy(true, 'กำลังจัดทำชุดแผนที่…');
    try {
      await fontsReady();
      const cv = KPP.Map.renderAtlasCanvas({ year: S.year, district: S.district, tambon: null });
      const base = `ชุดแผนที่โรคใบด่าง_${S.district ? DA.D.dByCode[S.district].name + '_' : ''}${S.year}_${stamp()}`;
      if (fmt === 'pdf') canvasToPdf(cv, base + '.pdf');
      else cv.toBlob((b) => U.download(base + '.png', b));
    } catch (e) { console.error(e); U.toast('สร้างชุดแผนที่ไม่สำเร็จ: ' + e.message, 'err'); }
    finally { busy(false); }
  }

  const tbl = (head, rows) => `<table><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;

  async function pdf() {
    const S = KPP.App.state;
    busy(true, 'กำลังจัดทำรายงานผู้บริหาร…');
    try {
      await fontsReady();
      const mapCanvas = KPP.Map.renderStatic();
      const atlasCanvas = KPP.Map.renderAtlasCanvas({ year: S.year, district: S.district, tambon: null });
      const legendHtml = document.getElementById('legend').innerHTML;
      const a = DA.agg(S.year, { district: S.district, tambon: S.tambon });
      const yo = DA.yoy(S.year, { district: S.district, tambon: S.tambon });
      const uw = S.district ? 'ตำบล' : 'อำเภอ';
      const rm = DA.riskMatrix(S.year, S.district).filter((r) => !r.minor);
      const cm = DA.cmdMatrix(S.year, S.district).filter((r) => !r.minor);
      const rr = DA.rootRotMatrix(S.district).slice(0, 12);
      const t7 = (window.KPP_LDD ? window.KPP_LDD.table7.rows : []).filter((r) => !S.district || r.district_code === S.district);
      const goal = S.year === 2569 ? KPP.App.cmdGoal(S.district) : null;
      const goalRows = S.year === 2569 ? DA.D.districts.filter((d) => !S.district || d.code === S.district).map((d) => Object.assign({ name: d.name }, KPP.App.cmdGoal(d.code) || {})).filter((r) => r.base > 0).sort((x, y) => y.replant - x.replant) : [];
      const host = document.getElementById('reportHost');
      host.innerHTML = `<div class="report" id="rep">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:6px"><img src="assets/img/logo-doae.png" style="width:56px;border:0"><img src="assets/img/seal-kpp.png" style="width:56px;border:0">
          <div><h1>รายงานสรุปสถานการณ์มันสำปะหลัง ${U.esc(scopeName(S))} ปีเพาะปลูก ${S.year}</h1>
          <div class="r-sub" style="margin:0">${U.esc(C.TITLE)} · จัดทำเมื่อ ${U.thaiDate()}<br>จัดทำโดย ${U.esc(C.DEVELOPER)} ${U.esc(C.DEVELOPER_TITLE)} ${U.esc(C.DEVELOPER_UNIT)}</div></div></div>
        <div class="r-kpis">
          <div class="r-kpi"><span>พื้นที่ปลูกขึ้นทะเบียน (ไร่)</span><b>${U.fmt(a.planted)}</b><span>${yo.comparable && U.isNum(yo.value) ? 'YoY ' + (yo.value >= 0 ? '+' : '') + U.pct(yo.value) : 'YoY: ต่างแหล่งข้อมูล'}</span></div>
          <div class="r-kpi"><span>ผลผลิต (ตัน)</span><b>${U.fmt(a.production)}</b><span>${U.fmt(a.yield)} กก./ไร่</span></div>
          <div class="r-kpi" style="border-left-color:#b2182b"><span>ระบาดใบด่าง (ไร่) ${U.esc(DA.D.rep.cmd ? DA.D.rep.cmd.period.replace(/วัน\S+ที่ /g, '') : '')}</span><b>${U.fmt(a.cmd)}</b><span>${U.pct(a.cmdPct)} ของพื้นที่ปลูก${goal ? ` · เป้าลด ${U.pct(C.CMD_GOAL.reduce, 0)} ≤ ${U.fmt(goal.target)} ไร่` : ''}</span></div>
          <div class="r-kpi" style="border-left-color:#1a7f37"><span>ต้านทาน + ทนทาน (ไร่)</span><b>${U.fmt(a.resist)}</b><span>${U.pct(a.resistPct)} · ต้านทาน ${U.fmt(a.resistant)} · ทนทาน ${U.fmt(a.tolerant)}</span></div>
          <div class="r-kpi" style="border-left-color:#1d4ed8"><span>ทับซ้อนน้ำท่วมซ้ำซาก (ไร่)</span><b>${U.fmt(a.flood)}</b><span>รากเน่าโคนเน่า: ดัชนี ${a.rrIndex ?? '–'} (${a.rrLevel.label})</span></div>
        </div>
        ${KPP.App.summaryHtml(true)}
        <div style="position:relative"><img src="${mapCanvas.toDataURL('image/jpeg', 0.92)}" alt="แผนที่">
          <div class="legend" style="position:absolute;left:10px;bottom:10px;max-height:none;background:#fff;color:#0f172a;border-color:#e2e8f0">${legendHtml}</div></div>
        <h2>ชุดแผนที่วิเคราะห์พื้นที่การจัดการโรคใบด่างมันสำปะหลัง</h2>
        <img src="${atlasCanvas.toDataURL('image/jpeg', 0.9)}" alt="ชุดแผนที่">
        ${goalRows.length ? `<h2>เป้าหมายลดพื้นที่ระบาดโรคใบด่าง ${U.pct(C.CMD_GOAL.reduce, 0)} ด้วยพันธุ์ต้านทาน/ทนทาน</h2>
        ${tbl(['อำเภอ', 'ระบาดฐาน (ไร่)', 'เป้าหมาย ≤ (ไร่)', 'ระบาดล่าสุด (ไร่)', 'ปลูกทดแทน (ไร่)', 'ต้นพันธุ์ (ลำ)', 'แปลงขยาย (ไร่)', 'สนับสนุนแล้ว (ไร่)', '% ของเป้า'], goalRows.map((r) => [U.esc(r.name), U.fmt(r.base), U.fmt(r.target), U.fmt(r.now), U.fmt(r.replant), U.fmtCompact(r.stalks), U.fmt(r.nursery), U.fmt(r.sup.goalRai, 1), U.pct(r.supShare, 1)]))}` : ''}
        <h2>ตารางการจัดการโรคใบด่างราย${uw}</h2>
        ${tbl([uw, 'พื้นที่ปลูก', 'ระบาด', '% ระบาด', 'ต้านทาน', 'ทนทาน', 'ทั่วไป', 'อ่อนแอ', 'ดัชนี', 'ระดับ'], cm.map((r) => [U.esc(r.name), U.fmt(r.standing ?? r.planted), U.fmt(r.cmd), U.pct(r.cmdPct), U.fmt(r.resistant), U.fmt(r.tolerant), U.fmt(r.general), U.fmt(r.susceptible), r.cmdIndex ?? '–', r.cmdLevel.icon + ' ' + r.cmdLevel.label]))}
        <h2>ตารางวิเคราะห์ความเสี่ยงรวมและข้อเสนอแนะ</h2>
        ${tbl([uw, 'พื้นที่ขึ้นทะเบียน', 'ใบด่าง*', 'ต้านทาน+ทนทาน', 'ทับซ้อนน้ำท่วม', 'ศจช. ใกล้สุด (กม.)', 'คะแนน', 'ระดับ'], rm.map((r) => [U.esc(r.name), U.fmt(r.planted), U.pct(r.cmdPct), U.pct(r.resistPct), U.fmt(r.flood), r.nearestPest ? U.fmt(r.nearestPest.km, 1) : '–', r.score ?? '–', r.level.icon + ' ' + r.level.label]))}
        <ul>${rm.slice(0, 5).map((r) => `<li><b>${uw}${U.esc(r.name)}</b> (${r.level.label}): ${r.actions.map(U.esc).join(' · ')}</li>`).join('')}</ul>
        <h2>ตำบลเสี่ยงโรครากเน่าโคนเน่าสูงสุด</h2>
        ${tbl(['ตำบล', 'อำเภอ', 'ปลูก (ไร่)', 'ปีที่ท่วม', 'ดิน S3+N', 'ปลูกฤดูฝน', 'ดัชนี', 'ระดับ'], rr.map((r) => [U.esc(r.name), U.esc(DA.D.dByCode[r.code.slice(0, 4)].name), U.fmt(r.regPlanted), r.flood ? r.flood.nYears : 0, U.pct(r.soilPoorPct), U.pct(r.rainyPct), r.rrIndex, r.rrLevel.icon + ' ' + r.rrLevel.label]))}
        <h2>ความเหมาะสมของที่ดินสำหรับมันสำปะหลัง (กรมพัฒนาที่ดิน)</h2>
        ${tbl(['อำเภอ', 'ศักยภาพ S1', 'S2', 'S3', 'N', 'ปลูกบน S1+S2', 'ปลูกบน S3+N', 'คงเหลือ S1+S2'], t7.map((r) => [U.esc(r.district), U.fmt(r.potential.S1), U.fmt(r.potential.S2), U.fmt(r.potential.S3), U.fmt(r.potential.N), U.fmt(r.planted.S1 + r.planted.S2), U.fmt(r.planted.S3 + r.planted.N), U.fmt(r.remaining.S1 + r.remaining.S2)]))}
        <div class="r-note">แหล่งข้อมูล: ${U.esc(C.SOURCES.OFFICIAL.note)} · ${U.esc(DA.D.P.source)} · ${U.esc(C.SOURCES.LDD.note)} · ${U.esc(C.SOURCES.FLOOD.note)} · ${U.esc(C.SOURCES.NETWORK.note)}<br>
        * พื้นที่ระบาดใบด่าง: ${U.esc(C.SOURCES.REPORT.note)} ${U.esc(DA.D.rep.cmd ? DA.D.rep.cmd.period : '')} (มีเฉพาะระดับอำเภอ ไม่ประมาณค่ารายตำบล) · พื้นที่ปลูก 2569: ${U.esc(C.SOURCES.REGISTRY.note)} · ผลผลิตเฉลี่ย = ผลผลิตรวม ÷ เนื้อที่เก็บเกี่ยว × 1,000 · กลุ่มพันธุ์: ต้านทาน/ทนทาน/ทั่วไป/อ่อนแอ ตามการตั้งค่าในระบบ</div>
      </div>`;
      await Promise.all([...host.querySelectorAll('img')].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
      const canvas = await html2canvas(host.firstElementChild, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const m = 8, iw = 210 - 2 * m;
      const pxPerMm = canvas.width / iw, pageH = Math.floor((297 - 2 * m) * pxPerMm);
      for (let y = 0, page = 0; y < canvas.height; y += pageH, page++) {
        const h = Math.min(pageH, canvas.height - y);
        const part = document.createElement('canvas'); part.width = canvas.width; part.height = h;
        part.getContext('2d').drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
        if (page) doc.addPage();
        doc.addImage(part.toDataURL('image/jpeg', 0.9), 'JPEG', m, m, iw, h / pxPerMm);
      }
      doc.save(`รายงานผู้บริหาร_มันสำปะหลัง_${S.year}_${stamp()}.pdf`);
      host.innerHTML = '';
      U.toast('สร้างรายงาน PDF แล้ว', 'ok');
    } catch (e) { console.error(e); U.toast('สร้าง PDF ไม่สำเร็จ: ' + e.message, 'err', 6000); }
    finally { busy(false); }
  }

  const r0 = (v) => (U.isNum(v) ? Math.round(v) : null);
  const r4 = (v) => (U.isNum(v) ? +v.toFixed(4) : null);

  function xlsx() {
    const S = KPP.App.state;
    const wb = XLSX.utils.book_new();
    const srcL = (k) => (C.SOURCES[k] || {}).label || '';
    const add = (rows, name) => XLSX.utils.book_append_sheet(wb, Array.isArray(rows[0]) ? XLSX.utils.aoa_to_sheet(rows) : XLSX.utils.json_to_sheet(rows), name);
    add(DA.byDistrict(S.year).map((u) => ({
      'รหัส': u.code, 'อำเภอ': u.name, 'พื้นที่ปลูก (ไร่)': r0(u.planted), 'พื้นที่เก็บเกี่ยว (ไร่)': r0(u.harvested), 'ผลผลิต (ตัน)': r0(u.production), 'ผลผลิตเฉลี่ย (กก./ไร่)': r0(u.yield),
      'ระบาดใบด่าง (ไร่)': r0(u.cmd), '% ใบด่าง': r4(u.cmdPct), 'ต้านทาน (ไร่)': r0(u.resistant), 'ทนทาน (ไร่)': r0(u.tolerant), 'ทั่วไป (ไร่)': r0(u.general), 'อ่อนแอ (ไร่)': r0(u.susceptible),
      'ทับซ้อนน้ำท่วมซ้ำซาก (ไร่)': r0(u.flood), 'มูลค่าผลผลิตเสี่ยง (บาท)': r0(u.lossValue), 'แหล่งพื้นที่': srcL(u.src.area), 'แหล่งข้อมูลโรค': srcL(u.src.disease)
    })), 'สรุปรายอำเภอ ' + S.year);
    add(DA.cmdMatrix(S.year).map((r) => ({ 'อำเภอ': r.name, 'พื้นที่ปลูก': r0(r.planted), 'ระบาด (ไร่)': r0(r.cmd), '% ระบาด': r4(r.cmdPct), 'ต้านทาน': r0(r.resistant), 'ทนทาน': r0(r.tolerant), 'ทั่วไป': r0(r.general), 'อ่อนแอ': r0(r.susceptible), 'ดัชนีจัดการ': r.cmdIndex, 'ระดับ': r.cmdLevel.label, 'แนวทาง': r.actions.join(' | ') })), 'จัดการโรคใบด่าง');
    add(DA.riskMatrix(S.year).map((r) => ({ 'อำเภอ': r.name, 'คะแนนเสี่ยง': r.score, 'ระดับ': r.level.label, '% ใบด่าง': r4(r.cmdPct), '% ต้านทาน+ทนทาน': r4(r.resistPct), '% ทับซ้อนน้ำท่วม': r4(r.floodPct), 'ศจช. ใกล้สุด': r.nearestPest ? r.nearestPest.row.name : '', 'ระยะ (กม.)': r.nearestPest ? +r.nearestPest.km.toFixed(1) : null, 'ข้อเสนอแนะ': r.actions.join(' | ') })), 'ตารางความเสี่ยงรวม');
    add(DA.rootRotMatrix().map((r) => ({ 'อำเภอ': DA.D.dByCode[r.code.slice(0, 4)].name, 'ตำบล': r.name, 'รหัสตำบล': r.code, 'พื้นที่ปลูก 2569': r0(r.regPlanted), 'ดัชนีรากเน่าโคนเน่า': r.rrIndex, 'ระดับ': r.rrLevel.label, 'คะแนนน้ำท่วม': r.rrParts ? +r.rrParts.flood.toFixed(1) : null, 'คะแนนดิน': r.rrParts ? +r.rrParts.soil.toFixed(1) : null, 'คะแนนฤดูฝน': r.rrParts ? +r.rrParts.rain.toFixed(1) : null, 'ปีที่ท่วม': r.flood ? r.flood.yearList.join(', ') : '', '% ดิน S3+N': r4(r.soilPoorPct), 'แนวทาง': r.actions.join(' | ') })), 'รากเน่าโคนเน่ารายตำบล');
    const tRows = [];
    DA.D.districts.forEach((d) => DA.byTambon(2569, d.code).forEach((u) => tRows.push({ 'อำเภอ': d.name, 'ตำบล': u.name, 'รหัสตำบล': u.code, 'แปลง': u.parcels, 'พื้นที่ปลูก (ไร่)': r0(u.planted), 'ต้านทาน': r0(u.resistant), 'ทนทาน': r0(u.tolerant), 'ทั่วไป': r0(u.general), 'อ่อนแอ': r0(u.susceptible), 'ดิน S1': r0(u.soil_S1), 'ดิน S2': r0(u.soil_S2), 'ดิน S3': r0(u.soil_S3), 'ดิน N': r0(u.soil_N), 'ระบาดใบด่าง*': r0(u.cmd), 'ทับซ้อนน้ำท่วม': r0(u.flood) })));
    add(tRows, 'รายตำบล 2569');
    if (window.KPP_LDD) add(window.KPP_LDD.table7.rows.map((r) => ({ 'อำเภอ': r.district, 'ศักยภาพ S1': r.potential.S1, 'ศักยภาพ S2': r.potential.S2, 'ศักยภาพ S3': r.potential.S3, 'ศักยภาพ N': r.potential.N, 'ปลูก S1': r.planted.S1, 'ปลูก S2': r.planted.S2, 'ปลูก S3': r.planted.S3, 'ปลูก N': r.planted.N, 'คงเหลือ S1': r.remaining.S1, 'คงเหลือ S2': r.remaining.S2 })), 'LDD ความเหมาะสมดิน');
    add(DA.trend({}).map((x) => ({ 'ปี': x.year, 'พื้นที่ปลูก': r0(x.planted), 'ผลผลิต (ตัน)': r0(x.production), 'ผลผลิตเฉลี่ย': r0(x.yield), '% ระบาดใบด่าง*': r4(x.cmdPct), 'แหล่งข้อมูล': srcL(x.src.area) })), 'แนวโน้ม 5 ปี');
    add([['กลุ่มพันธุ์', 'พันธุ์'], ...C.VARIETY_CLASSES.map((v) => [v.label, DA.allVarieties().filter((n) => DA.varietyClass(n) === v.key).join(', ')])], 'กลุ่มพันธุ์');
    add([['แหล่งข้อมูล', 'คำอธิบาย'], ...Object.values(C.SOURCES).map((s) => [s.label, s.note]), ['สูตร', 'ผลผลิตเฉลี่ย (กก./ไร่) = ผลผลิตรวม (ตัน) ÷ เนื้อที่เก็บเกี่ยว (ไร่) × 1,000'], ['ผู้พัฒนา', C.DEVELOPER + ' ' + C.DEVELOPER_TITLE + ' ' + C.DEVELOPER_UNIT]], 'แหล่งข้อมูล');
    XLSX.writeFile(wb, `สรุปมันสำปะหลังกำแพงเพชร_${S.year}_${stamp()}.xlsx`);
  }

  function geojson() {
    const S = KPP.App.state;
    const by = {}; DA.riskMatrix(S.year).forEach((r) => { by[r.code] = r; });
    const cm = {}; DA.cmdMatrix(S.year).forEach((r) => { cm[r.code] = r; });
    const fc = { type: 'FeatureCollection', name: 'kpp_cassava_districts_' + S.year, features: DA.D.districts.map((d) => {
      const r = by[d.code], c = cm[d.code];
      return { type: 'Feature', geometry: d.feature.geometry, properties: { code: d.code, name: d.name, year: S.year, planted_rai: r0(r.planted), production_ton: r0(r.production), yield_kg_rai: r0(r.yield), cmd_rai: r0(r.cmd), resistant_rai: r0(r.resistant), tolerant_rai: r0(r.tolerant), susceptible_rai: r0(r.susceptible), cmd_index: c.cmdIndex, cmd_level: c.cmdLevel.label, rootrot_index: r.rrIndex, flood_overlap_rai: r0(r.flood), risk_score: r.score, risk_level: r.level.label } };
    }) };
    U.download(`kpp_cassava_districts_${S.year}.geojson`, JSON.stringify(fc), 'application/geo+json');
  }

  return { png, pdf, xlsx, geojson, atlas };
})();
