KPP.App = (function () {
  const U = KPP.U, C = KPP.CONFIG, DA = KPP.Data, M = KPP.Map, CH = KPP.Charts;
  const state = { year: C.DEFAULT_YEAR, district: null, tambon: null, disease: 'all', risk: 'all', module: 'overview', tab: {}, cmdMode: 'pct' };
  const $ = (id) => document.getElementById(id);
  const srcBadge = (k) => { const s = C.SOURCES[k]; return s ? `<span class="badge ${s.cls}" title="${U.esc(s.note)}">${s.label}</span>` : ''; };
  const status = (lv) => (lv ? `<span class="status ${lv.key}"><i>${lv.icon}</i>${lv.label}</span>` : '–');
  const f = () => ({ district: state.district, tambon: state.tambon });
  const unitWord = () => (state.district ? 'ตำบล' : 'อำเภอ');

  function init() {
    const theme = U.store('kpp.theme') || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    measureHeader();
    DA.init();
    M.init();
    if (theme === 'dark') M.setBase('dark');
    KPP.Importer.init();
    buildFilters();
    bindUI();
    const saved = U.store('kpp.module');
    setModule(MODULES[saved] ? saved : 'overview', true);
    const P = DA.D.P;
    $('asof').textContent = `ทะเบียนแปลง ณ ${P.asof || ''} · ${U.fmt(P.parcels)} แปลง${P.aggregated ? ' (แสดงแบบรวมกริด 1 กม.)' : ''}`;
    $('footSources').innerHTML = ['REGISTRY', 'REPORT', 'OFFICIAL', 'PARCEL', 'LDD', 'FLOOD', 'NETWORK'].map(srcBadge).join('');
    $('devName').textContent = C.DEVELOPER; $('devUnit').textContent = C.DEVELOPER_TITLE + ' · ' + C.DEVELOPER_UNIT; $('appVer').textContent = C.VERSION;
    $('layerPanel').classList.add('collapsed');
    update(true);
    loadPlotMonitor();
    KPP.Admin.init();
    // แผนที่เต็มจอ: ถ้ากรอบแผนที่ยังไม่มีขนาดตอนเริ่ม (เช่น หน้าต่างอยู่เบื้องหลัง) ให้ปรับขนาดและจัดมุมมองใหม่เมื่อได้ขนาดจริง
    if (window.ResizeObserver) {
      let w0 = M.map.getSize().x, h0 = M.map.getSize().y;
      new ResizeObserver(() => {
        const el = document.getElementById('map'), w = el.clientWidth, h = el.clientHeight;
        if (w === w0 && h === h0) return;
        const wasEmpty = !w0 || !h0; w0 = w; h0 = h;
        M.map.invalidateSize();
        if (wasEmpty && w && h) M.fitScope();
      }).observe(document.getElementById('map'));
    }
  }

  /* ---------- filters ---------- */
  function buildFilters() {
    $('fYear').innerHTML = C.YEARS.slice().reverse().map((y) => `<option value="${y}">${y}${y === 2569 ? ' (ทะเบียนเกษตรกร)' : ' (สถิติทางการ)'}</option>`).join('');
    $('fDistrict').innerHTML = '<option value="">ทุกอำเภอ (11)</option>' + DA.D.districts.map((d) => `<option value="${d.code}">${d.name}</option>`).join('');
  }
  function syncFilters() {
    $('fYear').value = state.year;
    $('fYear').disabled = state.module === 'rootrot' || state.module === 'soil';
    $('fDistrict').value = state.district || '';
    const tl = state.district ? DA.D.tambonsByDistrict[state.district] || [] : [];
    $('fTambon').innerHTML = '<option value="">ทุกตำบล</option>' + tl.map((t) => `<option value="${t.code}">${t.name}</option>`).join('');
    $('fTambon').disabled = !state.district;
    $('fTambon').value = state.tambon || '';
    $('fRisk').value = state.risk;
    $('presYear').textContent = 'ปีเพาะปลูก ' + state.year;
    document.querySelectorAll('.mod').forEach((b) => b.classList.toggle('active', b.dataset.mod === state.module));
  }

  function selectDistrict(code) {
    if (state.district === code && !state.tambon) code = null;
    state.district = code || null; state.tambon = null;
    update(); M.fitScope();
  }
  function selectTambon(code) {
    if (state.tambon === code) { state.tambon = null; update(); M.fitScope(); return; }
    state.tambon = code; state.district = code.slice(0, 4);
    update(); M.fitScope();
  }
  function setYear(y) { state.year = +y; update(); }
  function setDisease(k) { state.disease = state.disease === k ? 'all' : k; update(); }
  function setModule(m, silent) {
    state.module = m;
    if (m === 'rootrot' || m === 'soil') state.year = 2569;
    if (m === 'prod' && state.year === 2569) state.year = lastOfficialYear();   // สถิติผลผลิตทางการมีถึงปีล่าสุดที่มีข้อมูล
    U.store('kpp.module', m);
    M.setModule(m);
    renderLayerPanel();
    if (!silent) { update(); setTimeout(() => M.fitScope(), 30); }
  }

  let pending = 0;
  function update(first) {
    clearTimeout(pending);
    pending = setTimeout(() => {
      syncFilters();
      renderKPIs();
      M.render(state);
      if (KPP.Admin && KPP.Admin.refresh) KPP.Admin.refresh();
      renderSide();
      renderCrumb();
      if (first) M.fitScope();
    }, 0);
  }

  /* ---------- KPI ---------- */
  const card = (accent, label, value, unit, sub, src) => `<article class="kpi" style="--accent:${accent}">
    <div class="kpi-top"><span class="kpi-label">${label}</span>${src ? srcBadge(src) : ''}</div>
    <div class="kpi-value">${value}<span class="kpi-unit">${unit || ''}</span></div>
    <div class="kpi-sub">${sub || ''}</div></article>`;
  const bar = (pct, color) => `<div class="bar" style="flex-basis:100%"><i style="width:${Math.min(100, (pct || 0) * 100).toFixed(1)}%;background:${color}"></i></div>`;

  function renderKPIs() {
    const a = DA.agg(state.year, f());
    let h = '';
    if (state.module === 'overview') {
      const yo = DA.yoy(state.year, f());
      let delta;
      if (U.isNum(yo.value) && yo.comparable) delta = `<span class="delta ${yo.value >= 0 ? 'up' : 'down'}">${yo.value >= 0 ? '▲ +' : '▼ '}${U.pct(yo.value)}</span> เทียบปี ${state.year - 1}`;
      else if (U.isNum(yo.value)) delta = `<span class="delta na" title="ปี ${state.year} เป็นข้อมูลทะเบียนแปลงที่ยังขึ้นทะเบียนไม่ครบ จึงไม่เปรียบเทียบกับสถิติทางการ">YoY: ต่างแหล่งข้อมูล – ไม่เปรียบเทียบ</span>`;
      else delta = '<span class="delta na">YoY: ไม่มีข้อมูลปีก่อน</span>';
      const reg2569 = state.year === 2569 && a.hh;
      h = card('var(--brand)', reg2569 ? 'พื้นที่ปลูกขึ้นทะเบียน' : 'พื้นที่เพาะปลูก', U.fmt(a.planted), 'ไร่', reg2569 ? `${U.fmt(a.hh)} ครัวเรือน · ${U.fmt(a.regParcels)} แปลง${a.dmgRai ? ' · เสียหาย ' + U.fmt(a.dmgRai) + ' ไร่' : ''}` : delta, a.src.area)
        + (U.isNum(a.production) ? card('var(--gold)', 'ผลผลิต', U.fmt(a.production), 'ตัน', `ผลผลิตเฉลี่ย <b>${U.fmt(a.yield)}</b> กก./ไร่`, a.src.prod)
          : (() => { const o = DA.agg(lastOfficialYear(), f()); return card('var(--gold)', `ผลผลิตล่าสุด (ปี ${lastOfficialYear()})`, U.fmt(o.production), 'ตัน', `ผลผลิตเฉลี่ย <b>${U.fmt(o.yield)}</b> กก./ไร่ · ปี 2569 รอสถิติทางการ`, 'OFFICIAL'); })())
        + card('var(--critical)', 'พื้นที่ระบาดโรคใบด่าง', U.fmt(a.cmd), 'ไร่', U.isNum(a.cmd) ? `${U.pct(a.cmdPct)} ของพื้นที่ปลูก ${status(a.cmdSeverity)}${a.cmdFarmers ? ' · ' + U.fmt(a.cmdFarmers) + ' ราย' : ''}${cmdDelta()}` : (state.year === 2569 ? 'ยังไม่มีผลสำรวจรายตำบล' : 'มีรายงานเฉพาะปี 2569'), a.src.disease)
        + (reg2569 && U.isNum(a.coverage) ? card('#2a78d6', 'ความครอบคลุมทะเบียน', U.pct(a.coverage, 0), '', `ทะเบียน ${U.fmt(a.planted)} / ปลูก ${U.fmt(a.standing)} ไร่ · ยังไม่ขึ้นทะเบียน ${U.fmt(a.regGap)} ไร่${bar(Math.min(1, a.coverage), '#2a78d6')}`, 'REGISTRY') : '')
        + card('#1a7f37', 'พันธุ์ต้านทาน + ทนทาน', U.fmt(a.resist), 'ไร่', U.isNum(a.resist) ? `<b>${U.pct(a.resistPct)}</b> ของผังแปลง · ต้านทาน ${U.fmt(a.resistant)} · ทนทาน ${U.fmt(a.tolerant)}${bar(a.resistPct / 0.3, '#1a7f37')}` : 'มีข้อมูลรายพันธุ์เฉพาะปี 2569', a.src.resist)
        + (U.isNum(a.flood) ? card('var(--flood)', 'ทับซ้อนน้ำท่วมซ้ำซาก', U.fmt(a.flood), 'ไร่', `${U.pct(a.floodPct)} ของผังแปลง · มูลค่าผลผลิตเสี่ยง ≈ <b>${U.fmtCompact(a.lossValue)}</b> บาท`, a.src.flood) : '');
    } else if (state.module === 'prod') {
      h = prodKPIs();
    } else if (state.module === 'cmd') {
      const rp = DA.D.rep.resist_plots;
      h = card('#2a78d6', 'พื้นที่ปลูก (รายงานโรค)', U.fmt(a.standing ?? a.planted), 'ไร่', `${a.standingFarmers ? U.fmt(a.standingFarmers) + ' ราย · ' : ''}ทะเบียน ${U.fmt(a.planted)} ไร่`, a.src.disease || a.src.area)
        + card('var(--critical)', 'พื้นที่ระบาดใบด่าง', U.fmt(a.cmd), 'ไร่', U.isNum(a.cmd) ? `${U.pct(a.cmdPct)} ของพื้นที่ปลูก ${status(a.cmdSeverity)}${a.cmdFarmers ? ' · ' + U.fmt(a.cmdFarmers) + ' ราย' : ''}` : 'ไม่มีรายงานในปีนี้', a.src.disease)
        + card('#1a7f37', 'พันธุ์ต้านทาน', U.fmt(a.resistant), 'ไร่', `${U.pct(a.resistantPct, 2)} · อิทธิ 1–3 ${bar(a.resistantPct / 0.3, '#1a7f37')}`, a.src.resist)
        + card('#8fd16a', 'พันธุ์ทนทาน', U.fmt(a.tolerant), 'ไร่', `${U.pct(a.tolerantPct)} · ห้วยบง 60, เกษตรศาสตร์ 50, ระยอง 72 ${bar(a.tolerantPct / 0.3, '#5aa832')}`, a.src.resist)
        + (rp ? card('#0f766e', 'แปลงส่งเสริมพันธุ์ต้านทาน', U.fmt(a.projPlots), 'แปลง', `${U.fmt(a.projRai, 1)} ไร่ · ท่อนพันธุ์ ${U.fmtCompact(a.projCuttings)} ท่อน`, 'PROJECT') : '')
        + (() => {
          const g = cmdGoal(state.district);
          return g ? card('#b2182b', `เป้าหมายลดระบาด ${U.pct(C.CMD_GOAL.reduce, 0)}`, '≤ ' + U.fmt(g.target), 'ไร่', `ปลูกพันธุ์ต้านทาน/ทนทานทดแทน <b>${U.fmt(g.replant)}</b> ไร่ · สนับสนุนแล้ว ${U.fmt(g.sup.goalRai)} ไร่ (${U.pct(g.supShare, 1)}) · ลดระบาดได้ ${U.pct(g.progress, 0)}${bar(g.supShare, '#0f766e')}`, 'REPORT') : '';
        })();
    } else if (state.module === 'rootrot') {
      const list = DA.rootRotMatrix(state.district);
      const crit = list.filter((r) => r.rrLevel.key === 'critical' || r.rrLevel.key === 'serious');
      const tricho = window.KPP_NETWORKS.pest.rows.filter(DA.hasTricho);
      h = card('#b2182b', 'ดัชนีเสี่ยงรากเน่าโคนเน่า', U.isNum(a.rrIndex) ? a.rrIndex : '–', '/100', `${status(a.rrLevel)} · เฉลี่ยถ่วงพื้นที่ปลูก`, 'MODEL')
        + card('#f46d43', 'พื้นที่ปลูกเสี่ยงสูง', U.fmt(a.rrHigh), 'ไร่', `${U.pct(a.rrHighPct)} ของพื้นที่ขึ้นทะเบียน (คะแนนแปลง ≥ 55)`, 'MODEL')
        + card('#f2c12e', 'ตำบลเสี่ยงสูง–วิกฤต', U.fmt(crit.length), `/ ${list.length} ตำบล`, crit.slice(0, 3).map((r) => 'ต.' + U.esc(r.name)).join(', ') || '–', 'MODEL')
        + card('var(--flood)', 'ปัจจัยหลัก', a.rrParts ? Object.entries({ น้ำท่วม: a.rrParts.flood, ดิน: a.rrParts.soil, ฤดูฝน: a.rrParts.rain }).sort((x, y) => y[1] - x[1])[0][0] : '–', '', a.rrParts ? `น้ำท่วม ${U.fmt(a.rrParts.flood)} · ดิน ${U.fmt(a.rrParts.soil)} · ฤดูฝน ${U.fmt(a.rrParts.rain)} คะแนน` : '', 'FLOOD')
        + card('#6250d6', 'ศจช. ผลิตไตรโคเดอร์มา', U.fmt(tricho.length), 'ศูนย์', `ปลูกบนดิน S3+N ${U.pct(a.soilPoorPct)} · ปลูกฤดูฝน ${U.pct(a.rainyPct)}`, 'NETWORK');
    } else {
      const t7 = (window.KPP_LDD ? window.KPP_LDD.table7.rows : []).filter((r) => !state.district || r.district_code === state.district);
      const sum = (k, c) => t7.reduce((s, r) => s + (r[k][c] || 0), 0);
      const potS12 = sum('potential', 'S1') + sum('potential', 'S2');
      const plS12 = sum('planted', 'S1') + sum('planted', 'S2'), plS3N = sum('planted', 'S3') + sum('planted', 'N');
      const rem = sum('remaining', 'S1') + sum('remaining', 'S2');
      h = card('#1a9850', 'ที่ดินเหมาะสม S1+S2', U.fmt(potS12), 'ไร่', `S1 ${U.fmt(sum('potential', 'S1'))} · S2 ${U.fmt(sum('potential', 'S2'))}`, 'LDD')
        + card('#a6d96a', 'มันฯ ปลูกบน S1+S2', U.fmt(plS12), 'ไร่', `${U.pct(U.safeDiv(plS12, plS12 + plS3N))} ของพื้นที่ปลูก (LDD)`, 'LDD')
        + card('#fdae61', 'มันฯ ปลูกบน S3+N', U.fmt(plS3N), 'ไร่', 'ควรปรับเปลี่ยน/ปรับปรุงดิน', 'LDD')
        + card('#065F46', 'ศักยภาพคงเหลือ S1+S2', U.fmt(rem), 'ไร่', 'พื้นที่เหมาะสมที่ยังไม่ได้ปลูกมันฯ', 'LDD')
        + card('#d73027', 'ทะเบียน 2569 บนดิน S3+N', U.pct(a.soilPoorPct), '', `S3 ${U.fmt(a.soil_S3)} · N ${U.fmt(a.soil_N)} ไร่ (ซ้อนทับแผนที่ LDD)`, 'PARCEL');
    }
    $('kpis').innerHTML = h;
  }

  function lastOfficialYear() { return Math.max(...Object.keys(DA.D.official).map(Number)); }
  function cmdHist() { return DA.D.rep.cmd_history || []; }
  function cmdDelta() {
    const h = cmdHist(); if (h.length < 2) return '';
    const pick = (x) => (state.district ? (x.districts[state.district] || {}).cmd : x.cmd);
    const d = pick(h[h.length - 1]) - pick(h[h.length - 2]);
    if (!U.isNum(d)) return '';
    return ` · <span class="delta ${d > 0 ? 'down' : 'up'}">${d > 0 ? '▲ +' : d < 0 ? '▼ ' : ''}${U.fmt(d)} ไร่</span> จากรอบก่อน`;
  }

  /* ---------- เป้าหมายลดพื้นที่ระบาดใบด่าง 30% ด้วยพันธุ์ต้านทาน/ทนทาน ----------
     ฐาน = รายงานรอบแรกในระบบ · เป้า = ฐาน × (1 − 30%) · ต้องปลูกทดแทน = พื้นที่ระบาดล่าสุด − เป้า
     สมมติฐาน (ยืนยันโดยเจ้าของ): ปลูกพันธุ์ต้านทาน/ทนทานด้วยท่อนพันธุ์สะอาดทดแทนแปลงระบาด 1 ไร่ ลดพื้นที่ระบาดได้ 1 ไร่
     การสนับสนุนที่นับเข้าเป้า = พันธุ์กลุ่มต้านทาน/ทนทาน ตั้งแต่ปี CMD_GOAL.supportFromYear (ทะเบียนการสนับสนุน + โรงแป้ง) */
  const isResistVar = (v) => { const k = DA.varietyClass(v); return k === 'resistant' || k === 'tolerant'; };
  function supportSum(dcode) {
    const S = DA.D.rep.support, G = C.CMD_GOAL;
    const o = { rai: 0, stalks: 0, farmers: 0, goalRai: 0, goalStalks: 0, n: 0, unassigned: 0 };
    if (!S) return o;
    S.records.forEach((r) => {
      if (dcode && r.d !== dcode) return;
      o.n++; o.rai += r.rai; o.stalks += r.stalks; o.farmers += r.farmers || 0;
      if (!r.d) o.unassigned += r.rai;
      if (isResistVar(r.variety) && (r.year || 0) >= G.supportFromYear) { o.goalRai += r.rai; o.goalStalks += r.stalks; }
    });
    return o;
  }
  function cmdGoal(dcode) {
    const G = C.CMD_GOAL, h = cmdHist();
    const pick = (x) => (x ? (dcode ? (x.districts[dcode] || {}).cmd : x.cmd) : null);
    const cur = dcode ? DA.agg(2569, { district: dcode }) : DA.agg(2569, {});
    const now = U.isNum(cur.cmd) ? cur.cmd : pick(h[h.length - 1]);
    const base = U.isNum(pick(h[0])) ? pick(h[0]) : now;
    if (!U.isNum(base) || !U.isNum(now)) return null;
    const target = base * (1 - G.reduce), reduce = base * G.reduce;
    const achieved = Math.max(0, base - now), replant = Math.max(0, now - target);
    const sup = supportSum(dcode);
    return {
      base, now, target, reduce, achieved, replant, proj: cur.projRai || 0, resist: cur.resist, resistPct: cur.resistPct,
      stalks: replant * G.stalksPerRai, cuttings: replant * G.cuttingsPerRai, nursery: replant / G.multiplyRatio,
      progress: U.safeDiv(achieved, reduce), sup, supShare: U.safeDiv(sup.goalRai, replant),
      baseDate: h[0] ? h[0].end : null, nowDate: h.length ? h[h.length - 1].end : null, rounds: h.length,
      cmdIndex: cur.cmdIndex, cmdLevel: cur.cmdLevel
    };
  }
  const thd = (d) => (d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '–');
  const vchip = (v) => { const c = C.VARIETY_CLASSES.find((x) => x.key === DA.varietyClass(v)); return `${U.esc(v)} <span class="vclass-chip" style="background:${c.color}">${c.label}</span>`; };

  function supportHtml() {
    const S = DA.D.rep.support, G = C.CMD_GOAL;
    if (!S) return '<p class="hint">ยังไม่มีข้อมูลการสนับสนุนท่อนพันธุ์ — วางไฟล์ในโฟลเดอร์ "สนับสนุนพันธุ์มัน" แล้วรัน tools/build_reports.py</p>';
    const recs = S.records.filter((r) => !state.district || r.d === state.district);
    const by = {};
    recs.forEach((r) => {
      const p = by[r.project] || (by[r.project] = { project: r.project, years: new Set(), vars: {}, farmers: 0, rai: 0, stalks: 0, districts: new Set(), noqty: 0, n: 0 });
      p.n++; if (r.noqty) p.noqty++;
      if (r.year) p.years.add(r.year);
      p.vars[r.variety] = (p.vars[r.variety] || 0) + r.rai;
      p.farmers += r.farmers || 0; p.rai += r.rai; p.stalks += r.stalks;
      p.districts.add(r.d ? DA.D.dByCode[r.d].name : 'หลายอำเภอ');
    });
    const rows = Object.values(by).sort((a, b) => b.rai - a.rai);
    const vt = {}; recs.forEach((r) => { vt[r.variety] = (vt[r.variety] || 0) + r.rai; });
    const tot = supportSum(state.district);
    const noq = recs.filter((r) => r.noqty);
    const otherRai = Object.entries(vt).filter(([v]) => !isResistVar(v)).reduce((s, [, x]) => s + x, 0);
    return card2(`การสนับสนุนท่อนพันธุ์มันสำปะหลัง${state.district ? ' · อ.' + U.esc(DA.D.dByCode[state.district].name) : ''}`, srcBadge('SUPPORT'), `
      <div class="goal-grid">
        <div><span>สนับสนุนทั้งหมด (ทุกปี ทุกพันธุ์)</span><b>${U.fmt(tot.rai, 1)}</b> ไร่ <small>${U.fmt(tot.stalks)} ลำ${tot.farmers ? ' · เกษตรกร ' + U.fmt(tot.farmers) + ' ราย' : ''}</small></div>
        <div><span>นับเข้าเป้าหมาย (ต้านทาน/ทนทาน ปี ${G.supportFromYear}+)</span><b>${U.fmt(tot.goalRai, 1)}</b> ไร่ <small>${U.fmt(tot.goalStalks)} ลำ</small></div>
        <div><span>พันธุ์กลุ่มทั่วไป/อ่อนแอที่สนับสนุน</span><b>${U.fmt(otherRai, 1)}</b> ไร่ <small>ไม่นับเข้าเป้าหมาย</small></div>
      </div>
      <p class="hint">พันธุ์: ${Object.entries(vt).sort((a, b) => b[1] - a[1]).map(([v, x]) => `${vchip(v)} ${U.fmt(x, 1)} ไร่`).join(' · ')}</p>
      <div class="table-wrap"><table class="risk"><thead><tr><th>โครงการ/แหล่งสนับสนุน</th><th>ปี</th><th>อำเภอ</th><th>พันธุ์</th><th>เกษตรกร</th><th>ไร่</th><th>ลำ</th></tr></thead><tbody>${
        rows.map((p) => `<tr><td class="l" style="white-space:normal">${U.esc(p.project)}</td><td>${[...p.years].sort().join(', ')}</td><td class="l" style="white-space:normal">${[...p.districts].map(U.esc).join(', ')}</td>
          <td class="l" style="white-space:normal">${Object.keys(p.vars).map(vchip).join(' ')}</td><td>${p.farmers ? U.fmt(p.farmers) : '–'}</td>${p.noqty === p.n ? '<td colspan="2" class="l"><span class="hint-i">ยังไม่ระบุจำนวน</span></td>' : `<td>${U.fmt(p.rai, 1)}</td><td>${U.fmt(p.stalks)}</td>`}</tr>`).join('')
      }</tbody></table></div>
      <p class="note">ที่มา: ${U.esc(S.source)} · พื้นที่ที่ไม่ระบุคำนวณ ${U.fmt(S.stalks_per_rai)} ลำ/ไร่ · ไม่แสดงชื่อ/เบอร์โทรเกษตรกร${tot.unassigned ? ` · ${U.fmt(tot.unassigned, 1)} ไร่ไม่ระบุอำเภอ (นับเฉพาะระดับจังหวัด)` : ''} ${noq.length ? ` · <b>${U.fmt(noq.reduce((s, r) => s + (r.farmers || 0), 0))} ราย ยังไม่ระบุจำนวนต้นพันธุ์/พื้นที่ จึงยังไม่นับเข้าเป้า</b>` : ''} · เพิ่มรายการใหม่ได้ที่ไฟล์ ทะเบียนการสนับสนุนพันธุ์.csv</p>`);
  }

  function plotMonitorHtml() {
    const pm = DA.D.rep.plot_monitor;
    const link = `<a href="${U.esc(C.PLOT_MONITOR_URL)}" target="_blank" rel="noopener">เปิดระบบ CassavaPlot Monitor ↗</a>`;
    if (!pm) {
      return card2('ระบบติดตามแปลงส่งเสริม CassavaPlot Monitor', srcBadge('PLOTMON'), `<p class="hint">ยังเชื่อมต่อข้อมูลไม่ได้${pmState === 'failed' || pmState === 'skipped' ? ' (ลองแล้วไม่สำเร็จ)' : ''} — ระบบเรียก api_publicDashboard ผ่าน doPost ของ CassavaPlot Monitor ตรวจได้ด้วย python tools/check_plotmonitor.py</p><p class="hint"><button class="btn sm" data-pm-retry>🔄 ลองเชื่อมต่ออีกครั้ง</button> ${link}</p>`);
    }
    const s = pm.summary || {};
    const dn = state.district ? DA.D.dByCode[state.district].name : null;
    const bd = (pm.byDistrict || []).filter((x) => !dn || String(x.district || '').replace(/^อ\.|อำเภอ/, '').trim() === dn);
    const tgt = pm.targets && pm.targets.total;
    const tp = tgt ? U.safeDiv(tgt.actual.area, tgt.target.area) : null;
    return card2('ระบบติดตามแปลงส่งเสริม CassavaPlot Monitor', `${srcBadge('PLOTMON')}<span class="sub">${pm.live ? '🟢 ข้อมูลสด' : 'ข้อมูล ณ ' + U.esc(pm.fetched_at || '')} · อัปเดตในระบบ ${U.esc(pm.updatedAt || '–')}</span>`, `
      <div class="goal-grid">
        <div><span>แปลงที่ติดตาม</span><b>${U.fmt(s.plotCount)}</b> แปลง <small>${U.fmt(s.districtCount)} อำเภอ</small></div>
        <div><span>พื้นที่แปลง</span><b>${U.fmt(s.totalArea, 1)}</b> ไร่</div>
        <div><span>ต้นพันธุ์รับเข้า / ขยายออก</span><b>${U.fmt(s.totalStemIn)}</b> <small>ขยายออก ${U.fmt(s.totalStemOut)}</small></div>
        <div><span>แปลงพบโรคใบด่าง</span><b>${U.fmt(s.cmdPlots || 0)}</b> แปลง</div>
        ${tgt ? `<div><span>ผลงานเทียบเป้าหมายโครงการ ปี ${U.esc(pm.targets.year)}</span><b>${U.pct(tp, 0)}</b><small>${U.fmt(tgt.actual.area, 1)} / ${U.fmt(tgt.target.area, 1)} ไร่</small>${bar(tp, '#0f766e')}</div>` : ''}
      </div>
      ${bd.length ? `<div class="table-wrap"><table class="risk"><thead><tr><th>อำเภอ</th><th>พื้นที่แปลง (ไร่)</th></tr></thead><tbody>${bd.map((x) => `<tr><td>${U.esc(x.district)}</td><td>${U.fmt(x.area, 1)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${(pm.byVariety || []).length ? `<p class="hint">พันธุ์ (ทั้งจังหวัด): ${pm.byVariety.map((v) => `${vchip(v.variety)} ${U.fmt(v.plots)} แปลง ${U.fmt(v.area, 1)} ไร่`).join(' · ')}</p>` : ''}
      <p class="note">แปลงในระบบติดตามอาจซ้ำกับรายการในทะเบียนการสนับสนุน จึงแสดงแยกและไม่นำมารวมในความก้าวหน้าเป้าหมาย · ${link}</p>`);
  }

  function goalHtml() {
    const G = C.CMD_GOAL, g = cmdGoal(state.district);
    if (!g) return '<p class="hint">ยังไม่มีรายงานระบาดโรคใบด่างสำหรับตั้งเป้าหมาย</p>';
    const scope = state.district ? 'อ.' + DA.D.dByCode[state.district].name : 'จ.กำแพงเพชร';
    const rows = DA.D.districts.map((d) => Object.assign({ code: d.code, name: d.name }, cmdGoal(d.code) || {})).filter((r) => U.isNum(r.base) && r.base > 0).sort((a, b) => b.replant - a.replant);
    const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
    const supD = rows.reduce((s, r) => s + (r.sup ? r.sup.goalRai : 0), 0);
    return card2(`เป้าหมายลดพื้นที่ระบาดโรคใบด่าง ${U.pct(G.reduce, 0)} · ${U.esc(scope)}`, srcBadge('REPORT'), `
      <div class="goal-grid">
        <div><span>พื้นที่ระบาดฐาน (${thd(g.baseDate)})</span><b>${U.fmt(g.base)}</b> ไร่</div>
        <div><span>เป้าหมาย (ลด ${U.pct(G.reduce, 0)})</span><b>≤ ${U.fmt(g.target)}</b> ไร่ <small>ต้องลด ${U.fmt(g.reduce)} ไร่</small></div>
        <div><span>ระบาดล่าสุด (${thd(g.nowDate)})</span><b>${U.fmt(g.now)}</b> ไร่ <small>ลดได้แล้ว ${U.fmt(g.achieved)} ไร่</small></div>
        <div><span>ความก้าวหน้าสู่เป้าหมาย</span><b>${U.pct(g.progress, 0)}</b>${bar(g.progress, '#1a7f37')}</div>
      </div>
      <h4 class="goal-h">🛡️ ต้องส่งเสริมพันธุ์ต้านทาน/ทนทานทดแทนในพื้นที่ระบาด</h4>
      <div class="goal-grid">
        <div><span>พื้นที่ปลูกทดแทน</span><b>${U.fmt(g.replant)}</b> ไร่</div>
        <div><span>ต้นพันธุ์ (${U.fmt(G.stalksPerRai)} ลำ/ไร่)</span><b>${U.fmtCompact(g.stalks)}</b> ลำ <small>≈ ${U.fmtCompact(g.cuttings)} ท่อน</small></div>
        <div><span>แปลงขยายพันธุ์ (อัตรา 1:${G.multiplyRatio})</span><b>${U.fmt(g.nursery)}</b> ไร่</div>
        <div><span>สนับสนุนพันธุ์ต้านทาน/ทนทานแล้ว (ปี ${G.supportFromYear}+)</span><b>${U.fmt(g.sup.goalRai, 1)}</b> ไร่ <small>${U.pct(g.supShare, 1)} ของพื้นที่ทดแทน · ${U.fmt(g.sup.goalStalks)} ลำ</small>${bar(g.supShare, '#0f766e')}</div>
      </div>
      <p class="hint">ปัจจุบันพันธุ์ต้านทาน+ทนทานในผังแปลง ${U.fmt(g.resist)} ไร่ (${U.pct(g.resistPct)}) · แปลงส่งเสริมพันธุ์ ${U.fmt(g.proj, 1)} ไร่ · ${g.rounds < 2 ? 'มีรายงานเพียง 1 รอบ ความก้าวหน้าจะคำนวณเมื่อมีรายงานรอบถัดไป · ' : ''}สมมติฐาน: ปลูกทดแทนแปลงระบาด 1 ไร่ด้วยพันธุ์ต้านทาน/ทนทานจากท่อนพันธุ์สะอาด ลดพื้นที่ระบาด 1 ไร่</p>
      <div class="table-wrap"><table class="risk" data-click><thead><tr><th>อำเภอ</th><th>ระบาดฐาน</th><th>เป้าหมาย ≤</th><th>ระบาดล่าสุด</th><th>ความก้าวหน้า</th><th>ปลูกทดแทน (ไร่)</th><th>ต้นพันธุ์ (ลำ)</th><th>แปลงขยาย (ไร่)</th><th>สนับสนุนแล้ว (ไร่)</th><th>% ของเป้าทดแทน</th></tr></thead><tbody>${
        rows.map((r) => `<tr data-code="${r.code}" class="${state.district === r.code ? 'sel' : ''}"><td>${U.esc(r.name)}</td><td>${U.fmt(r.base)}</td><td>${U.fmt(r.target)}</td><td>${U.fmt(r.now)}</td><td>${U.pct(r.progress, 0)}</td><td><b>${U.fmt(r.replant)}</b></td><td>${U.fmtCompact(r.stalks)}</td><td>${U.fmt(r.nursery)}</td><td>${U.fmt(r.sup.goalRai, 1)}</td><td>${U.pct(r.supShare, 1)}</td></tr>`).join('')
      }<tr class="total"><td><b>รวม</b></td><td>${U.fmt(sum('base'))}</td><td>${U.fmt(sum('target'))}</td><td>${U.fmt(sum('now'))}</td><td></td><td><b>${U.fmt(sum('replant'))}</b></td><td>${U.fmtCompact(sum('stalks'))}</td><td>${U.fmt(sum('nursery'))}</td><td>${U.fmt(supD, 1)}</td><td>${U.pct(U.safeDiv(supD, sum('replant')), 1)}</td></tr></tbody></table></div>
      ${!state.district && g.sup.goalRai > supD + 0.01 ? `<p class="note">ตารางรายอำเภอไม่รวม ${U.fmt(g.sup.goalRai - supD, 1)} ไร่ที่ไม่ระบุอำเภอ (ยอดระดับจังหวัดด้านบนรวมแล้ว)</p>` : ''}`)
      + supportHtml() + plotMonitorHtml();
  }

  /* ข้อมูลสดจาก CassavaPlot Monitor: ดึงเมื่อเปิดหน้า ถ้าไม่สำเร็จใช้ข้อมูลรอบล่าสุดใน data/reports.js
     ถ้าล้มเหลว (ยังไม่ได้ Deploy ช่องทาง ?api=public) จะเว้น 6 ชั่วโมงก่อนลองใหม่ในเบราว์เซอร์เดิม เพื่อไม่ให้เรียกซ้ำทุกครั้ง */
  const PM_FAIL_KEY = 'kpp.plotmon.fail', PM_RETRY_MS = 6 * 3600 * 1000;
  let pmState = 'idle';
  function loadPlotMonitor(force) {
    if (!C.PLOT_MONITOR_URL || !window.fetch) return;
    const last = +(U.store(PM_FAIL_KEY) || 0);
    if (!force && last && Date.now() - last < PM_RETRY_MS) { pmState = 'skipped'; return; }
    pmState = 'loading';
    const ctl = window.AbortController ? new AbortController() : null;
    const tm = setTimeout(() => { if (ctl) ctl.abort(); }, 15000);
    // doPost ของ CassavaPlot: api_publicDashboard เรียกได้โดยไม่ต้องล็อกอิน · Content-Type text/plain = simple request (ไม่มี CORS preflight)
    fetch(C.PLOT_MONITOR_URL, { method: 'POST', body: JSON.stringify({ fn: 'api_publicDashboard', args: { year: '' } }), signal: ctl ? ctl.signal : undefined })
      .then((r) => r.json())
      .then((d) => {
        if (!d || !d.ok) throw new Error((d && d.error) || 'ไม่สำเร็จ');
        d.live = true; DA.D.rep.plot_monitor = d; pmState = 'live'; U.store(PM_FAIL_KEY, 0); update();
        if (force) U.toast('เชื่อมต่อ CassavaPlot Monitor สำเร็จ', 'ok');
      })
      .catch(() => { pmState = 'failed'; U.store(PM_FAIL_KEY, Date.now()); if (force) { U.toast('ยังดึงข้อมูล CassavaPlot ไม่ได้ — ช่องทาง ?api=public ยังไม่ได้ Deploy เวอร์ชันใหม่', 'err', 6000); renderSide(); } })
      .finally(() => clearTimeout(tm));
  }

  /* ---------- crumb ---------- */
  function renderCrumb() {
    const parts = ['<a data-crumb="prov">จ.กำแพงเพชร</a>'];
    if (state.district) parts.push(state.tambon ? `<a data-crumb="dist">อ.${U.esc(DA.D.dByCode[state.district].name)}</a>` : `<b>อ.${U.esc(DA.D.dByCode[state.district].name)}</b>`);
    if (state.tambon) parts.push(`<b>ต.${U.esc(DA.D.tambons[state.tambon].name)}</b>`);
    $('crumb').innerHTML = '📍 ' + parts.join(' › ') + ` <span class="hint" style="display:inline;margin:0">· ปี ${state.year}</span>`;
  }

  /* ---------- side panel modules ---------- */
  const card2 = (title, right, body) => `<div class="card chart-card"><div class="card-h"><h3>${title}</h3>${right || ''}</div>${body}</div>`;
  const actRow = (code, cols, acts, dim) => (acts && acts.length ? `<tr data-code="${code}" class="act ${dim ? 'dim' : ''}"><td colspan="${cols}" class="actions-cell"><ul>${acts.map((x) => `<li>${U.esc(x)}</li>`).join('')}</ul></td></tr>` : '');

  const MODULES = {
    overview: {
      tabs: [
        { id: 'sum', label: 'บทสรุป', html: () => summaryHtml() },
        { id: 'ov', label: 'กราฟภาพรวม', html: () => card2('เปรียบเทียบรายพื้นที่', `<span class="sub">${state.district ? 'รายตำบล' : 'รายอำเภอ'} · ปี ${state.year} · ไร่</span>`, '<div class="chart-legend" id="cmpLegend"></div><div class="chart-box tall"><canvas id="chCompare"></canvas></div>')
            + `<div class="grid2">${card2('พื้นที่ระบาดใบด่างตามอายุพืช', srcBadge('REPORT'), '<div class="chart-legend" id="ageLegend"></div><div class="chart-box"><canvas id="chDonut"></canvas></div><p class="note" id="ageSub"></p>')}
              ${card2('พันธุ์ที่ปลูก (ทะเบียน 2569)', srcBadge('PARCEL'), '<div class="chart-legend" id="varLegend"></div><div class="chart-box"><canvas id="chVariety"></canvas></div>')}</div>`
            + card2('แนวโน้มพื้นที่และผลผลิต (สถิติทางการ + ทะเบียน 2569)', '<span class="sub" id="trendSub"></span>', `<div class="grid2 tight"><div><div class="mini-h">ผลผลิตเฉลี่ย (กก./ไร่)</div><div class="chart-box short"><canvas id="chTrendYield"></canvas></div></div><div><div class="mini-h">พื้นที่ปลูก (ไร่) · เส้นประ = ทะเบียนเกษตรกร 2569</div><div class="chart-box short"><canvas id="chTrendCmd"></canvas></div></div></div>`),
          after: () => CH.overview(state) },
        { id: 'plan', label: 'แผนปฏิบัติการ', html: planHtml },
        { id: 'risk', label: 'ตารางความเสี่ยง', html: riskTableHtml },
        { id: 'insight', label: 'ข้อเสนอแนะ', html: insightsHtml },
        { id: 'status', label: 'สถานะข้อมูล', html: statusHtml }
      ]
    },
    prod: {
      tabs: [
        { id: 'dash', label: 'แดชบอร์ดการผลิต', html: prodDashHtml, after: () => CH.prod(state, prodSeries(state.district), prodCal(state.district)) },
        { id: 'tbl', label: 'ตารางรายอำเภอ', html: prodTableHtml },
        { id: 'price', label: 'ราคา & มูลค่า', html: prodPriceHtml }
      ]
    },
    cmd: {
      tabs: [
        { id: 'goal', label: `🎯 เป้าหมายลดระบาด ${Math.round(C.CMD_GOAL.reduce * 100)}%`, html: goalHtml },
        { id: 'cmp', label: 'กราฟเปรียบเทียบ', html: () => card2('พื้นที่ปลูก · พื้นที่ระบาด · พันธุ์ต้านทาน/ทนทาน', `<div class="seg" id="cmdSeg"><button data-mode="rai" class="${state.cmdMode === 'rai' ? 'on' : ''}">ไร่</button><button data-mode="pct" class="${state.cmdMode === 'pct' ? 'on' : ''}">% ของพื้นที่ปลูก</button></div>`,
            `<div class="chart-legend" id="cmdLegend"></div><div class="chart-box tall"><canvas id="chCmdCompare"></canvas></div><p class="note">${state.district ? 'รายตำบล — พื้นที่ระบาดมีในรายงานระดับอำเภอเท่านั้น (ตำบลแสดงเฉพาะพันธุ์) · ' : 'รายอำเภอ · '}% ระบาดคิดจากพื้นที่ปลูกตามรายงานโรค · % พันธุ์คิดจากผังแปลงดิจิทัล · คลิกแท่งเพื่อเจาะลึก</p>`)
            + card2('แนวโน้มการระบาดตามรอบรายงาน', srcBadge('REPORT'), `<div class="chart-box short"><canvas id="chCmdHist"></canvas></div><p class="note" id="histNote"></p>`)
            + card2('พื้นที่ระบาดรายอำเภอ แยกตามอายุพืช (ไร่)', srcBadge('REPORT'), '<div class="chart-legend" id="ageStackLegend"></div><div class="chart-box tall"><canvas id="chAgeStack"></canvas></div>')
            + card2('สัดส่วนกลุ่มพันธุ์ต่อโรคใบด่าง (% ของพื้นที่ขึ้นทะเบียน)', srcBadge('PARCEL'), '<div class="chart-legend" id="cmdVarLegend"></div><div class="chart-box tall"><canvas id="chCmdVar"></canvas></div>')
            + card2('พันธุ์ที่ปลูกและกลุ่มความต้านทาน', '', '<div class="chart-legend" id="cmdVarLegend2"></div><div class="chart-box"><canvas id="chCmdVarList"></canvas></div>'),
          after: () => { CH.cmdCompare(state, state.cmdMode); CH.cmdHistory(state); CH.cmdAgeStack(state); CH.cmdVarietyStack(state); CH.varietyClasses(state, 'chCmdVarList', 'cmdVarLegend2'); } },
        { id: 'tbl', label: 'ตารางการจัดการ', html: cmdTableHtml },
        { id: 'proj', label: 'แปลงส่งเสริมพันธุ์', html: projTableHtml },
        { id: 'trend', label: 'แนวโน้มพันธุ์หลายปี', html: trendHtml },
        { id: 'audit', label: 'ตรวจสอบพันธุ์', html: varietyAuditHtml },
        { id: 'rec', label: 'แนวทางจัดการ', html: cmdRecHtml }
      ]
    },
    rootrot: {
      tabs: [
        { id: 'rank', label: 'อันดับความเสี่ยง', html: () => card2(`ตำบลเสี่ยงสูงสุด 15 อันดับ${state.district ? ' · อ.' + DA.D.dByCode[state.district].name : ''}`, srcBadge('MODEL'), '<div class="chart-legend" id="rrLegend"></div><div class="chart-box" style="height:430px"><canvas id="chRR"></canvas></div><p class="note">คะแนน (0–100) = ประวัติน้ำท่วม (จำนวนปีที่ท่วม/7) × 45 + ข้อจำกัดดิน LDD (S1 0 · S2 0.3 · S3 0.7 · N 1) × 35 + ปลูกช่วง พ.ค.–ก.ย. × 20 — เฉลี่ยถ่วงพื้นที่แปลง</p>'),
          after: () => CH.rrFactors(state, DA.rootRotMatrix(state.district)) },
        { id: 'tbl', label: 'ตารางรายตำบล', html: rrTableHtml },
        { id: 'rec', label: 'แนวทางจัดการ', html: rrRecHtml }
      ]
    },
    soil: {
      tabs: [
        { id: 'chart', label: 'ศักยภาพรายอำเภอ', html: () => `<div class="chart-legend" id="soilLegend"></div>`
            + card2('มันสำปะหลังที่ปลูกในแต่ละชั้นความเหมาะสม (ไร่)', srcBadge('LDD'), '<div class="chart-box tall"><canvas id="chSoilPlanted"></canvas></div>')
            + card2('ศักยภาพที่ดินสำหรับมันสำปะหลัง (ไร่)', srcBadge('LDD'), '<div class="chart-box tall"><canvas id="chSoilPotential"></canvas></div><p class="note">ที่มา: ตารางที่ 7 รายงาน Agri-Map จ.กำแพงเพชร กรมพัฒนาที่ดิน</p>'),
          after: () => CH.soilCharts(state) },
        { id: 'series', label: 'ชุดดินแปลงมันฯ', html: soilSeriesHtml },
        { id: 'tbl', label: 'ตาราง LDD', html: soilTableHtml },
        { id: 'rec', label: 'แนวทางจัดการ', html: soilRecHtml }
      ]
    }
  };

  function renderSide() {
    const mod = MODULES[state.module];
    const cur = state.tab[state.module] || mod.tabs[0].id;
    $('sideTabs').innerHTML = mod.tabs.map((t) => `<button role="tab" class="tab ${t.id === cur ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('');
    CH.destroyAll();
    const t = mod.tabs.find((x) => x.id === cur) || mod.tabs[0];
    $('sideBody').innerHTML = t.html();
    if (t.after) t.after();
  }
  function showTab(id) { state.tab[state.module] = id; renderSide(); }
  const activeTab = () => state.tab[state.module] || MODULES[state.module].tabs[0].id;

  /* ----- บทสรุป 3 หัวข้อ: การผลิต · ปัญหา/ผลกระทบ · แนวทางพัฒนา (คำนวณจากข้อมูลจริงในระบบ) ----- */
  function summaryHtml(forReport) {
    const S = state, fl = f(), a = DA.agg(S.year, fl);
    const scope = S.tambon ? 'ต.' + DA.D.tambons[S.tambon].name : S.district ? 'อ.' + DA.D.dByCode[S.district].name : 'จ.กำแพงเพชร';
    const badge = (k) => (forReport ? '' : srcBadge(k));
    const li = (t) => `<li>${t}</li>`;
    const nz = (v) => U.isNum(v) && v > 0;
    const period = DA.D.rep.cmd ? DA.D.rep.cmd.period.replace(/วัน\S+ที่ /g, '') : '';
    const province = !S.district;
    const dists = province && S.year === 2569 ? DA.byDistrict(2569).filter((u) => (u.planted || 0) >= 300) : [];
    const names = (list, fmtFn) => list.map((u) => `อ.${U.esc(u.name)}${fmtFn ? ' (' + fmtFn(u) + ')' : ''}`).join(', ');

    /* 1) การผลิต/การเพาะปลูก */
    const p = [];
    if (nz(a.standing)) p.push(li(`พื้นที่ปลูกมันสำปะหลัง <b>${U.fmt(a.standing)}</b> ไร่${a.standingFarmers ? ` เกษตรกร ${U.fmt(a.standingFarmers)} ราย` : ''} ${badge('REPORT')} <span class="hint-i">(รายงานโรค ${U.esc(period)})</span>`));
    if (nz(a.planted)) p.push(li(`${S.year === 2569 ? 'พื้นที่ขึ้นทะเบียนเกษตรกร' : 'พื้นที่เพาะปลูก'} <b>${U.fmt(a.planted)}</b> ไร่${a.hh ? ` · ${U.fmt(a.hh)} ครัวเรือน · ${U.fmt(a.regParcels)} แปลง` : ''}${U.isNum(a.coverage) ? ` · ครอบคลุม <b>${U.pct(a.coverage, 0)}</b> ของพื้นที่ปลูก` : ''} ${badge(a.src.area)}`));
    const ly = lastOfficialYear(), o = DA.agg(ly, fl), o0 = DA.agg(C.YEARS[0], fl);
    if (nz(o.production)) {
      const ch = U.safeDiv(o.production - (o0.production || 0), o0.production);
      p.push(li(`ผลผลิตปี ${ly} <b>${U.fmt(o.production)}</b> ตัน ผลผลิตเฉลี่ย <b>${U.fmt(o.yield)}</b> กก./ไร่${U.isNum(ch) && ly !== C.YEARS[0] ? ` (${ch >= 0 ? 'เพิ่มขึ้น' : 'ลดลง'} ${U.pct(Math.abs(ch))} จากปี ${C.YEARS[0]})` : ''} ${badge('OFFICIAL')} <span class="hint-i">ปี 2568–2569 ยังไม่มีสถิติผลผลิตทางการ</span>`));
    }
    if (S.year === 2569 && nz(a.regPlanted)) {
      const vb = DA.varietyBreakdown(fl), tot = vb.reduce((s, v) => s + v.rai, 0);
      p.push(li(`พันธุ์หลัก: ${vb.slice(0, 4).map((v) => `${U.esc(v.name.replace(/^พันธุ์\s*/, ''))} ${U.pct(v.rai / tot)}`).join(' · ')} ${badge('PARCEL')}`));
      p.push(li(`กลุ่มพันธุ์ต่อโรคใบด่าง: ต้านทาน <b>${U.pct(a.resistantPct)}</b> · ทนทาน <b>${U.pct(a.tolerantPct)}</b> · ทั่วไป ${U.pct(a.generalPct)} · อ่อนแอ <b>${U.pct(a.susceptiblePct)}</b> ของผังแปลง`));
      const tys = TR() ? trendByYear(S.district).filter((o) => o.comparable) : [];
      if (tys.length >= 2) {
        const a0 = tys[0], a1 = tys[tys.length - 1], tt = propTest(a0.rtN, a0.n, a1.rtN, a1.n);
        p.push(li(`แนวโน้มพันธุ์ต้านทาน+ทนทานในผังแปลง: ปี ${a0.year} ${U.pct(a0.rtShare)} → ปี ${a1.year} ${U.pct(a1.rtShare)} (n = ${U.fmt(a0.n)} / ${U.fmt(a1.n)} แปลง${tt ? `, ${tt.p < 0.05 ? 'เปลี่ยนแปลงอย่างมีนัยสำคัญ' : 'ไม่แตกต่างอย่างมีนัยสำคัญ'} p ${tt.p < 0.001 ? '&lt; 0.001' : '= ' + tt.p.toFixed(3)}` : ''}) ${badge('PARCELALL')}`));
      }
      if (U.isNum(a.rainyPct)) p.push(li(`ปลูกช่วงฤดูฝน (พ.ค.–ก.ย.) ${U.pct(a.rainyPct)} ของพื้นที่ในผังแปลง`));
    }
    if (dists.length) p.push(li(`อำเภอที่มีพื้นที่ขึ้นทะเบียนมากที่สุด: ${names(dists.slice().sort((x, y) => y.planted - x.planted).slice(0, 3), (u) => U.fmt(u.planted) + ' ไร่')}`));

    /* 2) สถานการณ์ปัญหา/ผลกระทบ */
    const dz = [], so = [], wa = [];
    if (U.isNum(a.cmd)) {
      dz.push(li(`โรคใบด่าง: ระบาด <b>${U.fmt(a.cmd)}</b> ไร่ = <b>${U.pct(a.cmdPct)}</b> ของพื้นที่ปลูก ${status(a.cmdSeverity)}${a.cmdFarmers ? ` เกษตรกร ${U.fmt(a.cmdFarmers)} ราย` : ''}${cmdDelta()} ${badge('REPORT')}`));
      if (dists.length) {
        const hi = dists.filter((u) => (u.cmdPct || 0) >= 0.15).sort((x, y) => y.cmdPct - x.cmdPct);
        if (hi.length) dz.push(li(`อำเภอระบาดระดับสูง–วิกฤต (≥ 15%): ${names(hi, (u) => U.pct(u.cmdPct))}`));
      }
      if (U.isNum(a.cmdIndex)) dz.push(li(`ดัชนีความเร่งด่วนจัดการโรคใบด่าง <b>${a.cmdIndex}</b>/100 ${status(a.cmdLevel)} · พันธุ์อ่อนแอ ${U.pct(a.susceptiblePct)} · ทั่วไป ${U.pct(a.generalPct)} · ต้านทาน+ทนทาน ${U.pct(a.resistPct)} ${badge('MODEL')}`));
    } else dz.push(li(S.year === 2569 ? 'โรคใบด่าง: รายงานระบาดมีเฉพาะระดับอำเภอ ยังไม่มีผลสำรวจรายตำบล' : `โรคใบด่าง: ไม่มีรายงานในปี ${S.year}`));
    if (U.isNum(a.rrIndex)) dz.push(li(`โรครากเน่าโคนเน่า: ดัชนีความเสี่ยง <b>${a.rrIndex}</b>/100 ${status(a.rrLevel)} · แปลงเสี่ยงสูง ${U.fmt(a.rrHigh)} ไร่ (${U.pct(a.rrHighPct)}) ${badge('MODEL')}`));
    if (U.isNum(a.soilPoorPct)) so.push(li(`พื้นที่ขึ้นทะเบียนอยู่บนดินเหมาะสมน้อย/ไม่เหมาะสม (S3+N) <b>${U.pct(a.soilPoorPct)}</b> · S3 ${U.fmt(a.soil_S3)} ไร่ · N ${U.fmt(a.soil_N)} ไร่ ${badge('LDD')}`));
    const Tt = TR();
    if (Tt && Tt.soil.rows.length) {
      const sy = Tt.soil.rows.filter((r) => r[0] === 2569 && (!S.district || r[1] === S.district));
      const tot = sy.reduce((x, r) => x + r[4], 0), lowR = sy.filter((r) => r[2] >= 0 && Tt.soil.units[r[2]].fertility === 'ต่ำ').reduce((x, r) => x + r[4], 0);
      if (tot) so.push(li(`แปลงมันสำปะหลังปี 2569 อยู่บนชุดดินความอุดมสมบูรณ์ต่ำ <b>${U.pct(lowR / tot)}</b> (${U.fmt(lowR)} ไร่ ตามแผนที่ชุดดิน 1:25,000) ${badge('LDDSOIL')}`));
    }
    const t7 = (window.KPP_LDD ? window.KPP_LDD.table7.rows : []).filter((r) => !S.district || r.district_code === S.district);
    if (t7.length) {
      const s3n = t7.reduce((s, r) => s + r.planted.S3 + r.planted.N, 0), rem = t7.reduce((s, r) => s + r.remaining.S1 + r.remaining.S2, 0);
      so.push(li(`ตามแผนที่ Agri-Map มันสำปะหลังปลูกบนดิน S3+N ${U.fmt(s3n)} ไร่ · ที่ดินเหมาะสม S1+S2 ที่ยังไม่ได้ปลูกมันฯ ${U.fmt(rem)} ไร่`));
    }
    if (U.isNum(a.flood)) wa.push(li(`น้ำท่วมซ้ำซาก: แปลงทับซ้อน <b>${U.fmt(a.flood)}</b> ไร่ (${U.pct(a.floodPct)} ของผังแปลง) · อายุไม่ถึง ${C.EARLY_HARVEST_MIN_MONTHS} เดือนในช่วงน้ำหลาก ${U.fmt(a.early)} ไร่ · มูลค่าผลผลิตเสี่ยง ≈ ${U.fmtCompact(a.lossValue)} บาท ${badge('FLOOD')}`));
    if (nz(a.dmgRai)) wa.push(li(`ทะเบียนเกษตรกรแจ้งพื้นที่เสียหาย ${U.fmt(a.dmgRai)} ไร่ ${badge('REGISTRY')}`));
    wa.push(li('ฝนแล้ง/ฝนทิ้งช่วง: <span class="hint-i">ยังไม่มีข้อมูลภัยแล้งในระบบ (รายงานภัยพิบัติที่มีเป็นอุทกภัยและวาตภัย) — ควรนำเข้ารายงานภัยแล้งรายตำบล</span>'));

    /* 3) แนวทางการพัฒนาส่งเสริมการเกษตร */
    const g = [];
    const goal = S.year === 2569 && !S.tambon ? cmdGoal(S.district) : null;
    if (goal) g.push(li(`<b>เป้าหมายลดพื้นที่ระบาดโรคใบด่าง ${U.pct(C.CMD_GOAL.reduce, 0)}:</b> จาก ${U.fmt(goal.base)} ไร่ เหลือไม่เกิน <b>${U.fmt(goal.target)}</b> ไร่ — ส่งเสริมปลูกพันธุ์ต้านทาน/ทนทานทดแทนในพื้นที่ระบาด <b>${U.fmt(goal.replant)}</b> ไร่ · ต้นพันธุ์ ≈ ${U.fmtCompact(goal.stalks)} ลำ · แปลงขยายพันธุ์ ≈ ${U.fmt(goal.nursery)} ไร่ (1:${C.CMD_GOAL.multiplyRatio}) · สนับสนุนพันธุ์ต้านทาน/ทนทานแล้ว ${U.fmt(goal.sup.goalRai)} ไร่ (${U.pct(goal.supShare, 1)} ของเป้า)`));
    if ((a.cmdPct || 0) >= 0.05) g.push(li(`<b>ควบคุมโรคใบด่าง:</b> สำรวจแปลงทุก 1–2 สัปดาห์ ถอนทำลายต้นเป็นโรค งดเคลื่อนย้ายท่อนพันธุ์จากพื้นที่ระบาด${dists.length ? ' · เร่งด่วนใน ' + names(dists.filter((u) => (u.cmdPct || 0) >= 0.15).sort((x, y) => y.cmdPct - x.cmdPct).slice(0, 4)) : ''}`));
    if (U.isNum(a.coverage) && a.coverage < 0.8) g.push(li(`<b>ขึ้นทะเบียนเกษตรกร:</b> ยังไม่ขึ้นทะเบียน ${U.fmt(a.regGap)} ไร่ (ครอบคลุม ${U.pct(a.coverage, 0)})${dists.length ? ' · เน้น ' + names(dists.filter((u) => U.isNum(u.coverage) && u.coverage < 0.6).sort((x, y) => x.coverage - y.coverage).slice(0, 4), (u) => U.pct(u.coverage, 0)) : ''}`));
    if ((a.rrIndex || 0) >= 35 || (a.flood || 0) > 0) g.push(li('<b>บริหารจัดการน้ำและรากเน่า:</b> ยกร่อง/ทำทางระบายน้ำ เลื่อนปลูกหลังน้ำลดหรือเก็บเกี่ยวก่อนน้ำหลาก ชุบท่อนพันธุ์ด้วยเชื้อไตรโคเดอร์มาจาก ศจช.'));
    if ((a.soilPoorPct || 0) >= 0.2) g.push(li('<b>ปรับปรุงดิน/ปรับการใช้ที่ดิน:</b> ดิน S3/N ปรับปรุงด้วยอินทรียวัตถุ หรือส่งเสริมการปรับเปลี่ยนไปสู่พืชที่เหมาะสมตามแผนที่ Agri-Map'));
    g.push(li('<b>ยกระดับผลผลิต:</b> ต่อยอดแปลงใหญ่และ ศพก. ในพื้นที่ S1/S2 ใช้ท่อนพันธุ์สะอาด ปุ๋ยตามค่าวิเคราะห์ดิน และจัดเก็บสถิติผลผลิตปี 2568–2569 ให้ครบ'));
    g.push(li('<b>ระบบข้อมูล:</b> ให้อำเภอส่งผลสำรวจใบด่างรายตำบลทุก 2 สัปดาห์ และนำเข้ารายงานภัยแล้ง เพื่อติดตามแนวโน้มและผลกระทบได้แม่นยำขึ้น'));

    const sec = (n, icon, title, body) => `<section class="sum-sec"><h3><span class="sum-n">${n}</span>${icon} ${title}</h3>${body}</section>`;
    const sub = (t, items) => (items.length ? `<h4>${t}</h4><ul>${items.join('')}</ul>` : '');
    return `<div class="summary">
      <div class="sum-head"><b>บทสรุปสถานการณ์มันสำปะหลัง ${U.esc(scope)} ปีเพาะปลูก ${S.year}</b><span class="hint-i">${U.esc(C.PURPOSE || '')}</span></div>
      ${sec(1, '🌱', 'ข้อมูลการผลิต / การเพาะปลูก', `<ul>${p.join('') || li('ไม่มีข้อมูลในพื้นที่/ปีที่เลือก')}</ul>`)}
      ${sec(2, '⚠️', 'สถานการณ์ปัญหา / ผลกระทบ', sub('2.1 โรคพืช', dz) + sub('2.2 ดิน', so) + sub('2.3 น้ำ (น้ำท่วมซ้ำซาก / ฝนแล้ง)', wa))}
      ${sec(3, '🎯', 'แนวทางการพัฒนาส่งเสริมการเกษตร', `<ul>${g.join('')}</ul>${forReport ? '' : '<p class="hint">ดูลำดับความเร่งด่วนรายอำเภอในแท็บ "แผนปฏิบัติการ"</p>'}`)}
    </div>`;
  }

  /* ----- overview tables ----- */
  function riskTableHtml() {
    const rm = DA.riskMatrix(state.year, state.district);
    const uw = unitWord();
    return card2(`ตารางวิเคราะห์พื้นที่เสี่ยงราย${uw} ปี ${state.year}`, '', `<p class="hint">คะแนนความเสี่ยง = 45% สัดส่วนระบาดใบด่าง + 25% การขาดพันธุ์ต้านทาน/ทนทาน + 30% สัดส่วนทับซ้อนน้ำท่วมซ้ำซาก · คลิกแถวเพื่อเจาะลึก</p>
      <div class="table-wrap"><table class="risk" data-click><thead><tr><th>${uw}</th><th>พื้นที่ขึ้นทะเบียน (ไร่)</th><th>ใบด่าง* %</th><th>ต้านทาน+ทนทาน %</th><th>ทับซ้อนน้ำท่วม (ไร่)</th><th>เสี่ยงเก็บเกี่ยวก่อนกำหนด (ไร่)</th><th>ศจช. ใกล้สุด</th><th>คะแนน</th><th>ระดับ</th></tr></thead><tbody>${
      rm.map((r) => {
        const dim = state.risk !== 'all' && r.level.key !== state.risk;
        return `<tr data-code="${r.code}" class="${state.tambon === r.code ? 'sel' : ''} ${dim ? 'dim' : ''}"><td>${U.esc(r.name)}</td><td>${U.fmt(r.planted)}</td><td>${U.pct(r.cmdPct)}</td><td>${U.pct(r.resistPct)}</td><td>${U.fmt(r.flood)}</td><td>${U.fmt(r.early)}</td>
          <td class="l" title="${r.nearestPest ? U.esc(r.nearestPest.row.name) : ''}">${r.nearestPest ? U.fmt(r.nearestPest.km, 1) + ' กม.' : '–'}${r.pestCount ? ` <small>(${r.pestCount} ศูนย์)</small>` : ''}</td>
          <td><span class="score">${r.score ?? '–'}</span></td><td>${status(r.level)}</td></tr>${actRow(r.code, 9, r.actions, dim)}`;
      }).join('')}</tbody></table></div>`);
  }

  function insightsHtml() {
    const rm = DA.riskMatrix(state.year, state.district).filter((r) => !r.minor);
    const a = DA.agg(state.year, f());
    const uw = state.district ? 'ต.' : 'อ.';
    const chips = (list) => `<div class="chips">${list.map((r) => `<span class="chip" data-code="${r.code}">${uw}${U.esc(r.name)}</span>`).join('')}</div>`;
    const cmd = rm.filter((r) => r.flags.cmdUrgent).sort((x, y) => (y.cmdPct || 0) - (x.cmdPct || 0));
    const fl = rm.filter((r) => r.flags.floodRisk).sort((x, y) => (y.flood || 0) - (x.flood || 0));
    const far = rm.filter((r) => r.flags.farPest).sort((x, y) => y.nearestPest.km - x.nearestPest.km);
    const h = [];
    h.push(`<div class="ins ${cmd.length ? 'critical' : ''}"><h4>🦠 พื้นที่เร่งด่วนควบคุมโรคใบด่าง ${srcBadge(a.src.disease)}</h4><p>เกณฑ์: พื้นที่ระบาด ≥ 15% ของพื้นที่ปลูก และพันธุ์ต้านทาน+ทนทาน &lt; 10% · ข้อมูลระบาด ${U.esc(DA.D.rep.cmd ? DA.D.rep.cmd.period : '')}</p>
      ${cmd.length ? `<ul>${cmd.slice(0, 5).map((r) => `<li><b>${uw}${U.esc(r.name)}</b> ระบาด ${U.pct(r.cmdPct)} (${U.fmt(r.cmd)} ไร่) · ต้านทาน+ทนทาน ${U.pct(r.resistPct)}</li>`).join('')}</ul>${chips(cmd)}` : '<p>ไม่มีพื้นที่เข้าเกณฑ์เร่งด่วน</p>'}</div>`);
    h.push(`<div class="ins ${fl.length ? 'warning' : ''}"><h4>🌊 เสี่ยงสูญเสียจากน้ำท่วมซ้ำซาก ${srcBadge(a.src.flood)}</h4>
      <p>ทับซ้อน <b>${U.fmt(a.flood)}</b> ไร่ (${U.pct(a.floodPct)}) · อายุ &lt; ${C.EARLY_HARVEST_MIN_MONTHS} เดือนในช่วงน้ำหลาก ${U.fmt(a.early)} ไร่ · มูลค่าเสี่ยง ≈ ${U.fmtCompact(a.lossValue)} บาท</p>
      ${fl.length ? `<ul>${fl.slice(0, 5).map((r) => `<li><b>${uw}${U.esc(r.name)}</b> ทับซ้อน ${U.fmt(r.flood)} ไร่ · งบช่วยเหลือ ≈ ${U.fmtCompact(r.aidBudget)} บาท</li>`).join('')}</ul>${chips(fl)}` : ''}</div>`);
    h.push(`<div class="ins"><h4>🛡️ ช่องว่างพันธุ์ต้านทาน/ทนทาน ${srcBadge(a.src.resist)}</h4>${gapText(a)}</div>`);
    h.push(`<div class="ins ${far.length ? 'warning' : ''}"><h4>🏠 การเข้าถึง ศจช. ${srcBadge('NETWORK')}</h4>${far.length ? `<ul>${far.slice(0, 5).map((r) => `<li><b>${uw}${U.esc(r.name)}</b> ห่าง ${U.fmt(r.nearestPest.km, 1)} กม. (${U.esc(r.nearestPest.row.name)})</li>`).join('')}</ul>${chips(far)}` : '<p>ทุกพื้นที่อยู่ในระยะ 15 กม. จาก ศจช.</p>'}</div>`);
    h.push(provenanceHtml());
    return h.join('');
  }
  function gapText(a, target = 0.3) {
    if (!U.isNum(a.resistPct)) return '<p>ไม่มีข้อมูลรายพันธุ์</p>';
    const gap = a.resistPct < target ? (target - a.resistPct) * a.planted : 0;
    return `<p>ปัจจุบันต้านทาน ${U.fmt(a.resistant)} ไร่ + ทนทาน ${U.fmt(a.tolerant)} ไร่ = <b>${U.pct(a.resistPct)}</b> · อ่อนแอ ${U.fmt(a.susceptible)} ไร่ · ทั่วไป ${U.fmt(a.general)} ไร่</p>
      ${gap ? `<p>เป้าหมาย ${U.pct(target, 0)}: ต้องเพิ่ม <b>${U.fmt(gap)}</b> ไร่ ≈ ท่อนพันธุ์สะอาด <b>${U.fmtCompact(gap * 1600)}</b> ท่อน (1,600 ท่อน/ไร่) · แปลงขยายพันธุ์ ≈ ${U.fmt(gap / 10)} ไร่ (อัตราขยาย 1:10)</p>` : '<p>บรรลุเป้าหมายแล้ว</p>'}`;
  }
  function provenanceHtml() {
    return `<div class="ins"><h4>ℹ️ ความน่าเชื่อถือของข้อมูล</h4><ul>
      <li>${srcBadge('OFFICIAL')} พื้นที่/ผลผลิต 2565–2567 (ปี 2568 ยังไม่มีสถิติในระบบ จึงไม่แสดงค่า)</li>
      <li>${srcBadge('REGISTRY')} พื้นที่ปลูก 2569 จากทะเบียนเกษตรกรกลาง · ${srcBadge('PARCEL')} สัดส่วนพันธุ์/ชั้นดินจากผังแปลง ${U.fmt(DA.D.P.parcels)} แปลง</li>
      <li>${srcBadge('REPORT')} พื้นที่ระบาดใบด่างรายอำเภอ ${U.esc(DA.D.rep.cmd ? DA.D.rep.cmd.period : '')} — ระบบไม่ประมาณค่ารายตำบล</li>
      <li>${srcBadge('LDD')} ชั้นความเหมาะสมดิน: ตารางทางการรายอำเภอ + แผนที่ดิจิไทซ์ (คลาดเคลื่อนรวม 3–10%)</li>
      <li>${srcBadge('FLOOD')} ตำบลอุทกภัย 2563–2569 · ${srcBadge('PROJECT')} แปลงส่งเสริมพันธุ์ต้านทาน-ทนทาน</li></ul></div>`;
  }

  /* ----- Action plan: แผนปฏิบัติการรายอำเภอ (รวมข้อเสนอทุกด้าน) ----- */
  function planHtml() {
    const y = 2569;
    const ds = DA.byDistrict(y).filter((u) => (u.planted || 0) >= 300);
    const cm = Object.fromEntries(DA.cmdMatrix(y).map((r) => [r.code, r]));
    const rr = Object.fromEntries(DA.D.districts.map((d) => [d.code, DA.agg(y, { district: d.code })]));
    const t7 = Object.fromEntries((window.KPP_LDD ? window.KPP_LDD.table7.rows : []).map((r) => [r.district_code, r]));
    const target = 0.2;
    const rows = ds.map((u) => {
      const acts = [];
      let prio = 0;
      if ((u.cmdPct || 0) >= 0.15) { acts.push(['🦠', 'ควบคุมโรคใบด่าง', `ระบาด ${U.pct(u.cmdPct)} (${U.fmt(u.cmd)} ไร่ ${U.fmt(u.cmdFarmers)} ราย) — ตั้งจุดตรวจ งดเคลื่อนย้ายท่อนพันธุ์ ถอนทำลายต้นเป็นโรค`]); prio += 40 * Math.min(u.cmdPct / 0.3, 1); }
      const gl = cmdGoal(u.code);
      if (gl && gl.replant > 0) acts.push(['🛡️', `ทดแทนพันธุ์ (เป้าลดระบาด ${U.pct(C.CMD_GOAL.reduce, 0)})`, `ปลูกพันธุ์ต้านทาน/ทนทานทดแทนในพื้นที่ระบาด ${U.fmt(gl.replant)} ไร่ (ต้นพันธุ์ ≈ ${U.fmtCompact(gl.stalks)} ลำ · แปลงขยาย ≈ ${U.fmt(gl.nursery)} ไร่ · สนับสนุนแล้ว ${U.fmt(gl.sup.goalRai)} ไร่) · ปัจจุบันต้านทาน+ทนทาน ${U.pct(u.resistPct)}`]);
      if (U.isNum(u.resistPct) && u.resistPct < target) prio += 20 * (1 - Math.min(u.resistPct / target, 1));
      if (U.isNum(u.coverage) && u.coverage < 0.8) { acts.push(['📋', 'เร่งขึ้นทะเบียน', `ทะเบียนครอบคลุม ${U.pct(u.coverage, 0)} — ยังไม่ขึ้นทะเบียน ${U.fmt(u.regGap)} ไร่`]); prio += 15 * (1 - u.coverage); }
      const r = rr[u.code];
      if (r && (r.rrIndex || 0) >= 50) { acts.push(['🍂', 'ป้องกันรากเน่าโคนเน่า', `ดัชนี ${r.rrIndex}/100 — ยกร่อง ระบายน้ำ ชุบท่อนพันธุ์ด้วยไตรโคเดอร์มา`]); prio += 15 * Math.min(r.rrIndex / 70, 1); }
      const t = t7[u.code];
      if (t && t.planted.S3 + t.planted.N > 10000) { acts.push(['🟫', 'ปรับการใช้ที่ดิน', `ปลูกบนดิน S3/N ${U.fmt(t.planted.S3 + t.planted.N)} ไร่ (LDD) — ปรับปรุงดินหรือปรับเปลี่ยนพืช`]); prio += 10; }
      if ((u.flood || 0) >= 1000) acts.push(['🌊', 'หลบน้ำหลาก', `ทับซ้อนน้ำท่วมซ้ำซาก ${U.fmt(u.flood)} ไร่ — เลื่อนรอบปลูก/เก็บเกี่ยวก่อน ก.ย.`]);
      return { u, acts, prio: Math.round(prio), cmdLevel: (cm[u.code] || {}).cmdLevel };
    }).sort((a, b) => b.prio - a.prio);
    return `<div class="card"><div class="card-h"><h3>แผนปฏิบัติการรายอำเภอ ปี 2569</h3>${srcBadge('MODEL')}</div>
      <p class="hint">เรียงตามคะแนนความเร่งด่วน (ใบด่าง 40 · พันธุ์ 20 · ทะเบียน 15 · รากเน่า 15 · ดิน 10) คำนวณจากข้อมูลจริงในระบบ · ทดแทนพันธุ์ตามเป้าหมายลดพื้นที่ระบาดใบด่าง 30%</p>
      <div class="plan">${rows.map((x, i) => `<article class="plan-row" data-code="${x.u.code}"><header><span class="rank">${i + 1}</span><b>อ.${U.esc(x.u.name)}</b><span class="score">${x.prio}</span>${x.cmdLevel ? status(x.cmdLevel) : ''}</header>
        <ul>${x.acts.map(([ic, t, d]) => `<li><span class="ic">${ic}</span><b>${t}</b> ${U.esc(d)}</li>`).join('') || '<li>เฝ้าระวังตามปกติ</li>'}</ul></article>`).join('')}</div></div>`;
  }

  /* ----- Data status: วันที่ข้อมูลและกำหนดอัปเดต ----- */
  function statusHtml() {
    const rep = DA.D.rep.cmd, h = cmdHist();
    const today = new Date();
    const cyc = C.CMD_UPDATE_DAYS || 30;
    const end = rep && rep.end ? new Date(rep.end) : null;
    const age = end ? Math.floor((today - end) / 86400000) : null;
    const due = end ? new Date(end.getTime() + cyc * 86400000) : null;
    const st = age === null ? { k: 'na', t: 'ไม่มีข้อมูล' } : age <= 14 ? { k: 'good', t: 'เป็นปัจจุบัน' } : age <= cyc ? { k: 'warning', t: 'ใกล้ครบรอบอัปเดต' } : { k: 'critical', t: 'เกินรอบอัปเดต' };
    const th = (d) => (d ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
    const rows = [
      ['รายงานระบาดโรคใบด่าง', 'REPORT', rep ? rep.period.replace(/วัน\S+ที่ /g, '') : '–', `ทุก 2 สัปดาห์ – 1 เดือน · ครั้งถัดไปภายใน ${th(due)}`, st],
      ['ทะเบียนเกษตรกรกลาง', 'REGISTRY', 'พ.ย. 2569', 'รายเดือน หรือเมื่อปิดรอบการขึ้นทะเบียน', { k: 'good', t: 'ใช้งานได้' }],
      ['ผังแปลงเกษตรกรรมดิจิทัล', 'PARCEL', DA.D.P.asof || '–', 'ทุกรอบการผลิต', { k: 'good', t: 'ใช้งานได้' }],
      ['แปลงส่งเสริมพันธุ์ต้านทาน-ทนทาน', 'PROJECT', '22 พ.ย. 2569', 'เมื่อมีแปลงใหม่/ผลประเมิน', { k: 'good', t: 'ใช้งานได้' }],
      ['สถิติการผลิต', 'OFFICIAL', 'ปี 2565–2567', 'รายปี (ขาดปี 2568)', { k: 'warning', t: 'ขาดปี 2568' }],
      ['ความเหมาะสมดิน', 'LDD', 'Agri-Map 2564', 'เมื่อ LDD ปรับปรุง', { k: 'good', t: 'ใช้งานได้' }],
      ['รายงานอุทกภัย', 'FLOOD', '2563–2569', 'รายปี', { k: 'good', t: 'ใช้งานได้' }],
      ['การสนับสนุนท่อนพันธุ์', 'SUPPORT', DA.D.rep.support ? DA.D.rep.support.records.length + ' รายการ' : '–', 'เมื่อมีการแจกพันธุ์ (เพิ่มแถวใน ทะเบียนการสนับสนุนพันธุ์.csv)', DA.D.rep.support ? { k: 'good', t: 'ใช้งานได้' } : { k: 'na', t: 'ไม่มีข้อมูล' }],
      ['ระบบติดตามแปลงส่งเสริม', 'PLOTMON', DA.D.rep.plot_monitor ? (DA.D.rep.plot_monitor.updatedAt || DA.D.rep.plot_monitor.fetched_at || '') : '–', 'ต่อเนื่อง (ดึงข้อมูลสดเมื่อเปิดหน้าเว็บ)', DA.D.rep.plot_monitor ? (DA.D.rep.plot_monitor.live ? { k: 'good', t: 'ข้อมูลสด' } : { k: 'warning', t: 'ข้อมูลรอบก่อน' }) : { k: 'critical', t: 'ยังไม่เชื่อมต่อ' }]
    ];
    return `<div class="card"><div class="card-h"><h3>สถานะข้อมูลและรอบการอัปเดต</h3></div>
      <div class="table-wrap"><table class="risk"><thead><tr><th>ชุดข้อมูล</th><th>แหล่ง</th><th>ข้อมูล ณ</th><th>รอบอัปเดต</th><th>สถานะ</th></tr></thead><tbody>
      ${rows.map(([n, src, d, c, s2]) => `<tr><td class="l">${n}</td><td class="l">${srcBadge(src)}</td><td class="l">${U.esc(d)}</td><td class="l" style="white-space:normal">${c}</td><td><span class="status ${s2.k}">${s2.t}</span></td></tr>`).join('')}
      </tbody></table></div>
      <p class="hint">ประวัติรายงานใบด่างในระบบ: ${h.length} รอบ${h.length ? ` (${h.map((x) => th(new Date(x.end))).join(' · ')})` : ''}</p></div>
      <div class="ins"><h4>วิธีอัปเดตรายงานใบด่าง (ทุก 2 สัปดาห์ หรือเดือนละครั้ง)</h4><ol>
        <li>ดาวน์โหลดรายงานสถานการณ์การระบาดของศัตรูพืช (โรคใบด่างมันสำปะหลัง) เป็นไฟล์ Excel</li>
        <li>วางไฟล์ไว้ในโฟลเดอร์ <b>รายงานใบด่าง</b> ของระบบ (เก็บฉบับเก่าไว้เพื่อสร้างกราฟแนวโน้ม)</li>
        <li>ดับเบิลคลิก <b>อัปเดตรายงานใบด่าง.bat</b> แล้วตอบ Y เพื่อเผยแพร่ เว็บไซต์จะอัปเดตภายใน 1–2 นาที</li></ol>
        <p class="hint">ไฟล์ทะเบียนเกษตรกรและรายชื่อเกษตรกรจะไม่ถูกเผยแพร่ ระบบเผยแพร่เฉพาะสรุปรายอำเภอ/ตำบล</p></div>`;
  }

  /* ----- CMD ----- */
  function cmdTableHtml() {
    const rows = DA.cmdMatrix(state.year, state.district);
    const uw = unitWord();
    return card2(`ตารางการจัดการโรคใบด่างราย${uw} ปี ${state.year}`, srcBadge('MODEL'), `<p class="hint">ดัชนี (0–100) = 50 × สัดส่วนระบาดต่อพื้นที่ปลูก (เต็มที่ 30%) + 30 × สัดส่วนพันธุ์อ่อนแอ (ทั่วไปนับครึ่ง) + 20 × การขาดพันธุ์ต้านทาน/ทนทาน (เป้า 30%)</p>
      <div class="table-wrap"><table class="risk" data-click><thead><tr><th>${uw}</th><th>พื้นที่ปลูก (ไร่)</th><th>ระบาด${state.district ? '*' : ''} (ไร่)</th><th>% ระบาด</th><th>ต้านทาน</th><th>ทนทาน</th><th>ทั่วไป</th><th>อ่อนแอ</th><th>ดัชนี</th><th>ระดับ</th></tr></thead><tbody>${
      rows.map((r) => {
        const dim = state.risk !== 'all' && r.cmdLevel.key !== state.risk;
        return `<tr data-code="${r.code}" class="${state.tambon === r.code ? 'sel' : ''} ${dim ? 'dim' : ''}"><td>${U.esc(r.name)}</td><td>${U.fmt(r.standing ?? r.planted)}</td><td>${U.fmt(r.cmd)}</td><td>${U.pct(r.cmdPct)}</td>
          <td>${U.fmt(r.resistant)}</td><td>${U.fmt(r.tolerant)}</td><td>${U.fmt(r.general)}</td><td>${U.fmt(r.susceptible)}</td><td><span class="score">${r.cmdIndex ?? '–'}</span></td><td>${status(r.cmdLevel)}</td></tr>${actRow(r.code, 10, r.actions, dim)}`;
      }).join('')}</tbody></table></div>`);
  }
  function projTableHtml() {
    const rp = DA.D.rep.resist_plots;
    if (!rp) return '<p class="hint">ยังไม่มีข้อมูลแปลงส่งเสริมพันธุ์</p>';
    const rows = Object.entries(rp.tambons).filter(([c]) => !state.district || c.slice(0, 4) === state.district)
      .map(([c, t]) => Object.assign({ code: c, name: (DA.D.tambons[c] || {}).name, dn: (DA.D.dByCode[c.slice(0, 4)] || {}).name }, t)).sort((a, b) => b.rai - a.rai);
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    const vt = {}; rows.forEach((r) => Object.entries(r.varieties).forEach(([k, v]) => { vt[k] = (vt[k] || 0) + v; }));
    const cmdT = {}; rows.forEach((r) => { const u = DA.agg(2569, { tambon: r.code }); cmdT[r.code] = u.cmdPct; });
    return card2('แปลงส่งเสริมมันสำปะหลังพันธุ์ต้านทาน-ทนทาน (โครงการ 2569)', srcBadge('PROJECT'), `<div class="kv" style="margin-bottom:8px"><span>จำนวนแปลง / พื้นที่</span><b>${U.fmt(sum('plots'))} แปลง · ${U.fmt(sum('rai'), 1)} ไร่</b>
      <span>ท่อนพันธุ์ที่แจกจ่าย</span><b>${U.fmt(sum('cuttings'))} ท่อน</b><span>พันธุ์</span><b>${Object.entries(vt).sort((a, b) => b[1] - a[1]).map(([k, v]) => { const vc = C.VARIETY_CLASSES.find((x) => x.key === DA.varietyClass(k)); return `${U.esc(k)} ${U.fmt(v, 1)} ไร่ <span class="vclass-chip" style="background:${vc.color}">${vc.label}</span>`; }).join(' · ')}</b>
      <span>พื้นที่พันธุ์ต้านทานในแปลงส่งเสริม</span><b>${U.fmt(Object.entries(vt).filter(([k]) => DA.varietyClass(k) === 'resistant').reduce((x, [, v]) => x + v, 0), 1)} ไร่ (${U.pct(U.safeDiv(Object.entries(vt).filter(([k]) => DA.varietyClass(k) === 'resistant').reduce((x, [, v]) => x + v, 0), sum('rai')), 0)})</b>
      <span>พบอาการ CMD/SLCMV ในแปลงโครงการ</span><b>${U.fmt(sum('cmd'))} แปลง</b></div>
      <div class="table-wrap"><table class="risk" data-click><thead><tr><th>ตำบล</th><th>อำเภอ</th><th>แปลง</th><th>ไร่</th><th>ท่อนพันธุ์</th><th>พันธุ์</th><th>ระบบน้ำ</th><th>ระบาดในตำบล*</th></tr></thead><tbody>${
      rows.map((r) => `<tr data-code="${r.code}"><td>${U.esc(r.name)}</td><td class="l">${U.esc(r.dn)}</td><td>${r.plots}</td><td>${U.fmt(r.rai, 1)}</td><td>${U.fmt(r.cuttings)}</td>
        <td class="l">${Object.keys(r.varieties).map(U.esc).join(', ')}</td><td class="l">${Object.entries(r.irrigation).map(([k, v]) => U.esc(k.replace(/\s*\(.*\)/, '')) + ' ' + v).join(', ') || '–'}</td><td>${U.pct(cmdT[r.code])}</td></tr>`).join('')}</tbody></table></div>
      <p class="note">* รายงานระบาดมีเฉพาะระดับอำเภอ ระบบไม่ประมาณค่ารายตำบล (แสดง – จนกว่าจะนำเข้าผลสำรวจรายตำบล) · ไม่แสดงชื่อ/เบอร์โทรเกษตรกร</p>`);
  }
  /* ---------- ผังแปลงหลายปี (data/parcel_trends.js): แนวโน้มพันธุ์ · การเปลี่ยนพันธุ์ในแปลงเดิม · ชุดดิน ---------- */
  const TR = () => window.KPP_TRENDS;
  // ช่วงความเชื่อมั่น 95% ของสัดส่วนแบบ Wilson (x สำเร็จจาก n)
  function wilson(x, n, z = 1.96) {
    if (!n) return [null, null];
    const p = x / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return [Math.max(0, c - h), Math.min(1, c + h)];
  }
  // การทดสอบสัดส่วนสองกลุ่ม (two-proportion z-test) — คืนค่า z และ p สองทาง
  function propTest(x1, n1, x2, n2) {
    if (!n1 || !n2) return null;
    const p = (x1 + x2) / (n1 + n2), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
    if (!se) return null;
    const z = (x2 / n2 - x1 / n1) / se;
    const t = 1 / (1 + 0.2316419 * Math.abs(z)), dd = 0.3989423 * Math.exp(-z * z / 2);
    const tail = dd * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return { z, p: 2 * tail };
  }
  const CLS = () => C.VARIETY_CLASSES.map((v) => v.key);
  function trendByYear(dcode) {
    const T = TR(); if (!T) return [];
    const by = {};
    T.variety.rows.forEach(([y, dc, , bi, n, rai]) => {
      if (dcode && dc !== dcode) return;
      const k = DA.varietyClass(T.breeds[bi]);
      const o = by[y] || (by[y] = { year: y, n: 0, rai: 0, cls: {}, clsN: {}, breeds: {} });
      o.n += n; o.rai += rai; o.cls[k] = (o.cls[k] || 0) + rai; o.clsN[k] = (o.clsN[k] || 0) + n;
      o.breeds[T.breeds[bi]] = (o.breeds[T.breeds[bi]] || 0) + rai;
    });
    return Object.values(by).sort((a, b) => a.year - b.year).map((o) => {
      const rtN = (o.clsN.resistant || 0) + (o.clsN.tolerant || 0);
      return Object.assign(o, { rtShare: U.safeDiv((o.cls.resistant || 0) + (o.cls.tolerant || 0), o.rai), rtN, ci: wilson(rtN, o.n), comparable: !!(T.years[o.year] || {}).comparable, cov: (T.years[o.year] || {}).coverage_vs_median });
    });
  }
  const stackBar = (o) => `<div class="stack">${C.VARIETY_CLASSES.map((v) => { const s = U.safeDiv(o.cls[v.key] || 0, o.rai) || 0; return s ? `<i style="width:${(s * 100).toFixed(2)}%;background:${v.color}" title="${v.label} ${U.pct(s)}"></i>` : ''; }).join('')}</div>`;

  function trendHtml() {
    const T = TR();
    if (!T) return '<p class="hint">ยังไม่มีข้อมูลผังแปลงหลายปี — รัน tools/extract_parcels.py และ tools/analyze_parcels.py</p>';
    const ys = trendByYear(state.district);
    const comp = ys.filter((o) => o.comparable);
    const f0 = comp[0], f1 = comp[comp.length - 1];
    const tst = f0 && f1 && f0 !== f1 ? propTest(f0.rtN, f0.n, f1.rtN, f1.n) : null;
    const scope = state.district ? 'อ.' + U.esc(DA.D.dByCode[state.district].name) : 'จ.กำแพงเพชร';
    // การเปลี่ยนพันธุ์ในแปลงเดิม (คู่ปีล่าสุด)
    const tr = T.transitions.rows.filter((r) => !state.district || r[2] === state.district);
    const RT = (k) => k === 'resistant' || k === 'tolerant';
    const P = {};
    tr.forEach(([y, y1, , b0, b1, n, rai]) => {
      const k0 = b0 < 0 ? 'general' : DA.varietyClass(T.breeds[b0]), k1 = b1 < 0 ? 'general' : DA.varietyClass(T.breeds[b1]);
      const o = P[y] || (P[y] = { y, y1, n: 0, rai: 0, up: 0, down: 0, M: {} });
      const c = (o.M[k0] = o.M[k0] || {}); c[k1] = c[k1] || { n: 0, rai: 0 }; c[k1].n += n; c[k1].rai += rai;
      o.n += n; o.rai += rai; if (!RT(k0) && RT(k1)) o.up += rai; if (RT(k0) && !RT(k1)) o.down += rai;
    });
    const plist = Object.values(P).sort((a, b) => a.y - b.y);
    const sel = plist.filter((o) => (T.years[o.y] || {}).comparable && (T.years[o.y1] || {}).comparable).pop() || plist.slice().sort((a, b) => b.n - a.n)[0];
    const y0 = sel ? sel.y : null, M = sel ? sel.M : {}, pairN = sel ? sel.n : 0, pairRai = sel ? sel.rai : 0, up = sel ? sel.up : 0, down = sel ? sel.down : 0;
    const pairTable = plist.length ? `<div class="table-wrap"><table class="risk"><thead><tr><th>ช่วงปี</th><th>จับคู่ได้ (แปลง)</th><th>อัตราจับคู่</th><th>ไร่</th><th>เปลี่ยนเป็นต้านทาน/ทนทาน (ไร่)</th><th>เปลี่ยนกลับเป็นทั่วไป/อ่อนแอ (ไร่)</th><th>สุทธิ</th></tr></thead><tbody>${
      plist.map((o) => `<tr class="${o === sel ? 'sel' : ''}"><td>${o.y} → ${o.y1}</td><td>${U.fmt(o.n)}</td><td>${U.pct(((T.quality.panel_match || {}).pairs || {})[o.y + '-' + o.y1] ? T.quality.panel_match.pairs[o.y + '-' + o.y1].rate : null, 0)}</td><td>${U.fmt(o.rai)}</td><td>${U.fmt(o.up)}</td><td>${U.fmt(o.down)}</td><td><b>${o.up - o.down >= 0 ? '+' : ''}${U.fmt(o.up - o.down)}</b></td></tr>`).join('')}</tbody></table></div>` : '';
    const vl = (k) => C.VARIETY_CLASSES.find((v) => v.key === k);
    const last = ys[ys.length - 1];
    const topB = last ? Object.entries(last.breeds).sort((a, b) => b[1] - a[1]).slice(0, 8) : [];
    return card2(`แนวโน้มพันธุ์มันสำปะหลังจากผังแปลงหลายปี · ${scope}`, srcBadge('PARCELALL'), `
      <div class="legend-inline">${C.VARIETY_CLASSES.map((v) => `<span><i class="sw" style="background:${v.color}"></i>${v.label}</span>`).join('')}</div>
      <div class="table-wrap"><table class="risk"><thead><tr><th>ปีเพาะปลูก</th><th>แปลง (n)</th><th>พื้นที่ (ไร่)</th><th style="min-width:180px">สัดส่วนกลุ่มพันธุ์ (ถ่วงพื้นที่)</th><th>ต้านทาน+ทนทาน</th><th>95% CI (สัดส่วนแปลง)</th><th>ไม่ระบุพันธุ์</th></tr></thead><tbody>${
        ys.map((o) => `<tr class="${o.comparable ? '' : 'dim'}"><td>${o.year}${o.comparable ? '' : ' <small class="hint-i">(ข้อมูลไม่ครบ)</small>'}</td><td>${U.fmt(o.n)}</td><td>${U.fmt(o.rai)}</td><td>${stackBar(o)}</td><td><b>${U.pct(o.rtShare)}</b></td>
          <td>${o.ci[0] === null ? '–' : U.pct(o.ci[0]) + '–' + U.pct(o.ci[1])}</td><td>${U.pct(U.safeDiv(o.breeds['ไม่ระบุพันธุ์'] || 0, o.rai))}</td></tr>`).join('')
      }</tbody></table></div>
      ${tst ? `<p class="hint">เปรียบเทียบปี ${f0.year} กับ ${f1.year}: สัดส่วนแปลงพันธุ์ต้านทาน+ทนทาน ${U.pct(f0.rtN / f0.n)} → ${U.pct(f1.rtN / f1.n)} · z = ${tst.z.toFixed(2)}, p ${tst.p < 0.001 ? '&lt; 0.001' : '= ' + tst.p.toFixed(3)} → <b>${tst.p < 0.05 ? 'แตกต่างอย่างมีนัยสำคัญทางสถิติ (α = 0.05)' : 'ไม่แตกต่างอย่างมีนัยสำคัญ'}</b></p>` : ''}
      <h4 class="goal-h">🔁 การเปลี่ยนพันธุ์ในแปลงเดิม</h4><p class="hint">รหัสแปลงในผังแปลงไม่คงที่ข้ามปี จึงจับคู่ตามตำแหน่ง: ${U.esc((T.quality.panel_match || {}).method || '')} · ช่วงปีใช้เฉพาะปีที่ข้อมูลครบ</p>${pairTable}
      <h4 class="goal-h">ตารางเปลี่ยนกลุ่มพันธุ์ ปี ${y0 || '–'} → ${sel ? sel.y1 : '–'} (${U.fmt(pairN)} แปลง ${U.fmt(pairRai)} ไร่)</h4>
      ${pairN ? `<div class="table-wrap"><table class="risk"><thead><tr><th>จาก \\ เป็น</th>${CLS().map((k) => `<th>${vl(k).label}</th>`).join('')}</tr></thead><tbody>${
        CLS().map((a) => `<tr><td><span class="vclass-chip" style="background:${vl(a).color}">${vl(a).label}</span></td>${CLS().map((b) => { const c = (M[a] || {})[b]; return `<td${a === b ? ' style="background:var(--surface-2)"' : ''}>${c ? U.fmt(c.rai) + ' <small class="hint-i">(' + U.fmt(c.n) + ')</small>' : '–'}</td>`; }).join('')}</tr>`).join('')
      }</tbody></table></div>
      <p class="hint">หน่วย: ไร่ (จำนวนแปลง) · เปลี่ยนจากพันธุ์ทั่วไป/อ่อนแอ → ต้านทาน/ทนทาน <b>${U.fmt(up)}</b> ไร่ · ย้อนกลับจากต้านทาน/ทนทาน → ทั่วไป/อ่อนแอ <b>${U.fmt(down)}</b> ไร่</p>` : '<p class="hint">ไม่มีแปลงที่ขึ้นทะเบียนต่อเนื่องสองปี</p>'}
      ${topB.length ? `<p class="hint">พันธุ์หลักปี ${last.year}: ${topB.map(([b, r]) => `${U.esc(b.replace(/^พันธุ์\\s*/, ''))} ${U.pct(r / last.rai)}`).join(' · ')}</p>` : ''}
      <p class="note">${U.esc(T.method)} · ตัดออก ${U.fmt(T.quality.excluded_from_totals)} รายการจาก ${U.fmt(T.quality.rows_raw)} (ไม่มีปี ${U.fmt(T.quality.by_flag.no_year)} · พื้นที่ผิดปกติ ${U.fmt(T.quality.by_flag.bad_area)} · พื้นที่กิจกรรมเกินพื้นที่แปลง ${U.fmt(T.quality.by_flag.area_gt_parcel)}) · ${U.esc(T.rule || '')} · แถวสีจาง = ข้อมูลส่งออกไม่ครบ ไม่นำมาเปรียบเทียบ</p>`);
  }

  function soilSeriesHtml() {
    const T = TR();
    if (!T || !T.soil.rows.length) return '<p class="hint">ยังไม่มีผลซ้อนทับแปลงกับชุดดิน — รัน tools/build_ldd_soilseries.py แล้ว tools/analyze_parcels.py</p>';
    const SS = { units: T.soil.units, source: C.SOURCES.LDDSOIL.note, note: 'ความอุดมสมบูรณ์และ pH เป็นค่าประจำหน่วยแผนที่จากการสำรวจดิน ไม่ใช่ผลวิเคราะห์ดินรายแปลง' };
    const years = [...new Set(T.soil.rows.map((r) => r[0]))].sort();
    const yr = years.includes(state.year) ? state.year : years.filter((y) => (T.years[y] || {}).comparable).pop() || years[years.length - 1];
    const rows = T.soil.rows.filter((r) => r[0] === yr && (!state.district || r[1] === state.district));
    const tot = rows.reduce((s, r) => s + r[4], 0), totN = rows.reduce((s, r) => s + r[3], 0);
    const agg = (keyFn) => { const o = {}; rows.forEach(([, , u, n, rai]) => { const k = u < 0 ? '(นอกขอบเขตแผนที่ดิน)' : keyFn(SS.units[u]); const x = o[k] || (o[k] = { n: 0, rai: 0 }); x.n += n; x.rai += rai; }); return Object.entries(o).sort((a, b) => b[1].rai - a[1].rai); };
    const fert = agg((u) => (u.fertility && u.fertility !== '-' ? u.fertility : 'ไม่ประเมิน'));
    const ph = agg((u) => u.ph || 'ไม่ระบุ');
    const ser = agg((u) => `${u.name} (${u.code}) · กลุ่ม ${u.group}`).slice(0, 12);
    const tex = agg((u) => u.texture || 'ไม่ระบุ').slice(0, 8);
    const tbl = (title, list) => `<div><div class="mini-h">${title}</div><table class="risk"><tbody>${list.map(([k, v]) => `<tr><td class="l">${U.esc(k)}</td><td>${U.fmt(v.rai)}</td><td><b>${U.pct(v.rai / tot)}</b></td></tr>`).join('')}</tbody></table></div>`;
    const low = (fert.find(([k]) => k === 'ต่ำ') || [, { rai: 0 }])[1].rai;
    const acid = ph.filter(([k]) => /^กรดจัดมาก/.test(k)).reduce((s, [, v]) => s + v.rai, 0);
    return card2(`ชุดดินในแปลงปลูกมันสำปะหลัง ปี ${yr}${state.district ? ' · อ.' + U.esc(DA.D.dByCode[state.district].name) : ''}`, srcBadge('LDDSOIL'), `
      <div class="goal-grid">
        <div><span>แปลงที่ซ้อนทับชุดดินได้</span><b>${U.fmt(totN)}</b> แปลง <small>${U.fmt(tot)} ไร่</small></div>
        <div><span>ปลูกบนดินความอุดมสมบูรณ์ต่ำ</span><b>${U.pct(low / tot)}</b><small>${U.fmt(low)} ไร่</small></div>
        <div><span>ดินบนเริ่มที่กรดจัดมาก</span><b>${U.pct(acid / tot)}</b><small>${U.fmt(acid)} ไร่</small></div>
      </div>
      <div class="grid2">${tbl('ความอุดมสมบูรณ์ดินบน', fert)}${tbl('ปฏิกิริยาดินบน (pH)', ph)}</div>
      <div class="grid2">${tbl('ชุดดินที่ปลูกมากที่สุด', ser)}${tbl('เนื้อดินบน', tex)}</div>
      <div class="ins"><h4>📋 การใช้ข้อมูล</h4><ul>
        <li>ความอุดมสมบูรณ์และ pH เป็นค่าประจำหน่วยแผนที่ดินจากการสำรวจ (มาตราส่วน 1:25,000) ใช้วางแผนระดับพื้นที่ ไม่ใช่ค่าวิเคราะห์ดินรายแปลง</li>
        <li>การใส่ปุ๋ยและปูนรายแปลงควรใช้ผลวิเคราะห์ดินจริง — เก็บตัวอย่างดินส่งสถานีพัฒนาที่ดินกำแพงเพชร หรือใช้ชุดตรวจดินภาคสนาม แล้วใส่ปุ๋ยตามค่าวิเคราะห์ดิน</li>
        <li>พื้นที่ดินความอุดมสมบูรณ์ต่ำ: เพิ่มอินทรียวัตถุ (ปุ๋ยหมัก/ปุ๋ยพืชสด) ผ่าน ศดปช. และสารเร่ง พด. ของกรมพัฒนาที่ดิน</li>
        <li>เปิดชั้น "ชุดดิน 1:25,000" ในแผงชั้นข้อมูล แล้วคลิกบนแผนที่เพื่อดูชุดดินแต่ละจุด</li></ul></div>
      <p class="note">ที่มา: ${U.esc(SS.source)} · ${U.esc(SS.note)} · ตำแหน่งแปลง = จุดศูนย์กลางแปลงในผังแปลงดิจิทัล</p>`);
  }

  /* ---------- สถานการณ์การผลิต: สถิติทางการรายปี + ทะเบียน 2569 + ปฏิทินการผลิตจากผังแปลง + ราคา ---------- */
  function prodSeries(dcode) {
    const yrs = Object.keys(DA.D.official).map(Number).sort((a, b) => a - b);
    const out = yrs.map((y) => {
      const rows = Object.entries(DA.D.official[y]).filter(([c]) => !dcode || c === dcode).map(([, r]) => r);
      const s = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
      const o = { year: y, planted: s('planted'), harvested: s('harvested'), production: s('production') };
      o.yield = U.yieldKgPerRai(o.production, o.harvested);
      return o;
    });
    const last3 = out.slice(-3), h3 = last3.reduce((a, r) => a + r.harvested, 0), p3 = last3.reduce((a, r) => a + r.production, 0);
    const ref = U.yieldKgPerRai(p3, h3), ymin = Math.min(...last3.map((r) => r.yield)), ymax = Math.max(...last3.map((r) => r.yield));
    const reg = DA.D.rep.registry, rr = reg ? (dcode ? reg.districts[dcode] : reg.province) : null;
    if (rr) out.push({ year: 2569, reg: true, est: true, planted: rr.rai, harvested: rr.remain, production: rr.remain * ref / 1000, yield: null,
      prodLo: rr.remain * ymin / 1000, prodHi: rr.remain * ymax / 1000, refYield: ref, refYears: last3.map((r) => r.year) });
    return out;
  }
  function prodCal(dcode) {
    const T = TR(); if (!T || !T.harvest_month) return null;
    const yrs = Object.keys(T.years).map(Number).filter((y) => T.years[y].comparable).sort();
    const y = yrs.includes(state.year) ? state.year : yrs[yrs.length - 1];
    const pick = (rows) => { const m = Array(12).fill(0); rows.forEach(([yy, dc, mo, , rai]) => { if (yy === y && (!dcode || dc === dcode)) m[mo - 1] += rai; }); const t = m.reduce((a, b) => a + b, 0); return t ? m.map((v) => 100 * v / t) : m; };
    const bins = ['5-8', '8-10', '10-12', '12-14', '14+'], gb = {}; let gt = 0;
    T.growth.rows.forEach(([yy, dc, b, , rai]) => { if (yy === y && (!dcode || dc === dcode)) { gb[b] = (gb[b] || 0) + rai; gt += rai; } });
    const plant = pick(T.plant_month.rows), harvest = pick(T.harvest_month.rows);
    const peak = (arr) => arr.indexOf(Math.max(...arr));
    return { year: y, plant, harvest, growth: bins.map((b) => (gt ? 100 * (gb[b] || 0) / gt : 0)), growthLabels: bins.map((b) => b + ' เดือน'),
      median: T.growth.median_months[y], plantPeak: peak(plant), harvPeak: peak(harvest) };
  }
  const latestPrice = () => (C.PRICES || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null;
  const MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const thDate = (iso) => (iso ? new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');

  function prodKPIs() {
    const ser = prodSeries(state.district), off = ser.filter((r) => !r.reg), L = off[off.length - 1], Pv = off[off.length - 2];
    const e = ser.find((r) => r.reg), pr = latestPrice(), cal = prodCal(state.district);
    const d = (a, b) => (U.isNum(a) && U.isNum(b) && b ? `<span class="delta ${a >= b ? 'up' : 'down'}">${a >= b ? '▲ +' : '▼ '}${U.pct((a - b) / b)}</span> จากปี ${Pv.year}` : '');
    const mean = off.reduce((a, r) => a + (r.yield || 0), 0) / off.length;
    return card('var(--brand)', `พื้นที่ปลูก ปี ${L.year}`, U.fmt(L.planted), 'ไร่', `เก็บเกี่ยว ${U.fmt(L.harvested)} ไร่ · ${d(L.planted, Pv.planted)}`, 'OFFICIAL')
      + card('var(--gold)', `ผลผลิต ปี ${L.year}`, U.fmt(L.production), 'ตัน', d(L.production, Pv.production), 'OFFICIAL')
      + card('#1a7f37', 'ผลผลิตต่อไร่', U.fmt(L.yield), 'กก./ไร่', `เฉลี่ย ${off.length} ปี ${U.fmt(mean)} กก./ไร่ · ${d(L.yield, Pv.yield)}`, 'OFFICIAL')
      + (pr ? card('#6250d6', 'ราคาหัวมันสด', pr.price.toFixed(2), 'บาท/กก.', `${U.esc(pr.place)} · ${thDate(pr.date)} · มูลค่าผลผลิตปี ${L.year} ≈ <b>${U.fmtCompact(L.production * 1000 * pr.price)}</b> บาท (ราคานี้)`, 'PRICE') : '')
      + (e ? card('#2a78d6', 'ประมาณการผลผลิต 2569', U.fmt(e.production), 'ตัน', `พื้นที่คงเหลือขึ้นทะเบียน ${U.fmt(e.harvested)} ไร่ × ${U.fmt(e.refYield)} กก./ไร่ (เฉลี่ย ${e.refYears.join('–')}) · ช่วง ${U.fmtCompact(e.prodLo)}–${U.fmtCompact(e.prodHi)} ตัน`, 'PROJECTED') : '')
      + (cal ? card('#0f766e', 'ฤดูการผลิต (ผังแปลง)', MON[cal.plantPeak] + ' → ' + MON[cal.harvPeak], '', `ปลูกมากสุด ${MON[cal.plantPeak]} ${cal.plant[cal.plantPeak].toFixed(0)}% · เก็บเกี่ยวมากสุด ${MON[cal.harvPeak]} ${cal.harvest[cal.harvPeak].toFixed(0)}% · อายุกลาง ${cal.median} เดือน (ปี ${cal.year})`, 'PARCELALL') : '');
  }

  function prodDashHtml() {
    const cal = prodCal(state.district);
    return card2(`พื้นที่ปลูก ผลผลิต ${state.district ? '· อ.' + U.esc(DA.D.dByCode[state.district].name) : '· จ.กำแพงเพชร'}`, srcBadge('OFFICIAL'), '<div class="chart-legend" id="prodTrendLegend"></div><div class="chart-box tall"><canvas id="chProdTrend"></canvas></div><p class="note">ปี 2558–2567 สถิติทางการ · ปี 2568 ยังไม่มีสถิติ · ปี 2569 พื้นที่ขึ้นทะเบียนเกษตรกร และผลผลิตประมาณการ (พื้นที่คงเหลือ × ผลผลิตเฉลี่ยต่อไร่ 3 ปีล่าสุด)</p>')
      + card2('ผลผลิตต่อไร่ (กก./ไร่)', srcBadge('OFFICIAL'), '<div class="chart-box"><canvas id="chProdYield"></canvas></div><p class="note">ผลผลิตต่อไร่ = ผลผลิตรวม ÷ พื้นที่เก็บเกี่ยว × 1,000</p>')
      + (cal ? card2(`ปฏิทินการผลิต: ร้อยละการปลูก/เก็บเกี่ยวรายเดือน ปี ${cal.year}`, srcBadge('PARCELALL'), '<div class="chart-legend" id="prodCalLegend"></div><div class="chart-box"><canvas id="chProdCal"></canvas></div><p class="note">ถ่วงด้วยพื้นที่แปลงในผังแปลงดิจิทัล · เดือนเก็บเกี่ยวเป็นเดือนที่เกษตรกรแจ้งตอนขึ้นทะเบียน</p>')
        + card2(`อายุเก็บเกี่ยว (เดือน) · ค่ากลาง ${cal.median} เดือน`, srcBadge('PARCELALL'), '<div class="chart-box"><canvas id="chProdGrowth"></canvas></div><p class="note">อายุ = วันเก็บเกี่ยว − วันปลูก (ตัดค่าน้อยกว่า 5 หรือมากกว่า 24 เดือน) · อายุต่ำกว่า 8 เดือนแป้งต่ำ ควรเก็บเกี่ยวที่ 10–12 เดือน</p>') : '');
  }
  function prodTableHtml() {
    const yrs = Object.keys(DA.D.official).map(Number).sort((a, b) => a - b), L = yrs[yrs.length - 1], F = yrs[0], n = L - F;
    const reg = DA.D.rep.registry;
    const rows = DA.D.districts.map((d) => {
      const r = (DA.D.official[L] || {})[d.code] || {}, r0 = (DA.D.official[F] || {})[d.code] || {}, rp = (DA.D.official[L - 1] || {})[d.code] || {};
      return { code: d.code, name: d.name, planted: r.planted, harvested: r.harvested, production: r.production, yield: U.yieldKgPerRai(r.production, r.harvested),
        prevProd: rp.production, cagr: r0.production && r.production ? Math.pow(r.production / r0.production, 1 / n) - 1 : null, reg: reg && reg.districts[d.code] ? reg.districts[d.code].rai : null };
    }).sort((a, b) => (b.production || 0) - (a.production || 0));
    const tot = rows.reduce((a, r) => a + (r.production || 0), 0);
    return card2(`ข้อมูลการผลิตรายอำเภอ ปี ${L}`, srcBadge('OFFICIAL'), `<div class="table-wrap"><table class="risk" data-click><thead><tr><th>อำเภอ</th><th>พื้นที่ปลูก (ไร่)</th><th>เก็บเกี่ยว (ไร่)</th><th>ผลผลิต (ตัน)</th><th>สัดส่วน</th><th>ผลผลิตต่อไร่</th><th>เปลี่ยนจาก ${L - 1}</th><th>อัตราเติบโตเฉลี่ย ${F}–${L}</th><th>ขึ้นทะเบียน 2569 (ไร่)</th></tr></thead><tbody>${
      rows.map((r) => `<tr data-code="${r.code}" class="${state.district === r.code ? 'sel' : ''}"><td>${U.esc(r.name)}</td><td>${U.fmt(r.planted)}</td><td>${U.fmt(r.harvested)}</td><td><b>${U.fmt(r.production)}</b></td><td>${U.pct(U.safeDiv(r.production, tot))}</td><td>${U.fmt(r.yield)}</td>
        <td>${U.isNum(r.prevProd) && r.prevProd ? `<span class="delta ${r.production >= r.prevProd ? 'up' : 'down'}">${U.pct((r.production - r.prevProd) / r.prevProd)}</span>` : '–'}</td><td>${U.isNum(r.cagr) ? U.pct(r.cagr) + '/ปี' : '–'}</td><td>${U.fmt(r.reg)}</td></tr>`).join('')
    }</tbody></table></div><p class="note">อัตราเติบโตเฉลี่ย (CAGR) = (ผลผลิตปี ${L} ÷ ผลผลิตปี ${F})^(1/${n}) − 1 · ที่มา: ${U.esc(C.SOURCES.OFFICIAL.note)}</p>`);
  }
  function prodPriceHtml() {
    const ps = (C.PRICES || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const all = prodSeries(state.district), ser = all.filter((r) => !r.reg), L = ser[ser.length - 1], e = all.find((r) => r.reg), pr = ps[0];
    return card2('ราคาและมูลค่าผลผลิต', srcBadge('PRICE'), `
      ${pr ? `<div class="goal-grid">
        <div><span>ราคาล่าสุด (${thDate(pr.date)})</span><b>${pr.price.toFixed(2)}</b> บาท/กก. <small>${U.esc(pr.kind)} · ${U.esc(pr.place)}</small></div>
        <div><span>มูลค่าผลผลิตปี ${L.year} (ราคานี้)</span><b>${U.fmtCompact(L.production * 1000 * pr.price)}</b> บาท <small>${U.fmt(L.production)} ตัน</small></div>
        ${e ? `<div><span>มูลค่าประมาณการปี 2569</span><b>${U.fmtCompact(e.production * 1000 * pr.price)}</b> บาท <small>ช่วง ${U.fmtCompact(e.prodLo * 1000 * pr.price)}–${U.fmtCompact(e.prodHi * 1000 * pr.price)} บาท</small></div>` : ''}
      </div>` : '<p class="hint">ยังไม่มีข้อมูลราคา</p>'}
      <div class="table-wrap"><table class="risk"><thead><tr><th>วันที่</th><th>พื้นที่</th><th>ชนิดราคา</th><th>บาท/กก.</th><th>แหล่งที่มา</th></tr></thead><tbody>${ps.map((p) => `<tr><td>${thDate(p.date)}</td><td class="l">${U.esc(p.place)}</td><td class="l">${U.esc(p.kind)}</td><td><b>${p.price.toFixed(2)}</b></td><td class="l"><a href="${U.esc(p.url)}" target="_blank" rel="noopener">${U.esc(p.src)}</a></td></tr>`).join('')}</tbody></table></div>
      <p class="note">มูลค่าคำนวณจากราคาจุดเดียว ใช้เพื่อประมาณขนาดเศรษฐกิจเท่านั้น · ราคาหัวมันขึ้นกับเปอร์เซ็นต์แป้งและช่วงเวลา · ควรเพิ่มราคารายสัปดาห์จาก สศก./สำนักงานพาณิชย์จังหวัด (แก้ไขรายการที่ PRICES ใน js/config.js)</p>`);
  }

  /* ----- ตรวจสอบชื่อพันธุ์กับทะเบียนพันธุ์ของหน่วยงาน (VARIETY_REGISTRY) ----- */
  function varietyAuditHtml() {
    const REG = {}; Object.entries(C.VARIETY_REGISTRY).forEach(([k, v]) => { REG[DA.canon(k)] = Object.assign({ std: k }, v); });
    const rows = {};
    const add = (name, k, v) => { const c = DA.canon(name); const r = rows[c] || (rows[c] = { names: new Set(), parcel: 0, support: 0, monitor: 0 }); r.names.add(name); r[k] += v; };
    DA.varietyBreakdown(f()).forEach((v) => add(v.name, 'parcel', v.rai));
    ((DA.D.rep.support || {}).records || []).filter((r) => !state.district || r.d === state.district).forEach((r) => add(r.variety, 'support', r.rai));
    ((DA.D.rep.plot_monitor || {}).byVariety || []).forEach((v) => add(v.variety, 'monitor', v.area || 0));
    const totP = Object.values(rows).reduce((s, r) => s + r.parcel, 0);
    const CMDL = { r: 'ต้านทาน', t: 'ทนทาน', s: 'อ่อนแอ' }, CMDK = { r: 'resistant', t: 'tolerant', s: 'susceptible' };
    const list = Object.entries(rows).map(([c, r]) => {
      const g = REG[c] || { std: [...r.names][0], st: 'unverified', ag: '—', cmd: '', src: [], note: 'ไม่พบในทะเบียนพันธุ์ของระบบ' };
      const cls = DA.varietyClass([...r.names][0]);
      let flag = '';
      if (g.cmd && CMDK[g.cmd] !== cls) flag = `กลุ่มในระบบ (${C.VARIETY_CLASSES.find((x) => x.key === cls).label}) ไม่ตรงแหล่งอ้างอิง (${CMDL[g.cmd]})`;
      else if (!g.cmd && (cls === 'resistant' || cls === 'tolerant')) flag = 'จัดเป็นต้านทาน/ทนทาน แต่ไม่มีแหล่งอ้างอิงรองรับ';
      return Object.assign({ c, cls, flag, g }, r);
    }).sort((a, b) => b.parcel - a.parcel || b.support - a.support);
    const bySt = {}; list.forEach((r) => { bySt[r.g.st] = (bySt[r.g.st] || 0) + r.parcel; });
    const stChip = (st) => { const s = C.VARIETY_STATUS[st]; return `<span class="vclass-chip" style="background:${s.color}">${s.label}</span>`; };
    const srcs = (ix) => ix.map((i) => `<a href="${U.esc(C.VARIETY_SOURCES[i].u)}" target="_blank" rel="noopener" title="${U.esc(C.VARIETY_SOURCES[i].t)}">[${i + 1}]</a>`).join(' ');
    const flagged = list.filter((r) => r.flag || r.g.st === 'unverified' || r.g.st === 'local');
    return card2(`ตรวจสอบพันธุ์มันสำปะหลังกับทะเบียนพันธุ์ของหน่วยงาน${state.district ? ' · อ.' + U.esc(DA.D.dByCode[state.district].name) : ''}`, srcBadge('PARCEL'), `
      <div class="goal-grid">${Object.keys(C.VARIETY_STATUS).filter((k) => bySt[k]).map((k) => `<div><span>${stChip(k)}</span><b>${U.pct(U.safeDiv(bySt[k], totP))}</b><small>${U.fmt(bySt[k])} ไร่ในผังแปลง</small></div>`).join('')}</div>
      <p class="hint">พันธุ์ที่พบในผังแปลง ${list.filter((r) => r.parcel > 0).length} ชื่อ · ต้องตรวจสอบ/แก้ไข ${flagged.length} รายการ · ชื่อพันธุ์จับคู่แบบตัดคำว่า "พันธุ์/มันสำปะหลัง" และชื่อเรียกอื่น (เช่น KU50 = เกษตรศาสตร์ 50)</p>
      <div class="table-wrap"><table class="risk"><thead><tr><th>ชื่อพันธุ์ (ชื่อมาตรฐาน)</th><th>ผังแปลง (ไร่)</th><th>%</th><th>สนับสนุน (ไร่)</th><th>สถานะพันธุ์</th><th>หน่วยงานผู้พัฒนา</th><th>ปฏิกิริยาโรคใบด่าง (อ้างอิง)</th><th>กลุ่มในระบบ</th><th>ข้อสังเกต</th></tr></thead><tbody>${
        list.map((r) => `<tr class="${r.flag ? 'warn-row' : ''}"><td class="l">${U.esc(r.g.std)}${[...r.names].some((n) => n !== r.g.std) ? `<br><small class="hint-i">ในข้อมูล: ${[...r.names].map(U.esc).join(', ')}</small>` : ''}</td>
          <td>${r.parcel ? U.fmt(r.parcel) : '–'}</td><td>${r.parcel ? U.pct(r.parcel / totP) : '–'}</td><td>${r.support ? U.fmt(r.support, 1) : '–'}</td>
          <td class="l">${stChip(r.g.st)}</td><td class="l" style="white-space:normal">${U.esc(r.g.ag)}</td>
          <td class="l">${r.g.cmd ? CMDL[r.g.cmd] + (r.g.cmdBy === 'owner' ? ' <span class="hint-i">(มติเจ้าของระบบ)</span>' : '') : '<span class="hint-i">ไม่มีข้อมูลทางการ</span>'} ${srcs(r.g.src)}</td>
          <td class="l"><span class="vclass-chip" style="background:${C.VARIETY_CLASSES.find((x) => x.key === r.cls).color}">${C.VARIETY_CLASSES.find((x) => x.key === r.cls).label}</span></td>
          <td class="l" style="white-space:normal">${r.flag ? '⚠️ ' + U.esc(r.flag) + (r.g.note ? ' · ' : '') : ''}${U.esc(r.g.note || '')}</td></tr>`).join('')
      }</tbody></table></div>
      <p class="note">เกณฑ์: "กวก. รับรอง/แนะนำ" ตามรายชื่อพันธุ์ที่กรมวิชาการเกษตรประกาศ · "มก./มูลนิธิฯ พัฒนา" พันธุ์ของมหาวิทยาลัยเกษตรศาสตร์ร่วมกับมูลนิธิสถาบันพัฒนามันสำปะหลังแห่งประเทศไทย · "ต้องตรวจสอบ" ไม่พบชื่อในเอกสารอ้างอิง อาจบันทึกผิดหรือเป็นสายพันธุ์ทดลอง ควรตรวจสอบกับเกษตรกร/ศูนย์วิจัย · ปฏิกิริยาต่อโรคใบด่างใช้เฉพาะที่มีเอกสารของหน่วยงานรองรับ</p>
      <ol class="src-list">${C.VARIETY_SOURCES.map((s) => `<li><a href="${U.esc(s.u)}" target="_blank" rel="noopener">${U.esc(s.t)}</a></li>`).join('')}</ol>`);
  }

  function cmdRecHtml() {
    const a = DA.agg(state.year, f());
    const rows = DA.cmdMatrix(state.year, state.district).filter((r) => !r.minor);
    const top = rows.filter((r) => r.cmdLevel.key === 'critical' || r.cmdLevel.key === 'serious');
    const uw = state.district ? 'ต.' : 'อ.';
    const vlist = (k) => DA.allVarieties().filter((v) => DA.varietyClass(v) === k).map((v) => v.replace(/^พันธุ์\s*/, '')).join(', ') || '–';
    return `<div class="ins critical"><h4>🎯 พื้นที่เป้าหมายเร่งด่วน (${top.length})</h4>${top.length ? `<ul>${top.slice(0, 8).map((r) => `<li><b>${uw}${U.esc(r.name)}</b> ดัชนี ${r.cmdIndex} (${r.cmdLevel.label}) · ระบาด ${U.pct(r.cmdPct)} · อ่อนแอ ${U.pct(r.susceptiblePct)} · ต้านทาน+ทนทาน ${U.pct(r.resistPct)}</li>`).join('')}</ul><div class="chips">${top.map((r) => `<span class="chip" data-code="${r.code}">${uw}${U.esc(r.name)}</span>`).join('')}</div>` : '<p>ไม่มีพื้นที่ระดับสูง/วิกฤต</p>'}</div>
      <div class="ins"><h4>🛡️ แผนทดแทนพันธุ์ ${srcBadge('PARCEL')}</h4>${(() => { const g = cmdGoal(state.district); return g ? `<p>เป้าหมายลดพื้นที่ระบาด ${U.pct(C.CMD_GOAL.reduce, 0)}: ปลูกพันธุ์ต้านทาน/ทนทานทดแทนในพื้นที่ระบาด <b>${U.fmt(g.replant)}</b> ไร่ · ต้นพันธุ์ ≈ <b>${U.fmtCompact(g.stalks)}</b> ลำ (≈ ${U.fmtCompact(g.cuttings)} ท่อน) · สนับสนุนแล้ว ${U.fmt(g.sup.goalRai)} ไร่ · แปลงขยายพันธุ์ ≈ ${U.fmt(g.nursery)} ไร่</p>` : ''; })()}<p class="hint">ปัจจุบันต้านทาน ${U.fmt(a.resistant)} ไร่ + ทนทาน ${U.fmt(a.tolerant)} ไร่ = ${U.pct(a.resistPct)} ของผังแปลง · รายละเอียดรายอำเภอดูแท็บ "เป้าหมายลดระบาด"</p></div>
      <div class="ins"><h4>🌱 กลุ่มพันธุ์ที่ใช้ในการวิเคราะห์</h4><ul>
        ${C.VARIETY_CLASSES.map((v) => `<li><span class="vclass-chip" style="background:${v.color}">${v.label}</span> ${U.esc(vlist(v.key))}</li>`).join('')}</ul>
        <p class="hint">แก้ไข/เพิ่มพันธุ์ใหม่ได้ที่ นำเข้าข้อมูล › พันธุ์ &amp; ตั้งค่า</p></div>
      <div class="ins"><h4>📋 มาตรการจัดการโรคใบด่างมันสำปะหลัง</h4><ul>
        <li>ใช้ท่อนพันธุ์สะอาดจากแหล่งที่ไม่มีโรค และพันธุ์ต้านทาน/ทนทาน</li>
        <li>สำรวจแปลงสม่ำเสมอ (ทุก 1–2 สัปดาห์ในช่วงอายุ 1–4 เดือน) และรายงานผ่านระบบ</li>
        <li>ถอน/ขุดทำลายต้นที่แสดงอาการทันที ไม่นำส่วนใดไปขยายพันธุ์ต่อ</li>
        <li>ควบคุมแมลงหวี่ขาวยาสูบซึ่งเป็นพาหะ และกำจัดวัชพืชที่เป็นพืชอาศัย</li>
        <li>งดเคลื่อนย้ายท่อนพันธุ์จากพื้นที่ระบาด · ตั้งแปลงขยายพันธุ์สะอาดผ่าน ศจช./แปลงใหญ่</li></ul></div>`;
  }

  /* ----- Root rot ----- */
  function rrTableHtml() {
    const rows = DA.rootRotMatrix(state.district);
    const P = CH.PAL();
    return card2(`ความเสี่ยงโรครากเน่าโคนเน่ารายตำบล${state.district ? ' · อ.' + DA.D.dByCode[state.district].name : ' (ทั้งจังหวัด)'}`, srcBadge('MODEL'),
      `<div class="table-wrap"><table class="risk" data-click><thead><tr><th>ตำบล</th><th>อำเภอ</th><th>ปลูก (ไร่)</th><th>ปัจจัย น้ำท่วม/ดิน/ฝน</th><th>ปีที่ท่วม</th><th>ดิน S3+N</th><th>ปลูกฤดูฝน</th><th>ดัชนี</th><th>ระดับ</th></tr></thead><tbody>${
      rows.map((r) => {
        const dim = state.risk !== 'all' && r.rrLevel.key !== state.risk;
        const p = r.rrParts || { flood: 0, soil: 0, rain: 0 };
        return `<tr data-code="${r.code}" class="${state.tambon === r.code ? 'sel' : ''} ${dim ? 'dim' : ''}"><td>${U.esc(r.name)}</td><td class="l">${U.esc(DA.D.dByCode[r.code.slice(0, 4)].name)}</td><td>${U.fmt(r.regPlanted)}</td>
          <td><div class="factor-bar" title="น้ำท่วม ${U.fmt(p.flood)} · ดิน ${U.fmt(p.soil)} · ฝน ${U.fmt(p.rain)}"><i style="width:${p.flood}%;background:${P.s1}"></i><i style="width:${p.soil}%;background:${P.s2}"></i><i style="width:${p.rain}%;background:${P.s3}"></i></div></td>
          <td>${r.flood ? r.flood.nYears : 0}</td><td>${U.pct(r.soilPoorPct)}</td><td>${U.pct(r.rainyPct)}</td><td><span class="score">${r.rrIndex}</span></td><td>${status(r.rrLevel)}</td></tr>${actRow(r.code, 9, r.actions, dim)}`;
      }).join('')}</tbody></table></div>`);
  }
  function rrRecHtml() {
    const rows = DA.rootRotMatrix(state.district);
    const crit = rows.filter((r) => r.rrLevel.key === 'critical');
    const tricho = window.KPP_NETWORKS.pest.rows.filter(DA.hasTricho).filter((r) => !state.district || r.district_code === state.district);
    return `<div class="ins critical"><h4>🍂 ตำบลวิกฤต (${crit.length})</h4>${crit.length ? `<div class="chips">${crit.map((r) => `<span class="chip" data-code="${r.code}">ต.${U.esc(r.name)} (${r.rrIndex})</span>`).join('')}</div>` : '<p>ไม่มี</p>'}</div>
      <div class="ins"><h4>🧪 ศจช. ผลิตเชื้อไตรโคเดอร์มา (${tricho.length}) ${srcBadge('NETWORK')}</h4>${tricho.length ? `<ul>${tricho.map((r) => `<li>${U.esc(r.name)} — ต.${U.esc(r.tambon || '')} อ.${U.esc(r.district || '')}</li>`).join('')}</ul>` : '<p>ไม่พบในพื้นที่ที่เลือก</p>'}</div>
      <div class="ins"><h4>📋 แนวทางป้องกันโรครากเน่าโคนเน่ามันสำปะหลัง</h4><ul>
        <li>เลือกแปลงระบายน้ำดี หลีกเลี่ยงที่ลุ่มน้ำขัง/พื้นที่น้ำท่วมซ้ำซาก หรือยกร่องปลูกให้สูง</li>
        <li>ปรับช่วงปลูกให้พ้นฝนชุก หรือปลูกหลังน้ำลด · เก็บเกี่ยวก่อนช่วงน้ำหลากในพื้นที่เสี่ยง</li>
        <li>ใช้ท่อนพันธุ์สมบูรณ์ แช่ท่อนพันธุ์ด้วยสารป้องกันกำจัดเชื้อราหรือเชื้อไตรโคเดอร์มาก่อนปลูก</li>
        <li>ใส่เชื้อไตรโคเดอร์มาผสมปุ๋ยอินทรีย์รองก้นหลุม/โคนต้น · ปรับปรุงดิน S3/N ด้วยอินทรียวัตถุ</li>
        <li>ถอนต้นเป็นโรคออกนอกแปลง ปลูกพืชหมุนเวียน ไม่ปลูกมันสำปะหลังซ้ำในแปลงที่เป็นโรคต่อเนื่อง</li></ul></div>
      <div class="ins"><h4>ℹ️ ข้อมูลที่ใช้คำนวณ</h4><ul><li>${srcBadge('FLOOD')} จำนวนปีที่ตำบลเกิดอุทกภัย 2563–2569</li><li>${srcBadge('LDD')} ชั้นความเหมาะสมดินที่ตำแหน่งแปลง</li><li>${srcBadge('PARCEL')} เดือนที่ปลูก (ฤดูฝน พ.ค.–ก.ย.) รายแปลง</li></ul></div>`;
  }

  /* ----- Soil ----- */
  function soilTableHtml() {
    const t7 = (window.KPP_LDD ? window.KPP_LDD.table7.rows : []).filter((r) => !state.district || r.district_code === state.district);
    const reg = Object.fromEntries(DA.byDistrict(2569).map((u) => [u.code, u]));
    return card2('ศักยภาพที่ดินและพื้นที่ปลูกมันสำปะหลังรายอำเภอ (ไร่)', srcBadge('LDD'), `<div class="table-wrap"><table class="risk" data-click><thead><tr><th>อำเภอ</th><th>ศักยภาพ S1</th><th>S2</th><th>S3</th><th>N</th><th>ปลูกบน S1+S2</th><th>ปลูกบน S3+N</th><th>คงเหลือ S1+S2</th><th>ทะเบียน 2569 บน S3+N</th></tr></thead><tbody>${
      t7.map((r) => `<tr data-code="${r.district_code}"><td>${U.esc(r.district)}</td><td>${U.fmt(r.potential.S1)}</td><td>${U.fmt(r.potential.S2)}</td><td>${U.fmt(r.potential.S3)}</td><td>${U.fmt(r.potential.N)}</td>
        <td>${U.fmt(r.planted.S1 + r.planted.S2)}</td><td>${U.fmt(r.planted.S3 + r.planted.N)}</td><td><b>${U.fmt(r.remaining.S1 + r.remaining.S2)}</b></td><td>${U.pct((reg[r.district_code] || {}).soilPoorPct)}</td></tr>`).join('')}</tbody></table></div>
      <p class="note">ที่มา: ${U.esc(window.KPP_LDD ? window.KPP_LDD.table7.source : '')} · คอลัมน์สุดท้ายคำนวณจากการซ้อนทับแปลงทะเบียน 2569 กับแผนที่ LDD</p>`);
  }
  function soilRecHtml() {
    return `<div class="ins"><h4>🟩 พื้นที่ S1/S2 — ส่งเสริมการผลิตต่อเนื่อง</h4><p>ที่ดินไม่มีข้อจำกัดทางกายภาพ (S1) หรือมีข้อจำกัดเล็กน้อย เช่น ความอุดมสมบูรณ์ ความเป็นกรด-ด่าง ความชื้น (S2) — ต่อยอดแปลงใหญ่ เกษตรแม่นยำ และใช้พันธุ์ต้านทาน/ทนทาน</p></div>
      <div class="ins warning"><h4>🟧 พื้นที่ S3/N — ปรับเปลี่ยนการผลิต</h4><p>สนับสนุนให้เข้าโครงการปรับเปลี่ยนการผลิตไปสู่พืชที่เหมาะสมกว่า ต้นทุนต่ำ ผลตอบแทนดีกว่า โดยพิจารณาตลาดและแหล่งรับซื้อร่วมด้วย หรือปรับปรุงดินและระบบระบายน้ำ (ลดความเสี่ยงรากเน่าโคนเน่า)</p></div>
      <div class="ins"><h4>🗺️ การใช้แผนที่</h4><ul><li>เปิดชั้น "ความเหมาะสมดิน" แล้วคลิกบนแผนที่เพื่อดูชั้นดิน ณ จุดนั้น</li><li>ซูมระดับ 12 ขึ้นไปเพื่อดูแปลงทะเบียน 2569 ระบายสีตามชั้นดิน</li><li>นำเข้าชั้นข้อมูลดินระดับละเอียด (Shapefile/GeoJSON ที่มีค่า S1–N) ได้ที่ นำเข้าข้อมูล › ชั้นข้อมูลเชิงพื้นที่</li></ul></div>
      <div class="ins"><h4>ℹ️ ที่มาและความแม่นยำ</h4><p>${U.esc(C.SOURCES.LDD.note)}</p><p class="hint">${U.esc(window.KPP_LDD ? window.KPP_LDD.accuracy_note : '')}</p></div>`;
  }

  /* ---------- Layer panel ---------- */
  function renderLayerPanel() {
    const L_ = M.layers;
    const chk = (path, label, extra = '') => `<div class="lp-row"><label><input type="checkbox" data-l="${path}" ${get(path) ? 'checked' : ''}>${label}</label>${extra}</div>`;
    const op = (key) => `<div class="lp-sub"><input type="range" min="0.1" max="1" step="0.05" value="${L_[key].opacity}" data-op="${key}" aria-label="ความทึบ"><span class="op">${Math.round(L_[key].opacity * 100)}%</span></div>`;
    const h = [];
    h.push(`<div class="lp-sec"><div class="lp-title">แผนที่ฐาน</div><div class="lp-base">${Object.entries(C.BASEMAPS).map(([k, b]) => `<label><input type="radio" name="base" value="${k}" ${M.baseKey === k ? 'checked' : ''}>${b.name.replace(/\s*\(.*\)/, '')}</label>`).join('')}</div></div>`);
    h.push(`<div class="lp-sec"><div class="lp-title">ขอบเขตการปกครอง</div>
      <div class="lp-item">${chk('tambons.on', 'ขอบเขตตำบล')}</div>
      <div class="lp-item">${chk('villages.on', 'หมู่บ้าน (จุดรวมแปลง)')}</div>
      <div class="lp-item">${chk('parcels.on', 'แปลง (ซูม ≥ 12)')}</div></div>`);
    h.push(`<div class="lp-sec"><div class="lp-title">ชั้นข้อมูลเฉพาะเรื่อง</div>
      <div class="lp-item">${chk('choro.on', '🌿 แผนที่ระดับสีตามตัวชี้วัด')}${op('choro')}</div>
      <div class="lp-item">${chk('disease.on', '🦠 การระบาดโรคใบด่าง <span class="badge src-real">รายงานรายอำเภอ</span>')}
        <div class="lp-sub"><label><input type="checkbox" data-l="disease.heat" ${L_.disease.heat ? 'checked' : ''}> Heatmap</label><label><input type="checkbox" data-l="disease.hotspots" ${L_.disease.hotspots ? 'checked' : ''}> Hotspot</label><label><input type="checkbox" data-l="disease.buffers" ${L_.disease.buffers ? 'checked' : ''}> รัศมี 5/10 กม.</label></div>${op('disease')}</div>
      <div class="lp-item">${chk('resist.on', '🛡️ พันธุ์ต้านทาน/ทนทาน + แปลงส่งเสริม')}${op('resist')}</div>
      <div class="lp-item">${chk('flood.on', '🌊 พื้นที่น้ำท่วมซ้ำซาก')}${op('flood')}</div>
      <div class="lp-item">${chk('soil.on', '🟫 ความเหมาะสมดิน S1–N <span class="badge src-real">LDD</span>')}${op('soil')}</div>
      <div class="lp-item">${chk('series.on', '🟤 ชุดดิน 1:25,000 <span class="badge src-real">LDD</span>')}
        <div class="lp-sub"><select data-sby aria-label="แสดงชุดดินตาม">${[['fertility', 'ความอุดมสมบูรณ์'], ['ph', 'ปฏิกิริยาดิน (pH)'], ['group', 'กลุ่มชุดดิน']].map(([k, l]) => `<option value="${k}" ${L_.series.by === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>${op('series')}</div>
      <div class="lp-item">${chk('networks.on', '🏠 ศูนย์เครือข่าย กสก.')}
        <div class="lp-sub" style="flex-direction:column;align-items:flex-start">${Object.entries(M.NET).map(([k, n]) => `<label><input type="checkbox" data-l="networks.${k}" ${L_.networks[k] ? 'checked' : ''}> <span class="net-icon ${n.sq ? 'sq' : ''}" style="display:inline-grid;background:${n.color};width:16px;height:16px;font-size:8px;border-width:1px;vertical-align:middle">${n.glyph}</span> ${n.label} (${window.KPP_NETWORKS[k].rows.length})</label>`).join('')}</div></div></div>`);
    if (M.custom.length) {
      h.push(`<div class="lp-sec"><div class="lp-title">ชั้นข้อมูลที่นำเข้า</div>${M.custom.map((c) => `<div class="lp-item"><div class="lp-row"><label><input type="checkbox" data-custom="${c.id}" ${c.on ? 'checked' : ''}><span class="sw" style="background:${c.color}"></span>${U.esc(c.name)}</label><button class="btn sm" data-zoom="${c.id}" title="ซูม">⌖</button><button class="btn sm" data-rm="${c.id}" title="ลบ">✕</button></div>
        <div class="lp-sub"><input type="range" min="0.1" max="1" step="0.05" value="${c.opacity}" data-cop="${c.id}"></div></div>`).join('')}</div>`);
    }
    $('lpBody').innerHTML = h.join('');
  }
  function get(path) { return path.split('.').reduce((o, k) => o[k], M.layers); }
  function set(path, v) { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => o[k], M.layers)[last] = v; }

  /* ---------- Atlas & About ---------- */
  function openAtlas() {
    $('atlasModal').hidden = false;
    $('atlasSub').textContent = `ปี ${state.year} · ${state.district ? 'อ.' + DA.D.dByCode[state.district].name + ' (รายตำบล)' : 'รายอำเภอ'}`;
    setTimeout(() => M.openAtlas($('atlasGrid'), { year: state.year, district: state.district, tambon: null }), 30);
  }
  function openAbout() {
    $('aboutModal').hidden = false;
    $('aboutBody').innerHTML = `<div class="about-logos"><img src="assets/img/logo-doae.png" alt="กรมส่งเสริมการเกษตร"><img src="assets/img/seal-kpp.png" alt="จังหวัดกำแพงเพชร"></div>
      <p style="text-align:center"><b>${U.esc(C.TITLE)}</b><br>${U.esc(C.TITLE_EN)} · เวอร์ชัน ${C.VERSION}</p>
      <h3>วัตถุประสงค์</h3><p>${U.esc(C.PURPOSE)}</p>
      <h3>โมดูล</h3><ul><li>📊 ภาพรวมผู้บริหาร — บทสรุป 3 หัวข้อ (การผลิต/การเพาะปลูก · สถานการณ์ปัญหา/ผลกระทบ · แนวทางพัฒนาส่งเสริม) แนวโน้ม แผนปฏิบัติการ</li><li>🦠 การจัดการโรคใบด่าง — เปรียบเทียบพื้นที่ปลูก/ระบาด/พันธุ์ต้านทาน-ทนทาน และชุดแผนที่ 4 แผ่น</li><li>🍂 รากเน่าโคนเน่า — ดัชนีความเสี่ยงรายตำบลจากน้ำท่วม ดิน และฤดูปลูก</li><li>🟫 ความเหมาะสมดิน — ชั้น S1–N ของกรมพัฒนาที่ดิน</li></ul>
      <h3>แหล่งข้อมูล</h3><ul>${['REGISTRY', 'REPORT', 'PROJECT', 'OFFICIAL', 'PARCEL', 'LDD', 'FLOOD', 'NETWORK', 'MODEL'].map((k) => `<li>${srcBadge(k)} ${U.esc(C.SOURCES[k].note)}</li>`).join('')}</ul>
      <h3>การคุ้มครองข้อมูลส่วนบุคคล</h3><p>ระบบไม่เก็บเลขบัตรประชาชน ชื่อ ที่อยู่ เบอร์โทร หรือเลขเอกสารสิทธิ์ของเกษตรกร ข้อมูลแปลงบนเว็บไซต์สาธารณะแสดงแบบรวมกริด 1 กิโลเมตร ข้อมูลที่ผู้ใช้นำเข้าจัดเก็บเฉพาะในเบราว์เซอร์ของเครื่องนั้น</p>
      <h3>ผู้พัฒนา</h3><p>พัฒนาโดย <b>${U.esc(C.DEVELOPER)}</b><br>${U.esc(C.DEVELOPER_TITLE)}<br>${U.esc(C.DEVELOPER_UNIT)}<br>กรมส่งเสริมการเกษตร กระทรวงเกษตรและสหกรณ์</p>`;
  }

  /* ---------- UI bindings ---------- */
  function bindUI() {
    document.querySelectorAll('.mod').forEach((b) => b.addEventListener('click', () => setModule(b.dataset.mod)));
    $('fYear').addEventListener('change', (e) => setYear(e.target.value));
    $('fDistrict').addEventListener('change', (e) => { state.district = e.target.value || null; state.tambon = null; update(); M.fitScope(); });
    $('fTambon').addEventListener('change', (e) => { state.tambon = e.target.value || null; update(); M.fitScope(); });
    $('fRisk').addEventListener('change', (e) => { state.risk = e.target.value; update(); });
    $('btnReset').addEventListener('click', () => { Object.assign(state, { district: null, tambon: null, disease: 'all', risk: 'all' }); update(); M.fitScope(); });
    $('btnImport').addEventListener('click', () => KPP.Importer.open());
    $('btnAbout').addEventListener('click', openAbout);
    $('btnExport').addEventListener('click', (e) => { e.stopPropagation(); $('exportMenu').hidden = !$('exportMenu').hidden; });
    document.addEventListener('click', () => { $('exportMenu').hidden = true; });
    $('exportMenu').addEventListener('click', (e) => { const k = e.target.dataset.export; if (!k) return; $('exportMenu').hidden = true; KPP.Exporter[k](); });
    $('btnTheme').addEventListener('click', toggleTheme);
    $('btnPresent').addEventListener('click', togglePresent);
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('present')) togglePresent(); });
    $('lpToggle').addEventListener('click', (e) => { e.stopPropagation(); const p = $('layerPanel'); p.classList.toggle('collapsed'); $('lpToggle').classList.toggle('on', !p.classList.contains('collapsed')); });
    $('mapStyle').addEventListener('change', (e) => { M.layers.style = e.target.value; M.layers.choro.on = true; M.refresh(); });
    $('lpClose').addEventListener('click', () => { $('layerPanel').classList.add('collapsed'); $('lpToggle').classList.remove('on'); });
    $('legend').addEventListener('click', (e) => { if (e.target.closest('[data-lgt]')) $('legend').classList.toggle('min'); });
    $('lpBody').addEventListener('change', (e) => {
      const t = e.target;
      if (t.name === 'base') { M.setBase(t.value); M.refresh(); return; }
      if (t.dataset.l) { set(t.dataset.l, t.checked); M.refresh(); return; }
      if (t.dataset.sby !== undefined) { M.layers.series.by = t.value; M.layers.series.on = true; renderLayerPanel(); M.refresh(); return; }
      if (t.dataset.custom) M.setCustom(t.dataset.custom, 'on', t.checked);
    });
    $('lpBody').addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.op) { M.layers[t.dataset.op].opacity = +t.value; t.nextElementSibling.textContent = Math.round(t.value * 100) + '%'; clearTimeout(t._tm); t._tm = setTimeout(() => M.refresh(), 60); }
      if (t.dataset.cop) M.setCustom(t.dataset.cop, 'opacity', +t.value);
    });
    $('lpBody').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.rm) M.removeCustom(b.dataset.rm);
      if (b.dataset.zoom) { const c = M.custom.find((x) => x.id === b.dataset.zoom); if (c) M.map.fitBounds(c.layer.getBounds(), { maxZoom: 14 }); }
    });
    $('metricSwitch').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.atlas !== undefined) { openAtlas(); return; }
      M.layers.choro.metric = b.dataset.metric; M.layers.choro.on = true; M.refresh();
    });
    $('sideTabs').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) showTab(b.dataset.tab); });
    $('sideBody').addEventListener('click', (e) => {
      if (e.target.closest('[data-pm-retry]')) { loadPlotMonitor(true); return; }
      const seg = e.target.closest('#cmdSeg button');
      if (seg) { state.cmdMode = seg.dataset.mode; document.querySelectorAll('#cmdSeg button').forEach((x) => x.classList.toggle('on', x === seg)); CH.cmdCompare(state, state.cmdMode); return; }
      const chip = e.target.closest('.chip[data-code], .plan-row[data-code]');
      const tr = e.target.closest('table[data-click] tr[data-code]');
      const code = (chip || tr || {}).dataset ? (chip || tr).dataset.code : null;
      if (!code) return;
      if (code.length === 6) selectTambon(code); else selectDistrict(code);
    });
    $('crumb').addEventListener('click', (e) => {
      const a = e.target.closest('a'); if (!a) return;
      if (a.dataset.crumb === 'prov') { state.district = null; state.tambon = null; } else state.tambon = null;
      update(); M.fitScope();
    });
    ['atlasModal', 'aboutModal'].forEach((id) => {
      $(id).addEventListener('click', (e) => { if (e.target.id === id || e.target.closest('[data-close]')) $(id).hidden = true; });
    });
    $('btnAtlasPng').addEventListener('click', () => KPP.Exporter.atlas());
    $('btnAtlasPdf').addEventListener('click', () => KPP.Exporter.atlas('pdf'));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('atlasModal').hidden = true; $('aboutModal').hidden = true; } });
    $('btnToSummary').addEventListener('click', () => $('kpis').scrollIntoView({ behavior: 'smooth', block: 'start' }));
    window.addEventListener('resize', () => { clearTimeout(window._rz); window._rz = setTimeout(() => { measureHeader(); M.map.invalidateSize(); }, 150); });
  }

  /* ความสูงส่วนหัว → ให้แผนที่สูงเต็มหน้าจอที่เหลือ และแท็บบทสรุปติดใต้แถบตัวกรอง */
  function measureHeader() {
    const tb = document.querySelector('.topbar'), mb = document.querySelector('.modbar');
    const st = document.documentElement.style;
    st.setProperty('--hdr', ((tb ? tb.offsetHeight : 0) + (mb ? mb.offsetHeight : 0)) + 'px');
    st.setProperty('--modbar-h', (mb ? mb.offsetHeight : 0) + 'px');
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', cur);
    U.store('kpp.theme', cur);
    if (M.baseKey === 'light' && cur === 'dark') M.setBase('dark');
    else if (M.baseKey === 'dark' && cur === 'light') M.setBase('light');
    renderLayerPanel();
    update();
  }
  function togglePresent() {
    const on = !document.body.classList.contains('present');
    document.body.classList.toggle('present', on);
    $('btnPresent').textContent = on ? '■ ออกจากโหมดนำเสนอ' : '▶ โหมดนำเสนอ';
    $('layerPanel').classList.add('collapsed'); $('lpToggle').classList.remove('on');
    try {
      if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch (e) { /* fullscreen not permitted */ }
    setTimeout(() => { measureHeader(); M.map.invalidateSize(); Object.values(CH.charts).forEach((c) => c.resize()); M.fitScope(); }, 250);
  }

  return { init, state, update, summaryHtml, cmdGoal, selectDistrict, selectTambon, setYear, setDisease, setModule, renderLayerPanel, showTab, activeTab, openAtlas };
})();

document.addEventListener('DOMContentLoaded', () => {
  try { KPP.App.init(); }
  catch (e) { console.error(e); document.body.insertAdjacentHTML('afterbegin', `<div style="padding:12px;background:#b42323;color:#fff">เริ่มระบบไม่สำเร็จ: ${KPP.U.esc(e.message)}</div>`); }
});
