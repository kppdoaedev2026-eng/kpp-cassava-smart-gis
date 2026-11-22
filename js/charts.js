KPP.Charts = (function () {
  const U = KPP.U, C = KPP.CONFIG, DA = KPP.Data;
  const charts = {};
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const dark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  // ชุดสีที่ผ่านการตรวจ (validate_palette.js): น้ำเงิน=พื้นที่ปลูก เขียว=ต้านทาน เขียวลายเฉียง=ทนทาน แดง=ระบาด
  const PAL = () => (dark() ? { planted: '#3987e5', green: '#0ca30c', red: '#e66767', s1: '#3987e5', s2: '#d95926', s3: '#199e70' }
    : { planted: '#2a78d6', green: '#008300', red: '#e34948', s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a' });

  function hatch(color) {
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const g = c.getContext('2d');
    g.fillStyle = dark() ? 'rgba(12,163,12,.18)' : 'rgba(0,131,0,.14)'; g.fillRect(0, 0, 8, 8);
    g.strokeStyle = color; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(0, 8); g.lineTo(8, 0); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(6, 10); g.lineTo(10, 6); g.stroke();
    return g.createPattern(c, 'repeat');
  }
  const hatchSw = (color) => `<i class="sw" style="background:repeating-linear-gradient(45deg, ${color} 0 2px, transparent 2px 4px);border:1px solid ${color}"></i>`;

  function baseOpts() {
    const text = css('--text-2'), grid = css('--border');
    Chart.defaults.font.family = 'Prompt, Sarabun, sans-serif';
    Chart.defaults.color = text;
    return {
      responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      interaction: { mode: 'nearest', intersect: true },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: css('--surface'), titleColor: css('--text'), bodyColor: css('--text-2'), borderColor: css('--border-strong'), borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true }
      },
      scales: {
        x: { grid: { color: grid, drawTicks: false }, border: { display: false }, ticks: { color: text, font: { size: 11 } } },
        y: { grid: { color: grid, drawTicks: false }, border: { display: false }, ticks: { color: text, font: { size: 11 } } }
      }
    };
  }
  function make(id, cfg) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    const el = document.getElementById(id);
    if (!el) return null;
    charts[id] = new Chart(el, cfg);
    return charts[id];
  }
  function destroyAll() { Object.keys(charts).forEach((k) => { charts[k].destroy(); delete charts[k]; }); }
  const legendHtml = (items) => items.map(([c, l]) => `<span>${c.startsWith('<') ? c : `<i class="sw" style="background:${c}"></i>`}${l}</span>`).join('');
  const setHtml = (id, h) => { const e = document.getElementById(id); if (e) e.innerHTML = h; };
  const hBar = (o) => { o.indexAxis = 'y'; o.interaction = { mode: 'index', intersect: false, axis: 'y' }; o.scales.x.ticks.callback = (v) => U.fmtCompact(v); o.scales.x.ticks.maxRotation = 0; o.scales.x.ticks.maxTicksLimit = 6; o.scales.y.grid.display = false; return o; };
  const clickUnit = (S, list) => (e, els) => {
    if (!els.length) return;
    const u = list[els[0].index];
    if (u.code.length === 6) KPP.App.selectTambon(u.code); else KPP.App.selectDistrict(u.code);
  };
  const pointer = (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; };
  const unitsFor = (S, top = 16) => (S.district ? DA.byTambon(S.year, S.district) : DA.byDistrict(S.year))
    .filter((u) => U.isNum(u.planted) && u.planted > 0).sort((a, b) => b.planted - a.planted).slice(0, top);

  /* ================= Overview ================= */
  function overview(S) {
    const units = unitsFor(S, 11);
    const P = PAL();
    setHtml('cmpLegend', legendHtml([[P.planted, 'พื้นที่ปลูก (ทะเบียน)'], [P.green, 'ต้านทาน+ทนทาน'], [P.red, 'ระบาดใบด่าง (รายงาน)']]));
    const o = hBar(baseOpts());
    o.plugins.tooltip.callbacks = { label: (ctx) => ` ${ctx.dataset.label}: ${U.fmt(ctx.raw)} ไร่`, afterBody: (it) => { const u = units[it[0].dataIndex]; return [`ระบาด ${U.pct(u.cmdPct)} · ต้านทาน+ทนทาน ${U.pct(u.resistPct)}`, 'คลิกเพื่อเจาะลึก']; } };
    o.onClick = clickUnit(S, units); o.onHover = pointer;
    const ds = (label, data, color) => ({ label, data, backgroundColor: color, borderRadius: 4, borderSkipped: 'start', barPercentage: 0.86, categoryPercentage: 0.8, borderColor: css('--surface'), borderWidth: { top: 1, bottom: 1 }, minBarLength: 2 });
    make('chCompare', { type: 'bar', data: { labels: units.map((u) => u.name), datasets: [ds('พื้นที่ปลูก', units.map((u) => u.planted), P.planted), ds('ต้านทาน+ทนทาน', units.map((u) => u.resist), P.green), ds('ระบาดใบด่าง', units.map((u) => u.cmd), P.red)] }, options: o });
    cmdAge(S, 'chDonut'); varietyClasses(S, 'chVariety', 'varLegend'); trend(S);
  }

  const AGES = [['lt3', '< 3 เดือน'], ['m3_5', '3–5 เดือน'], ['m6_8', '6–8 เดือน'], ['gt8', '> 8 เดือน']];
  const AGECOL = ['#fdd49e', '#fc8d59', '#d7301f', '#7f0000'];
  /** พื้นที่ระบาดใบด่างตามอายุพืช (รายงานจริง) ของจังหวัด/อำเภอที่เลือก */
  function cmdAge(S, id) {
    const rep = DA.D.rep.cmd;
    if (!rep) return;
    const r = S.district ? rep.districts[S.district] : rep.province;
    if (!r) return;
    setHtml('ageSub', (S.district ? 'อ.' + DA.D.dByCode[S.district].name : 'ทั้งจังหวัด') + ' · ' + rep.period.replace(/วัน\S+ที่ /g, ''));
    setHtml('ageLegend', legendHtml([[AGECOL[2], 'พื้นที่ระบาด'], ['#cbd5e1', 'พื้นที่ยืนต้นไม่พบการระบาด']]));
    const o = hBar(baseOpts());
    o.scales.x.stacked = true; o.scales.y.stacked = true;
    o.plugins.tooltip.callbacks = {
      label: (ctx) => ` ${ctx.dataset.label}: ${U.fmt(ctx.raw)} ไร่`,
      afterBody: (it) => { const k = AGES[it[0].dataIndex][0]; return [`ระบาด ${U.pct(U.safeDiv(r.now[k].rai, r.standing[k].rai))} ของพื้นที่ยืนต้นช่วงอายุนี้`, `เกษตรกรได้รับผลกระทบ ${U.fmt(r.now[k].farmers)} ราย`]; }
    };
    make(id, { type: 'bar', data: { labels: AGES.map((x) => x[1]), datasets: [
      { label: 'พื้นที่ระบาด', data: AGES.map((x) => r.now[x[0]].rai), backgroundColor: AGECOL[2], borderColor: css('--surface'), borderWidth: { right: 2 }, barPercentage: 0.72 },
      { label: 'ยืนต้นไม่พบการระบาด', data: AGES.map((x) => Math.max(0, r.standing[x[0]].rai - r.now[x[0]].rai)), backgroundColor: dark() ? '#334766' : '#cbd5e1', barPercentage: 0.72 }
    ] }, options: o });
  }

  /** พื้นที่ระบาดรายอำเภอ แยกช่วงอายุพืช (รายงานจริง) */
  function cmdAgeStack(S) {
    const rep = DA.D.rep.cmd;
    if (!rep) return;
    const rows = Object.entries(rep.districts).map(([c, r]) => ({ code: c, name: DA.D.dByCode[c].name, r })).filter((x) => x.r.standing.total.rai > 0)
      .sort((a, b) => b.r.now.total.rai - a.r.now.total.rai);
    setHtml('ageStackLegend', legendHtml(AGES.map((x, i) => [AGECOL[i], 'อายุ ' + x[1]])));
    const o = hBar(baseOpts());
    o.scales.x.stacked = true; o.scales.y.stacked = true;
    o.plugins.tooltip.callbacks = { label: (ctx) => ` ${ctx.dataset.label}: ${U.fmt(ctx.raw)} ไร่`, footer: (it) => { const x = rows[it[0].dataIndex].r; return `รวม ${U.fmt(x.now.total.rai)} ไร่ (${U.pct(U.safeDiv(x.now.total.rai, x.standing.total.rai))} ของพื้นที่ยืนต้น) · ${U.fmt(x.now.total.farmers)} ราย`; } };
    o.onClick = (e, els) => { if (els.length) KPP.App.selectDistrict(rows[els[0].index].code); }; o.onHover = pointer;
    make('chAgeStack', { type: 'bar', data: { labels: rows.map((x) => (S.district === x.code ? '▶ ' : '') + x.name), datasets: AGES.map((a, i) => ({ label: 'อายุ ' + a[1], data: rows.map((x) => x.r.now[a[0]].rai), backgroundColor: AGECOL[i], borderColor: css('--surface'), borderWidth: { right: 2 }, barPercentage: 0.78 })) }, options: o });
  }

  /** สัดส่วน 4 กลุ่มพันธุ์ของพื้นที่ที่เลือก (แท่งพันธุ์ เรียงตามพื้นที่ สีตามกลุ่ม) */
  function varietyClasses(S, id, legendId) {
    const all = DA.varietyBreakdown({ district: S.district, tambon: S.tambon });
    const top = all.slice(0, 9);
    const rest = all.slice(9);
    if (rest.length) top.push({ name: `อื่นๆ (${rest.length} พันธุ์)`, rai: rest.reduce((s, x) => s + x.rai, 0), cls: 'modsus' });
    const total = all.reduce((s, x) => s + x.rai, 0);
    const col = Object.fromEntries(C.VARIETY_CLASSES.map((v) => [v.key, v.color]));
    setHtml(legendId, legendHtml(C.VARIETY_CLASSES.map((v) => [v.color, v.label])));
    const o = hBar(baseOpts());
    o.scales.y.ticks.font = { size: 10 };
    o.plugins.tooltip.callbacks = { label: (ctx) => ` ${U.fmt(ctx.raw)} ไร่ (${U.pct(U.safeDiv(ctx.raw, total))}) · ${C.VARIETY_CLASSES.find((v) => v.key === top[ctx.dataIndex].cls).label}` };
    make(id, { type: 'bar', data: { labels: top.map((x) => x.name.replace(/^พันธุ์\s*|^มันสำปะหลัง/g, '')), datasets: [{ data: top.map((x) => x.rai), backgroundColor: top.map((x) => col[x.cls]), borderRadius: 4, borderSkipped: 'start', barPercentage: 0.82, minBarLength: 2 }] }, options: o });
  }

  function trend(S) {
    const f = { district: S.district, tambon: S.tambon };
    const t = DA.trend(f);
    const scope = S.tambon ? 'ต.' + DA.D.tambons[S.tambon].name : S.district ? 'อ.' + DA.D.dByCode[S.district].name : 'ทั้งจังหวัด';
    setHtml('trendSub', scope + ' · เส้นประ = ประมาณการ');
    const labels = t.map((x) => String(x.year));
    const isEst = (x) => x.src.prod === 'ESTIMATE' || x.src.prod === 'PROJECTED';
    const line = (data, color, label) => ({ label, data, borderColor: color, backgroundColor: color, borderWidth: 2, tension: 0.25, pointRadius: 4, pointHoverRadius: 6,
      pointBackgroundColor: t.map((x) => (isEst(x) ? css('--surface') : color)), pointBorderColor: color, pointBorderWidth: 2, spanGaps: true,
      segment: { borderDash: (ctx) => (isEst(t[ctx.p1DataIndex]) ? [5, 4] : undefined) } });
    const o1 = baseOpts(); o1.interaction = { mode: 'index', intersect: false };
    o1.plugins.tooltip.callbacks = { label: (ctx) => ` ${U.fmt(ctx.raw)} กก./ไร่`, afterLabel: (ctx) => { const x = t[ctx.dataIndex]; return `แหล่ง: ${(C.SOURCES[x.src.prod] || {}).label || '–'}`; } };
    o1.scales.y.ticks.callback = (v) => U.fmt(v); o1.scales.x.grid.display = false;
    make('chTrendYield', { type: 'line', data: { labels, datasets: [line(t.map((x) => x.yield), css('--brand'), 'ผลผลิตเฉลี่ย')] }, options: o1 });
    const o2 = baseOpts(); o2.interaction = { mode: 'index', intersect: false };
    o2.plugins.tooltip.callbacks = { label: (ctx) => ` ${U.fmt(ctx.raw)} ไร่`, afterLabel: (ctx) => `แหล่ง: ${(C.SOURCES[t[ctx.dataIndex].src.area] || {}).label || '–'}` };
    o2.scales.y.ticks.callback = (v) => U.fmtCompact(v); o2.scales.y.beginAtZero = true; o2.scales.x.grid.display = false;
    const isReg = (x) => x.src.area === 'ESTIMATE' || x.src.area === 'REGISTRY' || x.src.area === 'PARCEL';
    const l2 = line(t.map((x) => x.planted), PAL().planted, 'พื้นที่ปลูก');
    l2.pointBackgroundColor = t.map((x) => (isReg(x) ? css('--surface') : PAL().planted));
    l2.segment = { borderDash: (ctx) => (isReg(t[ctx.p1DataIndex]) ? [5, 4] : undefined) };
    make('chTrendCmd', { type: 'line', data: { labels, datasets: [l2] }, options: o2 });
  }

  /* ================= CMD management ================= */
  function cmdCompare(S, mode) {
    const units = unitsFor(S, S.district ? 16 : 11);
    const P = PAL();
    const pct = mode === 'pct';
    setHtml('cmdLegend', legendHtml([...(pct ? [] : [[P.planted, 'พื้นที่ยืนต้น']]), [P.green, 'พันธุ์ต้านทาน'], [hatchSw(P.green), 'พันธุ์ทนทาน'], [P.red, 'พื้นที่ระบาดใบด่าง']]));
    units.forEach((u) => { u.base = u.standing || u.planted; });
    const val = (u, k) => (pct ? (U.isNum(u[k]) && u.base ? (u[k] / (k === 'cmd' ? u.base : u.planted)) * 100 : null) : u[k]);
    const ds = (label, key, color, border) => ({ label, data: units.map((u) => val(u, key)), backgroundColor: color, borderColor: border || css('--surface'), borderWidth: border ? 1.2 : { top: 1, bottom: 1 }, borderRadius: 4, borderSkipped: 'start', barPercentage: 0.9, categoryPercentage: 0.82, minBarLength: 2 });
    const sets = [];
    if (!pct) sets.push(ds('พื้นที่ยืนต้น', 'base', P.planted));
    sets.push(ds('พันธุ์ต้านทาน', 'resistant', P.green), ds('พันธุ์ทนทาน', 'tolerant', hatch(P.green), P.green), ds('พื้นที่ระบาดใบด่าง', 'cmd', P.red));
    const o = hBar(baseOpts());
    if (pct) o.scales.x.ticks.callback = (v) => U.fmt(v, 0) + '%';
    o.plugins.tooltip.callbacks = {
      label: (ctx) => ` ${ctx.dataset.label}: ${pct ? U.fmt(ctx.raw, 2) + '%' : U.fmt(ctx.raw) + ' ไร่'}`,
      afterBody: (it) => { const u = units[it[0].dataIndex]; return [`ดัชนีการจัดการ ${u.cmdIndex ?? '–'} (${u.cmdLevel.label})`, 'คลิกเพื่อเจาะลึก']; }
    };
    o.onClick = clickUnit(S, units); o.onHover = pointer;
    make('chCmdCompare', { type: 'bar', data: { labels: units.map((u) => u.name), datasets: sets }, options: o });
  }

  function cmdVarietyStack(S) {
    const units = unitsFor(S, S.district ? 16 : 11);
    setHtml('cmdVarLegend', legendHtml(C.VARIETY_CLASSES.map((v) => [v.color, v.label])));
    const o = hBar(baseOpts());
    o.scales.x.stacked = true; o.scales.y.stacked = true; o.scales.x.max = 100;
    o.scales.x.ticks.callback = (v) => v + '%';
    o.plugins.tooltip.callbacks = { label: (ctx) => ` ${ctx.dataset.label}: ${U.fmt(ctx.raw, 1)}% (${U.fmt(units[ctx.dataIndex][C.VARIETY_CLASSES[ctx.datasetIndex].key])} ไร่)` };
    o.onClick = clickUnit(S, units); o.onHover = pointer;
    const reg = (u) => (u.resistant || 0) + (u.tolerant || 0) + (u.modsus || 0) + (u.susceptible || 0);
    make('chCmdVar', { type: 'bar', data: { labels: units.map((u) => u.name), datasets: C.VARIETY_CLASSES.map((v) => ({ label: v.label, data: units.map((u) => (reg(u) ? (100 * (u[v.key] || 0)) / reg(u) : 0)), backgroundColor: v.color, borderColor: css('--surface'), borderWidth: { right: 2 }, barPercentage: 0.8 })) }, options: o });
  }

  /* ================= Root rot ================= */
  function rrFactors(S, list) {
    const top = list.slice(0, 15);
    const P = PAL();
    setHtml('rrLegend', legendHtml([[P.s1, 'ประวัติน้ำท่วมซ้ำซาก'], [P.s2, 'ข้อจำกัดดิน (LDD S3/N)'], [P.s3, 'ปลูกช่วงฤดูฝน']]));
    const o = hBar(baseOpts());
    o.scales.x.stacked = true; o.scales.y.stacked = true; o.scales.x.max = 100;
    o.scales.x.ticks.callback = (v) => v;
    o.scales.y.ticks.font = { size: 10 };
    o.plugins.tooltip.callbacks = { label: (ctx) => ` ${ctx.dataset.label}: ${U.fmt(ctx.raw, 1)} คะแนน`, footer: (it) => { const u = top[it[0].dataIndex]; return `รวม ${u.rrIndex}/100 · ระดับ${u.rrLevel.label}`; } };
    o.onClick = clickUnit(S, top); o.onHover = pointer;
    const lab = (u) => `${u.name} (${DA.D.dByCode[u.code.slice(0, 4)].name.replace('กำแพงเพชร', '')})`;
    const ds = (label, key, color) => ({ label, data: top.map((u) => (u.rrParts ? u.rrParts[key] : 0)), backgroundColor: color, borderColor: css('--surface'), borderWidth: { right: 2 }, barPercentage: 0.8 });
    make('chRR', { type: 'bar', data: { labels: top.map(lab), datasets: [ds('น้ำท่วมซ้ำซาก', 'flood', P.s1), ds('ดิน S3/N', 'soil', P.s2), ds('ปลูกฤดูฝน', 'rain', P.s3)] }, options: o });
  }

  /* ================= Soil (LDD) ================= */
  function soilCharts(S) {
    const rows = (window.KPP_LDD ? window.KPP_LDD.table7.rows : []).filter((r) => !S.district || r.district_code === S.district)
      .slice().sort((a, b) => (b.planted.S1 + b.planted.S2 + b.planted.S3 + b.planted.N) - (a.planted.S1 + a.planted.S2 + a.planted.S3 + a.planted.N));
    const cls = C.SOIL_CLASSES;
    setHtml('soilLegend', legendHtml(cls.map((c) => [c.color, c.label])));
    const mk = (id, field) => {
      const o = hBar(baseOpts());
      o.scales.x.stacked = true; o.scales.y.stacked = true;
      o.plugins.tooltip.callbacks = { label: (ctx) => ` ${ctx.dataset.label}: ${U.fmt(ctx.raw)} ไร่` };
      o.onClick = (e, els) => { if (els.length) KPP.App.selectDistrict(rows[els[0].index].district_code); }; o.onHover = pointer;
      make(id, { type: 'bar', data: { labels: rows.map((r) => r.district), datasets: cls.map((c) => ({ label: c.label, data: rows.map((r) => r[field][c.key] || 0), backgroundColor: c.color, borderColor: css('--surface'), borderWidth: { right: 2 }, barPercentage: 0.82 })) }, options: o });
    };
    mk('chSoilPlanted', 'planted');
    mk('chSoilPotential', 'potential');
  }

  const images = () => Object.fromEntries(Object.entries(charts).map(([k, c]) => [k, c.toBase64Image('image/png', 1)]));

  return { overview, cmdAge, cmdAgeStack, cmdCompare, cmdVarietyStack, rrFactors, soilCharts, varietyClasses, destroyAll, images, charts, legendHtml, hatchSw, PAL };
})();
