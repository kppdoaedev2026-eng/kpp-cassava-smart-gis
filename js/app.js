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
  }

  /* ---------- filters ---------- */
  function buildFilters() {
    $('fYear').innerHTML = C.YEARS.slice().reverse().map((y) => `<option value="${y}">${y}${y === 2569 ? ' (ทะเบียนแปลง)' : y === 2568 ? ' (ประมาณการ)' : ''}</option>`).join('');
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
        + card('var(--gold)', 'ผลผลิตประมาณการ', U.fmt(a.production), 'ตัน', `ผลผลิตเฉลี่ย <b>${U.fmt(a.yield)}</b> กก./ไร่`, a.src.prod)
        + card('var(--critical)', 'พื้นที่ระบาดโรคใบด่าง', U.fmt(a.cmd), 'ไร่', U.isNum(a.cmd) ? `${U.pct(a.cmdPct)} ของพื้นที่ยืนต้น ${status(a.cmdSeverity)}${a.cmdFarmers ? ' · ' + U.fmt(a.cmdFarmers) + ' ราย' : ''}` : 'มีรายงานเฉพาะปี 2569', a.src.disease)
        + card('#1a7f37', 'พันธุ์ต้านทาน + ทนทาน', U.fmt(a.resist), 'ไร่', `ครอบคลุม <b>${U.pct(a.resistPct)}</b> · ต้านทาน ${U.fmt(a.resistant)} · ทนทาน ${U.fmt(a.tolerant)}${bar(a.resistPct / 0.3, '#1a7f37')}`, a.src.resist)
        + card('var(--flood)', 'ทับซ้อนน้ำท่วมซ้ำซาก', U.fmt(a.flood), 'ไร่', `${U.pct(a.floodPct)} · มูลค่าผลผลิตเสี่ยง ≈ <b>${U.fmtCompact(a.lossValue)}</b> บาท · งบช่วยเหลือ ≈ ${U.fmtCompact(a.aidBudget)} บาท`, a.src.flood);
    } else if (state.module === 'cmd') {
      const rp = DA.D.rep.resist_plots;
      h = card('#2a78d6', 'พื้นที่ยืนต้น (รายงานโรค)', U.fmt(a.standing ?? a.planted), 'ไร่', `${a.standingFarmers ? U.fmt(a.standingFarmers) + ' ราย · ' : ''}ทะเบียน ${U.fmt(a.planted)} ไร่`, a.src.disease || a.src.area)
        + card('var(--critical)', 'พื้นที่ระบาดใบด่าง', U.fmt(a.cmd), 'ไร่', U.isNum(a.cmd) ? `${U.pct(a.cmdPct)} ของพื้นที่ยืนต้น ${status(a.cmdSeverity)}${a.cmdFarmers ? ' · ' + U.fmt(a.cmdFarmers) + ' ราย' : ''}` : 'ไม่มีรายงานในปีนี้', a.src.disease)
        + card('#1a7f37', 'พันธุ์ต้านทาน', U.fmt(a.resistant), 'ไร่', `${U.pct(a.resistantPct, 2)} · อิทธิ 1–3 ${bar(a.resistantPct / 0.3, '#1a7f37')}`, a.src.resist)
        + card('#8fd16a', 'พันธุ์ทนทาน', U.fmt(a.tolerant), 'ไร่', `${U.pct(a.tolerantPct)} · ห้วยบง 60, เกษตรศาสตร์ 50 ${bar(a.tolerantPct / 0.3, '#5aa832')}`, a.src.resist)
        + (rp ? card('#0f766e', 'แปลงส่งเสริมพันธุ์ต้านทาน', U.fmt(a.projPlots), 'แปลง', `${U.fmt(a.projRai, 1)} ไร่ · ท่อนพันธุ์ ${U.fmtCompact(a.projCuttings)} ท่อน`, 'PROJECT') : '')
        + card('#b2182b', 'ดัชนีเร่งด่วนจัดการโรค', U.isNum(a.cmdIndex) ? a.cmdIndex : '–', '/100', `${status(a.cmdLevel)} · พันธุ์อ่อนแอ ${U.pct(a.susceptiblePct)} · ค่อนข้างอ่อนแอ ${U.pct(a.modsusPct)}`, 'MODEL');
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
        { id: 'ov', label: 'ภาพรวม', html: () => card2('เปรียบเทียบรายพื้นที่', `<span class="sub">${state.district ? 'รายตำบล' : 'รายอำเภอ'} · ปี ${state.year} · ไร่</span>`, '<div class="chart-legend" id="cmpLegend"></div><div class="chart-box tall"><canvas id="chCompare"></canvas></div>')
            + `<div class="grid2">${card2('พื้นที่ระบาดใบด่างตามอายุพืช', srcBadge('REPORT'), '<div class="chart-legend" id="ageLegend"></div><div class="chart-box"><canvas id="chDonut"></canvas></div><p class="note" id="ageSub"></p>')}
              ${card2('พันธุ์ที่ปลูก (ทะเบียน 2569)', srcBadge('PARCEL'), '<div class="chart-legend" id="varLegend"></div><div class="chart-box"><canvas id="chVariety"></canvas></div>')}</div>`
            + card2('แนวโน้ม 5 ปี (2565–2569)', '<span class="sub" id="trendSub"></span>', `<div class="grid2 tight"><div><div class="mini-h">ผลผลิตเฉลี่ย (กก./ไร่)</div><div class="chart-box short"><canvas id="chTrendYield"></canvas></div></div><div><div class="mini-h">พื้นที่ปลูก (ไร่) · เส้นประ = ประมาณการ/ทะเบียน</div><div class="chart-box short"><canvas id="chTrendCmd"></canvas></div></div></div>`),
          after: () => CH.overview(state) },
        { id: 'risk', label: 'ตารางความเสี่ยง', html: riskTableHtml },
        { id: 'insight', label: 'ข้อเสนอแนะเชิงนโยบาย', html: insightsHtml }
      ]
    },
    cmd: {
      tabs: [
        { id: 'cmp', label: 'กราฟเปรียบเทียบ', html: () => card2('พื้นที่ปลูก · พื้นที่ระบาด · พันธุ์ต้านทาน/ทนทาน', `<div class="seg" id="cmdSeg"><button data-mode="rai" class="${state.cmdMode === 'rai' ? 'on' : ''}">ไร่</button><button data-mode="pct" class="${state.cmdMode === 'pct' ? 'on' : ''}">% ของพื้นที่ปลูก</button></div>`,
            `<div class="chart-legend" id="cmdLegend"></div><div class="chart-box tall"><canvas id="chCmdCompare"></canvas></div><p class="note">${state.district ? 'รายตำบล (พื้นที่ระบาด/ยืนต้นเป็นค่าประมาณจากรายงานรายอำเภอ)' : 'รายอำเภอ'} · ปี ${state.year} · % ระบาดคิดจากพื้นที่ยืนต้น · % พันธุ์คิดจากพื้นที่ทะเบียน · คลิกแท่งเพื่อเจาะลึก</p>`)
            + card2('พื้นที่ระบาดรายอำเภอ แยกตามอายุพืช (ไร่)', srcBadge('REPORT'), '<div class="chart-legend" id="ageStackLegend"></div><div class="chart-box tall"><canvas id="chAgeStack"></canvas></div>')
            + card2('สัดส่วนกลุ่มพันธุ์ต่อโรคใบด่าง (% ของพื้นที่ขึ้นทะเบียน)', srcBadge('PARCEL'), '<div class="chart-legend" id="cmdVarLegend"></div><div class="chart-box tall"><canvas id="chCmdVar"></canvas></div>')
            + card2('พันธุ์ที่ปลูกและกลุ่มความต้านทาน', '', '<div class="chart-legend" id="cmdVarLegend2"></div><div class="chart-box"><canvas id="chCmdVarList"></canvas></div>'),
          after: () => { CH.cmdCompare(state, state.cmdMode); CH.cmdAgeStack(state); CH.cmdVarietyStack(state); CH.varietyClasses(state, 'chCmdVarList', 'cmdVarLegend2'); } },
        { id: 'tbl', label: 'ตารางการจัดการ', html: cmdTableHtml },
        { id: 'proj', label: 'แปลงส่งเสริมพันธุ์', html: projTableHtml },
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

  /* ----- overview tables ----- */
  function riskTableHtml() {
    const rm = DA.riskMatrix(state.year, state.district);
    const uw = unitWord();
    return card2(`ตารางวิเคราะห์พื้นที่เสี่ยงราย${uw} ปี ${state.year}`, '', `<p class="hint">คะแนนความเสี่ยง = 45% สัดส่วนระบาดใบด่าง + 25% การขาดพันธุ์ต้านทาน/ทนทาน + 30% สัดส่วนทับซ้อนน้ำท่วมซ้ำซาก · คลิกแถวเพื่อเจาะลึก</p>
      <div class="table-wrap"><table class="risk" data-click><thead><tr><th>${uw}</th><th>พื้นที่ปลูก (ไร่)</th><th>ใบด่าง* %</th><th>ต้านทาน+ทนทาน %</th><th>ทับซ้อนน้ำท่วม (ไร่)</th><th>เสี่ยงเก็บเกี่ยวก่อนกำหนด (ไร่)</th><th>ศจช. ใกล้สุด</th><th>คะแนน</th><th>ระดับ</th></tr></thead><tbody>${
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
    h.push(`<div class="ins ${cmd.length ? 'critical' : ''}"><h4>🦠 พื้นที่เร่งด่วนควบคุมโรคใบด่าง ${srcBadge(a.src.disease)}</h4><p>เกณฑ์: พื้นที่ระบาด ≥ 15% ของพื้นที่ยืนต้น และพันธุ์ต้านทาน+ทนทาน &lt; 10% · ข้อมูลระบาด ${U.esc(DA.D.rep.cmd ? DA.D.rep.cmd.period : '')}</p>
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
    return `<p>ปัจจุบันต้านทาน ${U.fmt(a.resistant)} ไร่ + ทนทาน ${U.fmt(a.tolerant)} ไร่ = <b>${U.pct(a.resistPct)}</b> · อ่อนแอ ${U.fmt(a.susceptible)} ไร่ · ค่อนข้างอ่อนแอ ${U.fmt(a.modsus)} ไร่</p>
      ${gap ? `<p>เป้าหมาย ${U.pct(target, 0)}: ต้องเพิ่ม <b>${U.fmt(gap)}</b> ไร่ ≈ ท่อนพันธุ์สะอาด <b>${U.fmtCompact(gap * 1600)}</b> ท่อน (1,600 ท่อน/ไร่) · แปลงขยายพันธุ์ ≈ ${U.fmt(gap / 10)} ไร่ (อัตราขยาย 1:10)</p>` : '<p>บรรลุเป้าหมายแล้ว</p>'}`;
  }
  function provenanceHtml() {
    return `<div class="ins"><h4>ℹ️ ความน่าเชื่อถือของข้อมูล</h4><ul>
      <li>${srcBadge('OFFICIAL')} พื้นที่/ผลผลิต 2565–2567 · ${srcBadge('ESTIMATE')} 2568 (เฉลี่ย 3 ปี)</li>
      <li>${srcBadge('REGISTRY')} พื้นที่ปลูก 2569 จากทะเบียนเกษตรกรกลาง · ${srcBadge('PARCEL')} สัดส่วนพันธุ์/ชั้นดินจากผังแปลง ${U.fmt(DA.D.P.parcels)} แปลง</li>
      <li>${srcBadge('REPORT')} พื้นที่ระบาดใบด่างรายอำเภอ ${U.esc(DA.D.rep.cmd ? DA.D.rep.cmd.period : '')} · ${srcBadge('REPORT_EST')} รายตำบล</li>
      <li>${srcBadge('LDD')} ชั้นความเหมาะสมดิน: ตารางทางการรายอำเภอ + แผนที่ดิจิไทซ์ (คลาดเคลื่อนรวม 3–10%)</li>
      <li>${srcBadge('FLOOD')} ตำบลอุทกภัย 2563–2569 · ${srcBadge('PROJECT')} แปลงส่งเสริมพันธุ์ต้านทาน-ทนทาน</li></ul></div>`;
  }

  /* ----- CMD ----- */
  function cmdTableHtml() {
    const rows = DA.cmdMatrix(state.year, state.district);
    const uw = unitWord();
    return card2(`ตารางการจัดการโรคใบด่างราย${uw} ปี ${state.year}`, srcBadge('MODEL'), `<p class="hint">ดัชนี (0–100) = 50 × สัดส่วนระบาดต่อพื้นที่ยืนต้น (เต็มที่ 30%) + 30 × สัดส่วนพันธุ์อ่อนแอ (ค่อนข้างอ่อนแอนับครึ่ง) + 20 × การขาดพันธุ์ต้านทาน/ทนทาน (เป้า 30%)</p>
      <div class="table-wrap"><table class="risk" data-click><thead><tr><th>${uw}</th><th>ยืนต้น (ไร่)</th><th>ระบาด${state.district ? '*' : ''} (ไร่)</th><th>% ระบาด</th><th>ต้านทาน</th><th>ทนทาน</th><th>ค่อนข้างอ่อนแอ</th><th>อ่อนแอ</th><th>ดัชนี</th><th>ระดับ</th></tr></thead><tbody>${
      rows.map((r) => {
        const dim = state.risk !== 'all' && r.cmdLevel.key !== state.risk;
        return `<tr data-code="${r.code}" class="${state.tambon === r.code ? 'sel' : ''} ${dim ? 'dim' : ''}"><td>${U.esc(r.name)}</td><td>${U.fmt(r.standing ?? r.planted)}</td><td>${U.fmt(r.cmd)}</td><td>${U.pct(r.cmdPct)}</td>
          <td>${U.fmt(r.resistant)}</td><td>${U.fmt(r.tolerant)}</td><td>${U.fmt(r.modsus)}</td><td>${U.fmt(r.susceptible)}</td><td><span class="score">${r.cmdIndex ?? '–'}</span></td><td>${status(r.cmdLevel)}</td></tr>${actRow(r.code, 10, r.actions, dim)}`;
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
      <span>ท่อนพันธุ์ที่แจกจ่าย</span><b>${U.fmt(sum('cuttings'))} ท่อน</b><span>พันธุ์</span><b>${Object.entries(vt).sort((a, b) => b[1] - a[1]).map(([k, v]) => U.esc(k) + ' ' + U.fmt(v, 1) + ' ไร่').join(' · ')}</b>
      <span>พบอาการ CMD/SLCMV ในแปลงโครงการ</span><b>${U.fmt(sum('cmd'))} แปลง</b></div>
      <div class="table-wrap"><table class="risk" data-click><thead><tr><th>ตำบล</th><th>อำเภอ</th><th>แปลง</th><th>ไร่</th><th>ท่อนพันธุ์</th><th>พันธุ์</th><th>ระบบน้ำ</th><th>ระบาดในตำบล*</th></tr></thead><tbody>${
      rows.map((r) => `<tr data-code="${r.code}"><td>${U.esc(r.name)}</td><td class="l">${U.esc(r.dn)}</td><td>${r.plots}</td><td>${U.fmt(r.rai, 1)}</td><td>${U.fmt(r.cuttings)}</td>
        <td class="l">${Object.keys(r.varieties).map(U.esc).join(', ')}</td><td class="l">${Object.entries(r.irrigation).map(([k, v]) => U.esc(k.replace(/\s*\(.*\)/, '')) + ' ' + v).join(', ') || '–'}</td><td>${U.pct(cmdT[r.code])}</td></tr>`).join('')}</tbody></table></div>
      <p class="note">* สัดส่วนระบาดรายตำบลเป็นค่าประมาณจากรายงานรายอำเภอ · ไม่แสดงชื่อ/เบอร์โทรเกษตรกร</p>`);
  }
  function cmdRecHtml() {
    const a = DA.agg(state.year, f());
    const rows = DA.cmdMatrix(state.year, state.district).filter((r) => !r.minor);
    const top = rows.filter((r) => r.cmdLevel.key === 'critical' || r.cmdLevel.key === 'serious');
    const uw = state.district ? 'ต.' : 'อ.';
    const vlist = (k) => DA.allVarieties().filter((v) => DA.varietyClass(v) === k).map((v) => v.replace(/^พันธุ์\s*/, '')).join(', ') || '–';
    return `<div class="ins critical"><h4>🎯 พื้นที่เป้าหมายเร่งด่วน (${top.length})</h4>${top.length ? `<ul>${top.slice(0, 8).map((r) => `<li><b>${uw}${U.esc(r.name)}</b> ดัชนี ${r.cmdIndex} (${r.cmdLevel.label}) · ระบาด ${U.pct(r.cmdPct)} · อ่อนแอ ${U.pct(r.susceptiblePct)} · ต้านทาน+ทนทาน ${U.pct(r.resistPct)}</li>`).join('')}</ul><div class="chips">${top.map((r) => `<span class="chip" data-code="${r.code}">${uw}${U.esc(r.name)}</span>`).join('')}</div>` : '<p>ไม่มีพื้นที่ระดับสูง/วิกฤต</p>'}</div>
      <div class="ins"><h4>🛡️ แผนทดแทนพันธุ์ ${srcBadge('PARCEL')}</h4>${gapText(a)}</div>
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
      <div class="lp-item">${chk('disease.on', '🦠 การกระจายโรคใบด่าง <span class="badge src-est">ประมาณจากรายงาน</span>')}
        <div class="lp-sub"><label><input type="checkbox" data-l="disease.heat" ${L_.disease.heat ? 'checked' : ''}> Heatmap</label><label><input type="checkbox" data-l="disease.hotspots" ${L_.disease.hotspots ? 'checked' : ''}> Hotspot</label><label><input type="checkbox" data-l="disease.buffers" ${L_.disease.buffers ? 'checked' : ''}> รัศมี 5/10 กม.</label></div>${op('disease')}</div>
      <div class="lp-item">${chk('resist.on', '🛡️ พันธุ์ต้านทาน/ทนทาน + แปลงส่งเสริม')}${op('resist')}</div>
      <div class="lp-item">${chk('flood.on', '🌊 พื้นที่น้ำท่วมซ้ำซาก')}${op('flood')}</div>
      <div class="lp-item">${chk('soil.on', '🟫 ความเหมาะสมดิน S1–N <span class="badge src-real">LDD</span>')}${op('soil')}</div>
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
      <h3>โมดูล</h3><ul><li>📊 ภาพรวมผู้บริหาร — พื้นที่ปลูก ผลผลิต ความเสี่ยงรวม ข้อเสนอแนะเชิงนโยบาย</li><li>🦠 การจัดการโรคใบด่าง — เปรียบเทียบพื้นที่ปลูก/ระบาด/พันธุ์ต้านทาน-ทนทาน และชุดแผนที่ 4 แผ่น</li><li>🍂 รากเน่าโคนเน่า — ดัชนีความเสี่ยงรายตำบลจากน้ำท่วม ดิน และฤดูปลูก</li><li>🟫 ความเหมาะสมดิน — ชั้น S1–N ของกรมพัฒนาที่ดิน</li></ul>
      <h3>แหล่งข้อมูล</h3><ul>${['REGISTRY', 'REPORT', 'REPORT_EST', 'PROJECT', 'OFFICIAL', 'PARCEL', 'LDD', 'FLOOD', 'NETWORK'].map((k) => `<li>${srcBadge(k)} ${U.esc(C.SOURCES[k].note)}</li>`).join('')}</ul>
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
    $('lpClose').addEventListener('click', () => { $('layerPanel').classList.add('collapsed'); $('lpToggle').classList.remove('on'); });
    $('legend').addEventListener('click', (e) => { if (e.target.closest('[data-lgt]')) $('legend').classList.toggle('min'); });
    $('lpBody').addEventListener('change', (e) => {
      const t = e.target;
      if (t.name === 'base') { M.setBase(t.value); M.refresh(); return; }
      if (t.dataset.l) { set(t.dataset.l, t.checked); M.refresh(); return; }
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
      const seg = e.target.closest('#cmdSeg button');
      if (seg) { state.cmdMode = seg.dataset.mode; document.querySelectorAll('#cmdSeg button').forEach((x) => x.classList.toggle('on', x === seg)); CH.cmdCompare(state, state.cmdMode); return; }
      const chip = e.target.closest('.chip[data-code]');
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
    window.addEventListener('resize', () => { clearTimeout(window._rz); window._rz = setTimeout(() => M.map.invalidateSize(), 150); });
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
    setTimeout(() => { M.map.invalidateSize(); Object.values(CH.charts).forEach((c) => c.resize()); M.fitScope(); }, 250);
  }

  return { init, state, update, selectDistrict, selectTambon, setYear, setDisease, setModule, renderLayerPanel, showTab, activeTab, openAtlas };
})();

document.addEventListener('DOMContentLoaded', () => {
  try { KPP.App.init(); }
  catch (e) { console.error(e); document.body.insertAdjacentHTML('afterbegin', `<div style="padding:12px;background:#b42323;color:#fff">เริ่มระบบไม่สำเร็จ: ${KPP.U.esc(e.message)}</div>`); }
});
