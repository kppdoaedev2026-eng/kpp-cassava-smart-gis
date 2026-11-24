KPP.Map = (function () {
  const U = KPP.U, C = KPP.CONFIG, DA = KPP.Data;
  let map, base, baseKey = 'light', module = 'overview';
  const G = {};
  const L_ = {
    choro: { on: true, opacity: 0.8, metric: 'planted' },
    tambons: { on: true },
    villages: { on: false },
    parcels: { on: true },
    disease: { on: true, opacity: 0.9 },
    style: 'choro',
    resist: { on: false, opacity: 0.9 },
    flood: { on: true, opacity: 0.8 },
    soil: { on: false, opacity: 0.75 },
    series: { on: false, opacity: 0.55, by: 'fertility' },   // ชุดดิน LDD 1:25,000 (โหลดเมื่อเปิดชั้น)
    networks: { on: true, pest: true, soil: false, lc: true, farm: true }
  };
  const custom = [];
  let polysLoading = false;

  /* ---------- Color schemes (ColorBrewer, classed) ---------- */
  const RAMP = {
    YlGn: ['#ffffcc', '#c2e699', '#78c679', '#31a354', '#006837'],
    YlOrRd: ['#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#bd0026'],
    BuGn: ['#edf8fb', '#b2e2e2', '#66c2a4', '#2ca25f', '#006d2c'],
    YlOrBr: ['#ffffd4', '#fed98e', '#fe9929', '#d95f0e', '#993404'],
    Blues: ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c']
  };
  const pctF = (v) => U.pct(v);
  const METRICS = {
    planted: { label: 'พื้นที่ปลูก (ไร่)', short: 'พื้นที่ปลูก', ramp: 'YlGn', q: true, get: (u) => u.planted, fmt: (v) => U.fmt(v) },
    production: { label: 'ผลผลิต (ตัน)', short: 'ผลผลิต', ramp: 'YlGn', q: true, get: (u) => u.production, fmt: (v) => U.fmt(v) },
    yield: { label: 'ผลผลิตเฉลี่ย (กก./ไร่)', short: 'ผลผลิตต่อไร่', ramp: 'YlGn', q: true, get: (u) => u.yield, fmt: (v) => U.fmt(v) },
    cmd: { label: 'พื้นที่ระบาดใบด่าง (ไร่)', short: 'พื้นที่ระบาด', ramp: 'YlOrRd', q: true, get: (u) => u.cmd, fmt: (v) => U.fmt(v), dist: true },
    cmdPct: { label: 'สัดส่วนพื้นที่ระบาดใบด่าง (% พื้นที่ปลูก)', short: '% ระบาด', ramp: 'YlOrRd', breaks: [0.01, 0.05, 0.15, 0.30], get: (u) => u.cmdPct, fmt: pctF, dist: true },
    coverage: { label: 'ความครอบคลุมทะเบียน (ทะเบียน ÷ พื้นที่ปลูก)', short: '% ทะเบียน', ramp: 'Blues', breaks: [0.5, 0.7, 0.9, 1.0], get: (u) => u.coverage, fmt: pctF, dist: true },
    regGap: { label: 'พื้นที่ปลูกที่ยังไม่ขึ้นทะเบียน (ไร่)', short: 'ช่องว่างทะเบียน', ramp: 'YlOrBr', q: true, get: (u) => u.regGap, fmt: (v) => U.fmt(v), dist: true },
    resist: { label: 'พื้นที่พันธุ์ต้านทาน+ทนทาน (ไร่)', short: 'ต้านทาน+ทนทาน', ramp: 'BuGn', q: true, get: (u) => u.resist, fmt: (v) => U.fmt(v) },
    resistPct: { label: 'สัดส่วนพันธุ์ต้านทาน+ทนทาน', short: '% ต้านทาน+ทนทาน', ramp: 'BuGn', breaks: [0.01, 0.03, 0.05, 0.1], get: (u) => u.resistPct, fmt: pctF },
    cmdIndex: { label: 'ดัชนีความเร่งด่วนจัดการโรคใบด่าง (0–100)', short: 'ดัชนีจัดการ', level: 'cmdLevel', breaksTxt: ['< 20', '20–39', '40–59', '≥ 60'], get: (u) => u.cmdIndex, fmt: (v) => U.fmt(v) },
    risk: { label: 'ระดับความเสี่ยงรวม (0–100)', short: 'ความเสี่ยงรวม', level: 'level', breaksTxt: ['< 25', '25–39', '40–54', '≥ 55'], get: (u) => u.score, fmt: (v) => (U.isNum(v) ? v : '–') },
    rrIndex: { label: 'ดัชนีความเสี่ยงโรครากเน่าโคนเน่า (0–100)', short: 'ดัชนีรากเน่า', level: 'rrLevel', breaksTxt: ['< 35', '35–49', '50–61', '≥ 62'], get: (u) => u.rrIndex, fmt: (v) => U.fmt(v) },
    rrHighPct: { label: 'สัดส่วนแปลงเสี่ยงสูงรากเน่าโคนเน่า', short: '% แปลงเสี่ยงสูง', ramp: 'YlOrRd', breaks: [0.1, 0.25, 0.5, 0.75], get: (u) => u.rrHighPct, fmt: pctF },
    soilPoorPct: { label: 'สัดส่วนมันสำปะหลังบนดิน S3+N (LDD)', short: '% บนดิน S3+N', ramp: 'YlOrBr', breaks: [0.1, 0.25, 0.4, 0.6], get: (u) => u.soilPoorPct, fmt: pctF }
  };
  const MODULE_METRICS = {
    overview: ['planted', 'cmdPct', 'coverage', 'regGap', 'resistPct', 'risk', 'production', 'yield'],
    cmd: ['cmdPct', 'cmd', 'resist', 'cmdIndex', 'planted'],
    rootrot: ['rrIndex', 'rrHighPct', 'soilPoorPct'],
    soil: ['soilPoorPct', 'planted']
  };
  const NET = {
    pest: { label: 'ศจช. ศูนย์จัดการศัตรูพืชชุมชน', glyph: 'จ', color: '#6250d6', sq: false },
    soil: { label: 'ศดปช. ศูนย์จัดการดินปุ๋ยชุมชน', glyph: 'ด', color: '#a16207', sq: false },
    lc: { label: 'ศพก. ศูนย์เรียนรู้ฯ', glyph: 'ศ', color: '#2a78d6', sq: true },
    farm: { label: 'แปลงใหญ่มันสำปะหลัง', glyph: 'ป', color: '#008300', sq: true }
  };
  const VCOL = Object.fromEntries(C.VARIETY_CLASSES.map((v) => [v.key, v.color]));
  const VCODE2KEY = { 2: 'resistant', 1: 'tolerant', 0: 'general', '-1': 'susceptible' };
  const SOILCOL = ['#cbd5e1'].concat(C.SOIL_CLASSES.map((s) => s.color));
  const NA = '#e2e8f0';

  function init() {
    L.Popup.prototype.options.autoPanPaddingTopLeft = L.point(16, 70);
    L.Popup.prototype.options.autoPanPaddingBottomRight = L.point(16, 16);
    L.Popup.prototype.options.maxWidth = 340;
    map = L.map('map', { zoomControl: true, attributionControl: true, zoomSnap: 0.25, scrollWheelZoom: false }).setView(C.CENTER, C.ZOOM);
    // แผนที่เต็มหน้าจอ: ล้อเมาส์ใช้เลื่อนหน้าไปยังบทสรุป จนกว่าจะคลิกแผนที่ (หรือกด Ctrl ค้างไว้ขณะหมุนล้อ)
    map.on('click focus', () => map.scrollWheelZoom.enable());
    map.on('mouseout blur', () => map.scrollWheelZoom.disable());
    map.getContainer().addEventListener('wheel', (e) => {
      if (map.scrollWheelZoom.enabled() || !e.ctrlKey) return;
      e.preventDefault();
      map.setZoomAround(map.mouseEventToContainerPoint(e), map.getZoom() + (e.deltaY < 0 ? 0.5 : -0.5));
    }, { passive: false });
    [['choro', 380], ['soil', 390], ['flood', 400], ['outline', 420], ['parcels', 430], ['heat', 440], ['labels', 650]].forEach(([n, z]) => { map.createPane(n).style.zIndex = z; });
    map.getPane('labels').style.pointerEvents = 'none';
    map.getPane('heat').style.pointerEvents = 'none';
    G.floodRenderer = L.svg({ pane: 'flood' });
    G.parcelRenderer = L.canvas({ pane: 'parcels', padding: 0.2 });
    G.resistRenderer = L.canvas({ pane: 'parcels' });
    setBase('light');
    map.on('zoomend moveend', () => { drawParcels(); toggleTambonLabels(); });
    map.on('zoomend', () => { const hi = map.getZoom() >= 12; if (S && hi !== lastHi) { lastHi = hi; buildLegend(); } });
    map.on('click', onMapClick);
    G.floodRenderer.addTo(map);
    injectHatch(G.floodRenderer._container);
    loadSoilSampler();
    return map;
  }

  function injectHatch(svg) {
    if (!svg || svg.querySelector('#kpp-hatch')) return;
    const ns = 'http://www.w3.org/2000/svg';
    const defs = document.createElementNS(ns, 'defs');
    [['kpp-hatch', 6, 1.6], ['kpp-hatch-hi', 4, 2]].forEach(([id, size, w]) => {
      const p = document.createElementNS(ns, 'pattern');
      p.setAttribute('id', id); p.setAttribute('patternUnits', 'userSpaceOnUse');
      p.setAttribute('width', size); p.setAttribute('height', size); p.setAttribute('patternTransform', 'rotate(45)');
      const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', 0); l.setAttribute('y1', 0); l.setAttribute('x2', 0); l.setAttribute('y2', size);
      l.setAttribute('stroke', '#1d4ed8'); l.setAttribute('stroke-width', w);
      p.appendChild(l); defs.appendChild(p);
    });
    svg.insertBefore(defs, svg.firstChild);
  }

  function setBase(key) {
    const b = C.BASEMAPS[key];
    if (base) map.removeLayer(base);
    base = L.tileLayer(b.url, { attribution: b.attr, subdomains: b.sub || 'abc', maxZoom: b.maxZoom || 19, crossOrigin: 'anonymous' }).addTo(map);
    baseKey = key;
    document.querySelectorAll('#map .dlabel').forEach((el) => el.classList.toggle('dark', key === 'dark' || key === 'sat'));
  }

  /* ---------- module presets ---------- */
  function setModule(m) {
    module = m;
    const metrics = MODULE_METRICS[m];
    if (!metrics.includes(L_.choro.metric)) L_.choro.metric = metrics[0];
    Object.assign(L_.disease, { on: m === 'overview' || m === 'cmd' });
    L_.flood.on = m === 'overview' || m === 'rootrot';
    L_.soil.on = m === 'soil';
    L_.resist.on = m === 'cmd';
    L_.choro.on = m !== 'soil';
    L_.choro.opacity = m === 'soil' ? 0.55 : 0.8;
    L_.networks.on = true;
    Object.assign(L_.networks, { pest: true, soil: m === 'soil', lc: m === 'overview', farm: m !== 'rootrot' });
  }
  const tambonLevel = () => module === 'rootrot' || module === 'soil';

  /* ---------- classification ---------- */
  function niceRound(v) {
    if (!U.isNum(v) || v === 0) return v;
    const p = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 1);
    return Math.round(v / p) * p;
  }
  function quantileBreaks(values, n = 5) {
    const v = values.filter(U.isNum).sort((a, b) => a - b);
    if (v.length < 2) return [];
    const br = [];
    for (let i = 1; i < n; i++) br.push(niceRound(v[Math.min(v.length - 1, Math.floor((i / n) * v.length))]));
    return [...new Set(br)].filter((b) => b > v[0]);
  }
  function classify(metricKey, units) {
    const m = METRICS[metricKey];
    if (m.level) return { m, color: (u) => (u[m.level] || {}).color || NA, classes: DA.LV4.map((l, i) => ({ color: l.color, label: `${l.icon} ${l.label} (${m.breaksTxt[i]})` })).reverse() };
    const breaks = m.breaks || quantileBreaks(units.map(m.get));
    const cols = RAMP[m.ramp];
    const nCls = breaks.length + 1;
    const pal = nCls >= 5 ? cols : cols.slice(5 - nCls);
    const idx = (v) => { let i = 0; while (i < breaks.length && v >= breaks[i]) i++; return i; };
    const classes = pal.map((c, i) => ({
      color: c,
      label: i === 0 ? `< ${m.fmt(breaks[0])}` : i === breaks.length ? `≥ ${m.fmt(breaks[i - 1])}` : `${m.fmt(breaks[i - 1])} – < ${m.fmt(breaks[i])}`
    })).reverse();
    if (!breaks.length) return { m, color: (u) => (U.isNum(m.get(u)) ? cols[2] : NA), classes: [{ color: cols[2], label: 'มีข้อมูล' }] };
    return { m, color: (u) => { const v = m.get(u); return U.isNum(v) ? pal[idx(v)] : NA; }, classes };
  }

  /* ---------- Bivariate (3×3) ---------- */
  const BIV_COLORS = [['#e8e8e8', '#e4acac', '#c85a5a'], ['#b0d5df', '#ad9ea5', '#985356'], ['#64acbe', '#627f8c', '#574249']];
  const BIVAR = {
    overview: { x: { label: '% ระบาดใบด่าง', get: (u) => u.cmdPct, br: [0.05, 0.15], fmt: pctF }, y: { label: '% ต้านทาน+ทนทาน', get: (u) => u.resistPct, br: [0.01, 0.05], fmt: pctF } },
    cmd: { x: { label: '% ระบาดใบด่าง', get: (u) => u.cmdPct, br: [0.05, 0.15], fmt: pctF }, y: { label: '% ต้านทาน+ทนทาน', get: (u) => u.resistPct, br: [0.01, 0.05], fmt: pctF } },
    rootrot: { x: { label: 'คะแนนน้ำท่วมซ้ำซาก', get: (u) => (u.rrParts ? u.rrParts.flood : null), br: [15, 30], fmt: (v) => U.fmt(v) }, y: { label: '% ปลูกบนดิน S3+N', get: (u) => u.soilPoorPct, br: [0.25, 0.5], fmt: pctF } }
  };
  const tri = (v, br) => (v < br[0] ? 0 : v < br[1] ? 1 : 2);
  function bivarColor(u) {
    const b = BIVAR[module]; if (!b || !u) return NA;
    const x = b.x.get(u), y = b.y.get(u);
    if (!U.isNum(x) || !U.isNum(y)) return NA;
    return BIV_COLORS[tri(y, b.y.br)][tri(x, b.x.br)];
  }
  function drawSymbols() {
    if (G.sym) { map.removeLayer(G.sym); G.sym = null; }
    if (!L_.choro.on || (L_.style !== 'bubble' && L_.style !== 'label')) return;
    G.sym = L.layerGroup().addTo(map);
    const m = METRICS[L_.choro.metric];
    const vals = units.map((u) => m.get(u)).filter((v) => U.isNum(v) && v > 0);
    const max = Math.max(...vals, 1e-9);
    units.forEach((u) => {
      const v = m.get(u); if (!U.isNum(v)) return;
      const c = u.code.length === 4 ? (() => { const b = L.geoJSON(DA.D.dByCode[u.code].feature).getBounds().getCenter(); return [b.lat, b.lng]; })() : DA.D.centroid[u.code];
      if (!c) return;
      if (L_.style === 'bubble') {
        const r = 4 + 30 * Math.sqrt(Math.max(v, 0) / max);
        L.circleMarker(c, { pane: 'outline', radius: r, color: '#ffffff', weight: 1.5, fillColor: scheme.color(u), fillOpacity: 0.88 })
          .bindTooltip(() => unitTooltip(u.code, u.code.length === 6), { sticky: true, direction: 'top' })
          .on('click', () => (u.code.length === 6 ? KPP.App.selectTambon(u.code) : KPP.App.selectDistrict(u.code))).addTo(G.sym);
      } else {
        L.marker(c, { pane: 'labels', interactive: false, icon: L.divIcon({ className: 'vlabel', html: `<div class="vl"><b>${m.fmt(v)}</b><span>${U.esc(u.name)}</span></div>`, iconSize: null }) }).addTo(G.sym);
      }
    });
  }

  /* ---------- main render ---------- */
  let S = null, units = [], unitsByCode = {}, scheme = null, lastHi = false;
  function computeUnits(metricKey, st = S) {
    let us;
    if (tambonLevel() && !st.district) us = DA.allTambons(st.year);
    else us = st.district ? DA.byTambon(st.year, st.district) : DA.byDistrict(st.year);
    if (metricKey === 'risk') {
      const rm = DA.riskMatrix(st.year, st.district); const by = {}; rm.forEach((r) => { by[r.code] = r; });
      us.forEach((u) => { const r = by[u.code]; if (r) { u.score = r.score; u.level = r.level.key === 'na' ? { key: 'na', label: 'พื้นที่ปลูกน้อย', icon: '–', color: NA } : r.level; } });
    }
    return us;
  }
  function render(state) {
    S = state;
    units = computeUnits(L_.choro.metric);
    unitsByCode = {}; units.forEach((u) => { unitsByCode[u.code] = u; });
    scheme = classify(L_.choro.metric, units.filter((u) => !(U.isNum(u.planted) && u.planted < 50 && L_.choro.metric !== 'planted')));
    drawProvince();
    drawChoropleth();
    drawSymbols();
    drawTambonOutline();
    drawFlood();
    drawSoil();
    drawSoilSeries();
    drawDisease();
    drawResist();
    drawProjects();
    drawNetworks();
    drawVillages();
    drawParcels(true);
    drawLabels();
    buildLegend();
    renderMetricSwitch();
  }

  function renderMetricSwitch() {
    const el = document.getElementById('metricSwitch');
    const ms = MODULE_METRICS[module];
    el.innerHTML = ms.map((k) => `<button data-metric="${k}" class="${L_.choro.metric === k ? 'on' : ''}">${METRICS[k].short}</button>`).join('')
      + (module === 'cmd' ? '<button class="atlas-btn" data-atlas>🗺️ ชุดแผนที่ 4 แผ่น</button>' : '');
    const st = document.getElementById('mapStyle');
    if (st) {
      const opts = [['choro', 'ระบายสี'], ['bubble', 'วงกลมสัดส่วน'], ['label', 'ตัวเลขบนแผนที่']].concat(BIVAR[module] ? [['bivar', 'สองตัวแปร']] : []);
      if (!opts.some((o) => o[0] === L_.style)) L_.style = 'choro';
      st.innerHTML = opts.map(([k, l]) => `<option value="${k}" ${L_.style === k ? 'selected' : ''}>${l}</option>`).join('');
    }
  }

  function drawProvince() {
    if (G.province) return;
    G.province = L.geoJSON(window.KPP_GEO.province, { pane: 'outline', interactive: false, style: { color: '#D97706', weight: 4, fill: false, opacity: 0.95 } }).addTo(map);
    G.provinceInner = L.geoJSON(window.KPP_GEO.province, { pane: 'outline', interactive: false, style: { color: '#065F46', weight: 1.5, fill: false, opacity: 0.9 } }).addTo(map);
  }

  function unitStyle(code, isTambon) {
    const u = unitsByCode[code];
    const fill = u ? (L_.style === 'bivar' ? bivarColor(u) : scheme.color(u)) : NA;
    const faint = L_.style === 'bubble';
    const sel = isTambon ? S.tambon === code : S.district === code;
    const lv = u && (u.cmdLevel && L_.choro.metric === 'cmdIndex' ? u.cmdLevel : u.rrLevel && L_.choro.metric.startsWith('rr') ? u.rrLevel : u.level);
    const riskDim = S.risk !== 'all' && u && (!lv || lv.key !== S.risk);
    return {
      pane: 'choro', color: sel ? '#D97706' : isTambon ? '#64748b' : '#065F46', weight: sel ? 3.5 : isTambon ? 0.8 : 1.6,
      fillColor: faint ? '#e2e8f0' : fill, fillOpacity: L_.choro.on ? (riskDim ? 0.06 : faint ? 0.25 : L_.choro.opacity) : 0,
      opacity: riskDim ? 0.35 : 0.9
    };
  }

  function drawChoropleth() {
    ['choro', 'ctxDistricts'].forEach((k) => { if (G[k]) { map.removeLayer(G[k]); G[k] = null; } });
    const G_ = window.KPP_GEO;
    if (S.district) {
      G.ctxDistricts = L.geoJSON(G_.districts, { pane: 'choro',
        style: (f) => ({ color: '#065F46', weight: f.properties.code === S.district ? 3 : 1, fillColor: '#94a3b8', fillOpacity: f.properties.code === S.district ? 0 : 0.16, opacity: 0.7 }),
        onEachFeature: (f, l) => { if (f.properties.code !== S.district) l.on('click', (e) => { L.DomEvent.stopPropagation(e); KPP.App.selectDistrict(f.properties.code); }); }
      }).addTo(map);
    }
    const isT = tambonLevel() || !!S.district;
    const feats = isT ? (S.district ? (DA.D.tambonsByDistrict[S.district] || []).map((t) => t.feature) : G_.tambons.features) : G_.districts.features;
    G.choro = L.geoJSON({ type: 'FeatureCollection', features: feats }, {
      style: (f) => unitStyle(f.properties.code, isT),
      onEachFeature: (f, l) => bindUnit(f, l, isT)
    }).addTo(map);
    if (isT && !S.district) {
      G.ctxDistricts = L.geoJSON(G_.districts, { pane: 'outline', interactive: false, style: { color: '#065F46', weight: 1.8, fill: false, opacity: 0.9 } }).addTo(map);
    }
  }

  function bindUnit(f, layer, isTambon) {
    const code = f.properties.code;
    layer.on('mouseover', () => { layer.setStyle({ weight: 3, color: '#D97706' }); layer.bringToFront(); });
    layer.on('mouseout', () => { if (G.choro) G.choro.resetStyle(layer); });
    layer.on('click', (e) => {
      if (module === 'soil' && L_.soil.on) return;
      L.DomEvent.stopPropagation(e);
      if (isTambon) KPP.App.selectTambon(code); else KPP.App.selectDistrict(code);
    });
    layer.bindTooltip(() => unitTooltip(code, isTambon), { sticky: true, direction: 'top', opacity: 0.97 });
  }

  function unitTooltip(code, isTambon) {
    const u = unitsByCode[code];
    const name = isTambon ? (DA.D.tambons[code] || {}).name : (DA.D.dByCode[code] || {}).name;
    const dn = isTambon ? (DA.D.dByCode[code.slice(0, 4)] || {}).name : '';
    if (!u) return '<b>' + U.esc(name) + '</b>';
    const m = METRICS[L_.choro.metric];
    const rows = [[m.label, m.fmt(m.get(u))]];
    if (module === 'cmd') rows.push(['พื้นที่ปลูก / ทะเบียน', `${U.fmt(u.standing)} / ${U.fmt(u.planted)} ไร่`], ['ระบาดใบด่าง', U.isNum(u.cmd) ? `${U.fmt(u.cmd)} ไร่ (${U.pct(u.cmdPct)})${u.cmdFarmers ? ' · ' + U.fmt(u.cmdFarmers) + ' ราย' : ''}` : 'ยังไม่มีผลสำรวจรายตำบล'], ['แปลงส่งเสริมพันธุ์', u.projPlots ? `${u.projPlots} แปลง · ${U.fmt(u.projRai, 1)} ไร่` : '–'], ['ต้านทาน / ทนทาน', `${U.fmt(u.resistant)} / ${U.fmt(u.tolerant)} ไร่`], ['ทั่วไป / อ่อนแอ', `${U.fmt(u.general)} / ${U.fmt(u.susceptible)} ไร่`], ['ระดับการจัดการ', lvl(u.cmdLevel)]);
    else if (module === 'rootrot') rows.push(['พื้นที่ปลูก (ทะเบียน)', U.fmt(u.regPlanted) + ' ไร่'], ['ระดับความเสี่ยง', lvl(u.rrLevel)], ['ปัจจัย น้ำท่วม/ดิน/ฤดูฝน', u.rrParts ? `${U.fmt(u.rrParts.flood)} / ${U.fmt(u.rrParts.soil)} / ${U.fmt(u.rrParts.rain)}` : '–'], ['ปลูกบนดิน S3+N', U.pct(u.soilPoorPct)], ['ปลูกช่วงฤดูฝน', U.pct(u.rainyPct)]);
    else if (module === 'soil') rows.push(['มันฯ บนดิน S1/S2', `${U.fmt(u.soil_S1)} / ${U.fmt(u.soil_S2)} ไร่`], ['มันฯ บนดิน S3/N', `${U.fmt(u.soil_S3)} / ${U.fmt(u.soil_N)} ไร่`], ['นอกพื้นที่ประเมิน', U.fmt(u.soil_none) + ' ไร่']);
    else rows.push(['พื้นที่ปลูก (ทะเบียน)', U.fmt(u.planted) + ' ไร่' + (u.hh ? ` · ${U.fmt(u.hh)} ครัวเรือน` : '')], ['ผลผลิต', U.fmt(u.production) + ' ตัน'], ['ผลผลิตเฉลี่ย', U.fmt(u.yield) + ' กก./ไร่'], ['ระบาดใบด่าง', U.isNum(u.cmd) ? `${U.fmt(u.cmd)} ไร่ (${U.pct(u.cmdPct)})` : '–'], ['ทะเบียน/พื้นที่ปลูก', U.pct(u.coverage)], ['ต้านทาน+ทนทาน', `${U.fmt(u.resist)} ไร่ (${U.pct(u.resistPct)})`], ['ทับซ้อนน้ำท่วมซ้ำซาก', U.fmt(u.flood) + ' ไร่']);
    return `<div class="pp"><h4>${isTambon ? 'ต.' : 'อ.'}${U.esc(name)}${dn ? ' <small>อ.' + U.esc(dn) + '</small>' : ''}</h4><table>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>
      <div class="hint">${(module === 'cmd' || module === 'overview') && u.src.disease ? 'ใบด่าง: ' + (C.SOURCES[u.src.disease] || {}).label + ' · ' : ''}% พันธุ์คิดจากผังแปลงดิจิทัล · คลิกเพื่อเจาะลึก</div></div>`;
  }
  const lvl = (l) => (l ? `<span class="status ${l.key}"><i>${l.icon}</i>${l.label}</span>` : '–');

  function drawTambonOutline() {
    if (G.tambonOutline) { map.removeLayer(G.tambonOutline); G.tambonOutline = null; }
    if (!L_.tambons.on || S.district || tambonLevel()) return;
    G.tambonOutline = L.geoJSON(window.KPP_GEO.tambons, { pane: 'outline', interactive: false,
      style: { color: '#64748b', weight: 0.6, fill: false, opacity: 0.55, dashArray: '2 3' } }).addTo(map);
  }

  function drawLabels() {
    if (G.labels) map.removeLayer(G.labels);
    G.labels = L.layerGroup().addTo(map);
    const dark = baseKey === 'dark' || baseKey === 'sat';
    if (S.district) {
      (DA.D.tambonsByDistrict[S.district] || []).forEach((t) => {
        const c = DA.D.centroid[t.code];
        if (c) L.marker(c, { pane: 'labels', interactive: false, icon: L.divIcon({ className: 'dlabel tlabel' + (dark ? ' dark' : ''), html: U.esc(t.name), iconSize: null }) }).addTo(G.labels);
      });
    } else {
      DA.D.districts.forEach((d) => {
        const b = L.geoJSON(d.feature).getBounds().getCenter();
        L.marker(b, { pane: 'labels', interactive: false, icon: L.divIcon({ className: 'dlabel' + (dark ? ' dark' : ''), html: U.esc(d.name), iconSize: null }) }).addTo(G.labels);
      });
    }
    toggleTambonLabels();
  }
  function toggleTambonLabels() {
    const z = map.getZoom();
    document.querySelectorAll('#map .tlabel').forEach((el) => { el.style.display = z >= 10 ? '' : 'none'; });
  }

  /* ---------- Layer 4: Flood ---------- */
  function drawFlood() {
    if (G.flood) { map.removeLayer(G.flood); G.flood = null; }
    if (!L_.flood.on) return;
    const op = L_.flood.opacity;
    if (DA.D.flood.polygons) {
      const fc = { type: 'FeatureCollection', features: DA.D.flood.polygons.map((p) => ({ type: 'Feature', properties: {}, geometry: p.geometry })) };
      G.flood = L.geoJSON(fc, { renderer: G.floodRenderer, pane: 'flood', interactive: false,
        style: { color: '#1d4ed8', weight: 1.2, fillColor: 'url(#kpp-hatch-hi)', fillOpacity: op, opacity: op } }).addTo(map);
      return;
    }
    const feats = window.KPP_GEO.tambons.features.filter((f) => {
      const ft = DA.D.flood.byTambon[f.properties.code];
      return ft && ft.level > 0 && (!S.district || f.properties.district_code === S.district);
    });
    G.flood = L.geoJSON({ type: 'FeatureCollection', features: feats }, {
      renderer: G.floodRenderer, pane: 'flood', interactive: module !== 'rootrot',
      style: (f) => {
        const ft = DA.D.flood.byTambon[f.properties.code];
        return { color: '#1d4ed8', weight: ft.level === 2 ? 1.6 : 0.9, fillColor: ft.level === 2 ? 'url(#kpp-hatch-hi)' : 'url(#kpp-hatch)', fillOpacity: op * (module === 'rootrot' ? 0.6 : 1), opacity: op * 0.9 };
      },
      onEachFeature: (f, l) => l.bindPopup(() => floodPopup(f.properties.code))
    }).addTo(map);
    injectHatch(G.floodRenderer._container);
  }
  function floodPopup(tcode) {
    const ft = DA.D.flood.byTambon[tcode], t = DA.D.tambons[tcode];
    const u = DA.agg(S.year, { tambon: tcode });
    return `<div class="pp"><h4>🌊 ต.${U.esc(t.name)} อ.${U.esc((DA.D.dByCode[t.district_code] || {}).name)}</h4><table>
      <tr><td>ปีที่เกิดอุทกภัย</td><td>${ft.yearList.join(', ')} (${ft.nYears} ปี)</td></tr>
      <tr><td>ระดับ</td><td>${ft.level === 2 ? 'ซ้ำซากสูง (≥3 ปี)' : 'ซ้ำซาก (2 ปี)'}</td></tr>
      <tr><td>พืชไร่เสียหายเฉลี่ย/ปีที่เกิดภัย</td><td>${U.fmt(ft.avgField)} ไร่</td></tr>
      <tr><td>เงินช่วยเหลือสะสม</td><td>${U.fmt(ft.aid)} บาท</td></tr>
      <tr><td>มันสำปะหลังในตำบล (2569)</td><td>${U.fmt(ft.cassavaRai)} ไร่</td></tr>
      <tr><td>ประมาณพื้นที่ทับซ้อน</td><td>${U.fmt(u.flood)} ไร่</td></tr>
      <tr><td>อายุ &lt; ${C.EARLY_HARVEST_MIN_MONTHS} เดือน ณ ช่วงน้ำหลาก</td><td>${U.fmt(u.early)} ไร่</td></tr>
    </table><div class="pp-src"><span class="badge src-real" title="${U.esc(C.SOURCES.FLOOD.note)}">${C.SOURCES.FLOOD.label}</span></div></div>`;
  }

  /* ---------- LDD soil suitability (real, digitized) ---------- */
  let soilCanvas = null;
  function loadSoilSampler() {
    if (!window.KPP_LDD) return;
    const img = new Image();
    img.onload = () => {
      soilCanvas = document.createElement('canvas');
      soilCanvas.width = img.width; soilCanvas.height = img.height;
      soilCanvas.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
    };
    img.src = 'assets/ldd_cassava_suitability.png';
  }
  function soilAt(ll) {
    if (!soilCanvas || !window.KPP_LDD) return null;
    const [[s, w], [n, e]] = window.KPP_LDD.bounds;
    if (ll.lat < s || ll.lat > n || ll.lng < w || ll.lng > e) return null;
    const x = Math.floor((ll.lng - w) / (e - w) * soilCanvas.width), y = Math.floor((n - ll.lat) / (n - s) * soilCanvas.height);
    const d = soilCanvas.getContext('2d').getImageData(x, y, 1, 1).data;
    if (d[3] < 128) return 0;
    let best = 0, bd = 1e9;
    C.SOIL_CLASSES.forEach((c, i) => {
      const h = c.color, r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
      const dd = (r - d[0]) ** 2 + (g - d[1]) ** 2 + (b - d[2]) ** 2;
      if (dd < bd) { bd = dd; best = i + 1; }
    });
    return best;
  }
  function onMapClick(e) {
    if (!L_.soil.on || !window.KPP_LDD || custom.some((c) => c.role === 'soil')) return;
    const k = soilAt(e.latlng);
    if (k === null) return;
    const cls = k ? C.SOIL_CLASSES[k - 1] : null;
    L.popup().setLatLng(e.latlng).setContent(`<div class="pp"><h4>ความเหมาะสมของดินสำหรับมันสำปะหลัง</h4>
      ${cls ? `<p><span class="sw" style="display:inline-block;background:${cls.color}"></span> <b>${cls.label}</b></p>` : '<p>นอกพื้นที่ประเมิน (ป่าไม้/พื้นที่อื่น)</p>'}
      <div class="hint">พิกัด ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}</div>
      <div class="pp-src"><span class="badge src-real" title="${U.esc(C.SOURCES.LDD.note)}">LDD Agri-Map</span></div></div>`).openOn(map);
  }
  function drawSoil() {
    if (G.soil) { map.removeLayer(G.soil); G.soil = null; }
    if (!L_.soil.on || custom.some((c) => c.role === 'soil') || !window.KPP_LDD) return;
    G.soil = L.imageOverlay('assets/ldd_cassava_suitability.png', window.KPP_LDD.bounds, { pane: 'soil', opacity: L_.soil.opacity, interactive: false, className: 'soil-img' }).addTo(map);
  }

  /* ---------- ชุดดิน กรมพัฒนาที่ดิน (1:25,000) — โหลดไฟล์ data/ldd_soilseries.js เมื่อเปิดชั้นครั้งแรก ---------- */
  const FERT = { 'สูง': '#1a9850', 'ปานกลาง': '#a6d96a', 'ต่ำ': '#fdae61' };
  const PH_STEPS = [['กรดจัดมาก', '#d7301f', 'กรดจัดมาก (4.5–5.0)'], ['กรดจัด', '#fc8d59', 'กรดจัด (5.1–5.5)'], ['กรดปานกลาง', '#fee08b', 'กรดปานกลาง (5.6–6.0)'],
    ['กรดเล็กน้อย', '#d9ef8b', 'กรดเล็กน้อย (6.1–6.5)'], ['เป็นกลาง', '#91cf60', 'เป็นกลาง (6.6–7.3)'], ['ด่าง', '#4575b4', 'ด่าง (> 7.3)']];
  const phStep = (t) => { t = String(t || ''); const i = PH_STEPS.findIndex(([k]) => t.startsWith(k)); return i; };
  const SGPAL = ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5', '#bc80bd', '#ccebc5', '#ffed6f', '#d9d9d9'];
  let seriesLoading = false;
  function seriesColor(u) {
    if (!u) return NA;
    if (L_.series.by === 'ph') { const i = phStep(u.ph); return i < 0 ? NA : PH_STEPS[i][1]; }
    if (L_.series.by === 'group') return u.group === '62' ? '#bdbdbd' : SGPAL[(+u.group || 0) % SGPAL.length];
    return FERT[u.fertility] || NA;
  }
  function seriesPopup(u) {
    const row = (k, v) => (v ? `<tr><td>${k}</td><td>${U.esc(v)}</td></tr>` : '');
    return `<div class="pp"><h4>ชุดดิน${U.esc(u.name)} (${U.esc(u.code)})</h4><table>${row('กลุ่มชุดดิน', u.group === '62' ? '62 (พื้นที่ลาดชันเชิงซ้อน)' : u.group)}${row('เนื้อดินบน', u.texture)}${row('เนื้อดินล่าง (กลุ่มชุดดิน)', u.tex_low)}
      ${row('ความอุดมสมบูรณ์ดินบน', u.fertility)}${row('ปฏิกิริยาดินบน', u.ph)}${row('pH ดินบน / ดินล่าง (กลุ่มชุดดิน)', u.ph_range_top ? u.ph_range_top + ' / ' + (u.ph_range_low || '–') : '')}
      ${row('พื้นที่ชุดดินนี้ทั้งจังหวัด', U.fmt(u.rai) + ' ไร่')}</table>
      <div class="hint">ค่าประจำหน่วยแผนที่ดินจากการสำรวจ ไม่ใช่ผลวิเคราะห์ดินรายแปลง — ควรเก็บตัวอย่างดินส่งวิเคราะห์ก่อนใส่ปุ๋ย</div>
      <div class="pp-src"><span class="badge src-real" title="${U.esc(C.SOURCES.LDDSOIL.note)}">${U.esc(C.SOURCES.LDDSOIL.label)}</span></div></div>`;
  }
  function drawSoilSeries() {
    if (G.series) { map.removeLayer(G.series); G.series = null; }
    if (!L_.series.on) return;
    const SS = window.KPP_SOILSERIES;
    if (!SS) {
      if (seriesLoading) return;
      seriesLoading = true;
      const sc = document.createElement('script');
      sc.src = 'data/ldd_soilseries.js?v=' + C.VERSION;
      sc.onload = () => { seriesLoading = false; drawSoilSeries(); buildLegend(); };
      sc.onerror = () => { seriesLoading = false; U.toast('โหลดชั้นชุดดินไม่สำเร็จ', 'err'); };
      document.head.appendChild(sc);
      return;
    }
    if (!G.seriesRenderer) G.seriesRenderer = L.canvas({ pane: 'soil', padding: 0.3 });
    const op = L_.series.opacity;
    G.series = L.geoJSON(SS.geojson, {
      renderer: G.seriesRenderer, pane: 'soil',
      style: (f) => ({ color: '#57534e', weight: 0.4, opacity: 0.6, fillColor: seriesColor(SS.units[f.properties.u]), fillOpacity: op }),
      onEachFeature: (f, layer) => layer.on('click', (e) => { L.DomEvent.stopPropagation(e); L.popup().setLatLng(e.latlng).setContent(seriesPopup(SS.units[f.properties.u])).openOn(map); })
    }).addTo(map);
  }
  function seriesLegend() {
    const by = L_.series.by;
    const items = by === 'ph' ? PH_STEPS.map(([, c, l]) => ({ color: c, label: l })) : by === 'group' ? [{ color: SGPAL[1], label: 'สีตามกลุ่มชุดดิน (คลิกดูรายละเอียด)' }, { color: '#bdbdbd', label: 'กลุ่ม 62 พื้นที่ลาดชันเชิงซ้อน' }]
      : Object.entries(FERT).map(([k, c]) => ({ color: c, label: 'ความอุดมสมบูรณ์' + k })).concat([{ color: NA, label: 'ไม่ประเมิน (พื้นที่ลาดชัน/อื่นๆ)' }]);
    return `<h4>🟤 ชุดดิน LDD 1:25,000 · ${by === 'ph' ? 'ปฏิกิริยาดินบน' : by === 'group' ? 'กลุ่มชุดดิน' : 'ความอุดมสมบูรณ์ดินบน'}</h4>${legendClasses(items)}${window.KPP_SOILSERIES ? '' : '<div class="hint">กำลังโหลด…</div>'}<div class="hint">คลิกพื้นที่เพื่อดูชุดดิน</div>`;
  }

  /* ---------- Layer 2: CMD — รายงานจริงรายอำเภอ (จุดสรุป) ---------- */
  function inScope(i) {
    const P = DA.D.P;
    return S.tambon ? P.tcode[i] === S.tambon : S.district ? P.dcode[i] === S.district : true;
  }
  function drawDisease() {
    if (G.hot) { map.removeLayer(G.hot); G.hot = null; }
    const rep = DA.D.rep.cmd;
    if (!L_.disease.on || !rep || S.year !== 2569) return;
    G.hot = L.layerGroup().addTo(map);
    const max = Math.max(...Object.values(rep.districts).map((d) => d.now.total.rai), 1);
    Object.entries(rep.districts).forEach(([dc, d]) => {
      if (S.district && dc !== S.district) return;
      const rai = d.now.total.rai; if (!(rai > 0)) return;
      const pct = d.standing.total.rai ? rai / d.standing.total.rai : 0;
      const lv = DA.severity(pct);
      const sz = Math.round(22 + 46 * Math.sqrt(rai / max));
      const c = DA.D.centroid[dc];
      L.marker(c, { zIndexOffset: 700, icon: L.divIcon({ className: '', html: `<div class="cmd-mark ${lv.key}" style="width:${sz}px;height:${sz}px"><b>${U.pct(pct, 0)}</b></div>`, iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] }) })
        .bindPopup(() => cmdPopup(dc)).addTo(G.hot);
    });
  }
  function cmdPopup(dc) {
    const rep = DA.D.rep.cmd, d = rep.districts[dc];
    const ages = [['lt3', '< 3 เดือน'], ['m3_5', '3–5 เดือน'], ['m6_8', '6–8 เดือน'], ['gt8', '> 8 เดือน']];
    const hist = (DA.D.rep.cmd_history || []).filter((h) => h.districts[dc]);
    const prev = hist.length > 1 ? hist[hist.length - 2].districts[dc] : null;
    const diff = prev ? d.now.total.rai - prev.cmd : null;
    return `<div class="pp"><h4>🦠 อ.${U.esc(DA.D.dByCode[dc].name)} · โรคใบด่าง</h4><table>
      <tr><td>พื้นที่ระบาด</td><td><b>${U.fmt(d.now.total.rai)}</b> ไร่ (${U.pct(U.safeDiv(d.now.total.rai, d.standing.total.rai))})</td></tr>
      <tr><td>เกษตรกรได้รับผลกระทบ</td><td>${U.fmt(d.now.total.farmers)} ราย</td></tr>
      <tr><td>พื้นที่ปลูก</td><td>${U.fmt(d.standing.total.rai)} ไร่</td></tr>
      ${ages.map(([k, l]) => `<tr><td>อายุ ${l}</td><td>${U.fmt(d.now[k].rai)} ไร่</td></tr>`).join('')}
      <tr><td>เทียบรอบก่อน</td><td>${diff === null ? (d.trend ? U.esc(d.trend) : '–') : (diff > 0 ? '▲ +' : diff < 0 ? '▼ ' : '') + U.fmt(diff) + ' ไร่'}</td></tr>
      <tr><td>ตรวจสอบแล้ว</td><td>${U.esc(d.checked || '–')}</td></tr></table>
      <div class="pp-src"><span class="badge src-real" title="${U.esc(C.SOURCES.REPORT.note)}">รายงานระบาด ${U.esc(rep.period.replace(/วัน\S+ที่ /g, ''))}</span></div></div>`;
  }

  /* ---------- Layer 3: Resistant / tolerant ---------- */
  function drawResist() {
    if (G.resist) { map.removeLayer(G.resist); G.resist = null; }
    if (!L_.resist.on) return;
    const P = DA.D.P;
    G.resist = L.layerGroup().addTo(map);
    for (let i = 0; i < P.n; i++) {
      if (P.res[i] < 1 || !inScope(i)) continue;
      L.circleMarker([P.lat[i], P.lng[i]], { renderer: G.resistRenderer, radius: Math.max(3.5, Math.min(9, Math.sqrt(P.rai[i]) * 1.2)), color: '#fff', weight: 1.2, fillColor: P.res[i] === 2 ? VCOL.resistant : VCOL.tolerant, fillOpacity: L_.resist.opacity })
        .bindPopup(() => parcelPopup(i)).addTo(G.resist);
    }
  }

  function drawProjects() {
    if (G.proj) { map.removeLayer(G.proj); G.proj = null; }
    const rp = DA.D.rep.resist_plots;
    if (!L_.resist.on || !rp) return;
    G.proj = L.layerGroup().addTo(map);
    Object.entries(rp.tambons).forEach(([tc, t]) => {
      if (S.district && tc.slice(0, 4) !== S.district) return;
      const c = DA.D.centroid[tc]; if (!c) return;
      const sz = Math.round(26 + Math.min(18, Math.sqrt(t.rai) * 2.2));
      const vtxt = Object.entries(t.varieties).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${U.esc(k)} ${U.fmt(v, 1)} ไร่`).join('<br>');
      L.marker(c, { zIndexOffset: 900, icon: L.divIcon({ className: '', html: `<div class="proj-icon" style="width:${sz}px;height:${sz}px"><b>${t.plots}</b></div>`, iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] }) })
        .bindPopup(`<div class="pp"><h4>🛡️ แปลงส่งเสริมพันธุ์ต้านทาน-ทนทาน · ต.${U.esc((DA.D.tambons[tc] || {}).name)}</h4><table>
          <tr><td>จำนวนแปลง</td><td>${t.plots} แปลง</td></tr><tr><td>พื้นที่</td><td>${U.fmt(t.rai, 1)} ไร่</td></tr>
          <tr><td>ท่อนพันธุ์ที่ได้รับ</td><td>${U.fmt(t.cuttings)} ท่อน</td></tr><tr><td>พันธุ์</td><td>${vtxt}</td></tr>
          <tr><td>พบอาการ CMD/SLCMV</td><td>${t.cmd} แปลง</td></tr>
          <tr><td>ชั้นดิน (สำรวจ)</td><td>${Object.entries(t.soil).map(([k, v]) => k + ' ' + v).join(' · ') || '–'}</td></tr>
          <tr><td>ระบบให้น้ำ</td><td>${Object.entries(t.irrigation).map(([k, v]) => U.esc(k) + ' ' + v).join('<br>') || '–'}</td></tr></table>
          <div class="pp-src"><span class="badge src-real" title="${U.esc(C.SOURCES.PROJECT.note)}">แปลงส่งเสริมพันธุ์</span></div></div>`).addTo(G.proj);
    });
  }

  /* ---------- Layer 5: Networks ---------- */
  function netIcon(k, r) {
    const n = NET[k];
    const tr = module === 'rootrot' && k === 'pest' && DA.hasTricho(r);
    return L.divIcon({ className: '', html: `<div class="net-icon ${n.sq ? 'sq' : ''}${tr ? ' tricho' : ''}" style="background:${n.color}">${n.glyph}</div>`, iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -12] });
  }
  function netPopup(k, r) {
    const rows = [];
    const add = (l, v) => { if (v !== undefined && v !== null && v !== '') rows.push(`<tr><td>${l}</td><td>${U.esc(v)}</td></tr>`); };
    add('ที่ตั้ง', [r.moo ? 'ม.' + r.moo : '', r.tambon ? 'ต.' + r.tambon : r.location || '', r.district ? 'อ.' + r.district : ''].join(' ').trim());
    if (k === 'pest') { add('ระดับ', r.level); add('สมาชิก', r.members); add('ปีจัดตั้ง', r.year_start); add('ชีวภัณฑ์', r.bio); add('พืชหลัก', r.crop); }
    if (k === 'soil') { add('ประเภท', r.type); add('ระดับ', r.level); add('สมาชิก', r.members); add('พืช', r.crops); }
    if (k === 'lc') { add('สินค้าหลัก', r.commodity); add('เป้าหมายพื้นที่', r.target_area); add('จุดเด่น', r.highlight); }
    if (k === 'farm') { add('ปีเริ่ม', r.year_start); add('สมาชิก', r.members); add('พื้นที่', U.fmt(r.plot_area) + ' ไร่'); add('ผลผลิต ก่อน→หลัง', `${U.fmt(r.yield_before)} → ${U.fmt(r.yield_after)} กก./ไร่`); add('ต้นทุน ก่อน→หลัง', `${U.fmt(r.cost_before)} → ${U.fmt(r.cost_after)} บ./ไร่`); }
    if (r.coord_note) add('พิกัด', r.coord_note);
    let extra = '';
    if (k === 'pest') {
      const P = DA.D.P; let near = 0;
      for (let i = 0; i < P.n; i++) if (Math.abs(P.lat[i] - r.lat) < 0.1 && Math.abs(P.lng[i] - r.lng) < 0.1 && U.haversineKm(P.lat[i], P.lng[i], r.lat, r.lng) <= 10) near += P.rai[i];
      extra = `<tr><td>มันสำปะหลังในรัศมี 10 กม.</td><td>${U.fmt(near)} ไร่</td></tr>`;
    }
    return `<div class="pp"><h4>${U.esc(r.name)}</h4><div class="hint">${NET[k].label}</div><table>${rows.join('')}${extra}</table>
      <div class="pp-src"><span class="badge src-real" title="${U.esc(window.KPP_NETWORKS[k].source)}">${C.SOURCES.NETWORK.label}</span></div></div>`;
  }
  function drawNetworks() {
    if (G.net) { map.removeLayer(G.net); G.net = null; }
    if (!L_.networks.on) return;
    G.net = L.layerGroup().addTo(map);
    Object.keys(NET).forEach((k) => {
      if (!L_.networks[k]) return;
      window.KPP_NETWORKS[k].rows.forEach((r) => {
        if (S.district && r.district_code && r.district_code !== S.district) return;
        if (module === 'rootrot' && k === 'pest' && !DA.hasTricho(r)) return;
        L.marker([r.lat, r.lng], { icon: netIcon(k, r), zIndexOffset: 800 }).bindPopup(() => netPopup(k, r)).addTo(G.net);
      });
    });
  }

  /* ---------- Villages ---------- */
  function drawVillages() {
    if (G.vil) { map.removeLayer(G.vil); G.vil = null; }
    if (!L_.villages.on) return;
    G.vil = L.markerClusterGroup({ maxClusterRadius: 45, showCoverageOnHover: false,
      iconCreateFunction: (c) => L.divIcon({ className: '', html: `<div class="vcluster" style="width:34px;height:34px">${c.getChildCount()}</div>`, iconSize: [34, 34] }) });
    DA.D.villages.forEach((v) => {
      if (S.tambon ? v.tcode !== S.tambon : S.district ? v.tcode.slice(0, 4) !== S.district : false) return;
      const t = DA.D.tambons[v.tcode] || {};
      L.circleMarker([v.lat, v.lng], { radius: 6, color: '#fff', weight: 1.5, fillColor: '#065F46', fillOpacity: 0.95 })
        .bindPopup(`<div class="pp"><h4>🏠 หมู่ ${v.moo} ต.${U.esc(t.name)}</h4><table>
          <tr><td>แปลงขึ้นทะเบียน</td><td>${U.fmt(v.n)} แปลง</td></tr>
          <tr><td>พื้นที่ปลูก</td><td>${U.fmt(v.rai)} ไร่</td></tr>
          <tr><td>ต้านทาน / ทนทาน</td><td>${U.fmt(v.resistant)} / ${U.fmt(v.tolerant)} ไร่</td></tr>
          <tr><td>ทับซ้อนน้ำท่วม (ประมาณ)</td><td>${U.fmt(v.flood)} ไร่</td></tr></table>
          <div class="hint">ตำแหน่ง = ค่าเฉลี่ยพิกัดแปลงในหมู่บ้าน</div></div>`)
        .addTo(G.vil);
    });
    G.vil.addTo(map);
  }

  /* ---------- Parcels (zoom ≥ 12) ---------- */
  function parcelColor(i) {
    const P = DA.D.P;
    if (module === 'soil') return SOILCOL[P.soil[i]];
    if (module === 'rootrot') { const r = P.rr[i]; return r >= 0.62 ? '#b2182b' : r >= 0.5 ? '#f46d43' : r >= 0.35 ? '#f2c12e' : '#1a9850'; }
    return VCOL[VCODE2KEY[P.res[i]]];
  }
  function parcelPopup(i) {
    const P = DA.D.P, t = DA.D.tambons[P.tcode[i]] || {};
    const b = P.breeds[P.breed[i]];
    const vc = C.VARIETY_CLASSES.find((v) => v.key === VCODE2KEY[P.res[i]]);
    const soil = P.soil[i] ? C.SOIL_CLASSES[P.soil[i] - 1].label : 'นอกพื้นที่ประเมิน';
    const grp = DA.D.P.aggregated;
    return `<div class="pp"><h4>${grp ? `กลุ่มแปลง ${P.cnt[i]} แปลง` : 'แปลงมันสำปะหลัง'}</h4><table>
      <tr><td>ที่ตั้ง</td><td>ม.${P.moo[i]} ต.${U.esc(t.name)}</td></tr>
      <tr><td>พื้นที่</td><td>${U.fmt(P.rai[i], 2)} ไร่</td></tr>
      <tr><td>พันธุ์</td><td>${U.esc(b)}</td></tr>
      <tr><td>กลุ่มต่อโรคใบด่าง</td><td><span class="vclass-chip" style="background:${vc.color}">${vc.label}</span></td></tr>
      <tr><td>ชั้นดิน (LDD)</td><td>${soil}</td></tr>
      <tr><td>ความเสี่ยงรากเน่าโคนเน่า</td><td>${Math.round(P.rr[i] * 100)}/100</td></tr>
      <tr><td>วันปลูก → เก็บเกี่ยว</td><td>${P.plant[i] || '–'} → ${P.harvest[i] || '–'}</td></tr>
      <tr><td>พื้นที่เสียหายที่รายงาน</td><td>${P.disRai[i] ? U.fmt(P.disRai[i], 1) + ' ไร่' : '–'}</td></tr>
    </table>${grp ? `<div class="hint">ตำแหน่งแสดงเป็นจุดกึ่งกลางกริด ${U.fmt(DA.D.P.grid)} ม. เพื่อคุ้มครองข้อมูลส่วนบุคคล</div>` : ''}
    <div class="pp-src"><span class="badge src-real">DOAE ผังแปลงดิจิทัล</span><span class="badge src-real">LDD</span></div></div>`;
  }
  function loadPolys() {
    if (window.KPP_PARCEL_POLYS || polysLoading || DA.D.P.aggregated) return;
    polysLoading = true;
    const s = document.createElement('script');
    s.src = 'data/private/parcel_polys.js';
    s.onload = () => { polysLoading = false; drawParcels(true); };
    s.onerror = () => { polysLoading = false; window.KPP_PARCEL_POLYS = []; };
    document.body.appendChild(s);
  }
  let lastParcelKey = '';
  function drawParcels(force) {
    if (!S) return;
    const z = map.getZoom();
    const show = L_.parcels.on && z >= 12;
    const b = map.getBounds().pad(0.15);
    const key = [show, z >= 14, b.toBBoxString(), S.district, S.tambon, module].join('|');
    if (!force && key === lastParcelKey) return;
    lastParcelKey = key;
    if (G.parcels) { map.removeLayer(G.parcels); G.parcels = null; }
    if (!show) return;
    const P = DA.D.P, polys = window.KPP_PARCEL_POLYS;
    G.parcels = L.layerGroup().addTo(map);
    if (P.aggregated) { drawGridCells(b); return; }
    if (z >= 14 && !polys) loadPolys();
    let count = 0;
    for (let i = 0; i < P.n; i++) {
      if (!b.contains([P.lat[i], P.lng[i]])) continue;
      if (++count > 6000) break;
      const style = { renderer: G.parcelRenderer, color: '#1e293b', weight: 0.7, fillColor: parcelColor(i), fillOpacity: 0.8 };
      let lyr;
      if (z >= 14 && polys && polys[i]) {
        const c = polys[i], ll = [];
        for (let k = 0; k < c.length; k += 2) ll.push([c[k + 1], c[k]]);
        lyr = L.polygon(ll, style);
      } else {
        lyr = L.circleMarker([P.lat[i], P.lng[i]], Object.assign(style, { radius: Math.max(3, Math.min(10, Math.sqrt(P.rai[i]))) }));
      }
      lyr.bindPopup(() => parcelPopup(i)).addTo(G.parcels);
    }
  }

  /** ข้อมูลสาธารณะ (รวมกริด 1 กม.): แสดงเป็นช่องกริด สีตามกลุ่มที่เด่นในช่อง */
  function drawGridCells(b) {
    const P = DA.D.P, cells = new Map();
    const key = module === 'soil' ? (i) => P.soil[i] : module === 'rootrot' ? null : (i) => P.res[i];
    for (let i = 0; i < P.n; i++) {
      if (!b.contains([P.lat[i], P.lng[i]])) continue;
      const id = P.lat[i] + ',' + P.lng[i];
      const c = cells.get(id) || { lat: P.lat[i], lng: P.lng[i], rai: 0, n: 0, by: {}, rr: 0, cmd: 0, tcode: P.tcode[i] };
      c.rai += P.rai[i]; c.n += P.cnt[i]; c.rr += P.rr[i] * P.rai[i];
      if (key) { const k = key(i); c.by[k] = (c.by[k] || 0) + P.rai[i]; }
      cells.set(id, c);
    }
    const half = (DA.D.P.grid || 1000) / 2 / 111320;
    cells.forEach((c) => {
      let fill;
      if (module === 'rootrot') { const r = c.rr / c.rai; fill = r >= 0.62 ? '#b2182b' : r >= 0.5 ? '#f46d43' : r >= 0.35 ? '#f2c12e' : '#1a9850'; }
      else {
        const dom = Object.entries(c.by).sort((a, b2) => b2[1] - a[1])[0][0];
        fill = module === 'soil' ? SOILCOL[+dom] : VCOL[VCODE2KEY[dom]];
      }
      const dl = half / Math.cos(c.lat * Math.PI / 180) * 0.94, dt = half * 0.94;
      L.rectangle([[c.lat - dt, c.lng - dl], [c.lat + dt, c.lng + dl]], { renderer: G.parcelRenderer, color: '#ffffff', weight: 0.8, fillColor: fill, fillOpacity: 0.72 })
        .bindPopup(() => cellPopup(c)).addTo(G.parcels);
    });
  }
  function cellPopup(c) {
    const t = DA.D.tambons[c.tcode] || {};
    const rows = Object.entries(c.by).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
      const lab = module === 'soil' ? (+k ? C.SOIL_CLASSES[+k - 1].label : 'นอกพื้นที่ประเมิน') : C.VARIETY_CLASSES.find((x) => x.key === VCODE2KEY[k]).label;
      return `<tr><td>${lab}</td><td>${U.fmt(v)} ไร่ (${U.pct(v / c.rai, 0)})</td></tr>`;
    }).join('');
    return `<div class="pp"><h4>ช่องกริด 1 กม. · ต.${U.esc(t.name || '')}</h4><table>
      <tr><td>แปลงขึ้นทะเบียน</td><td>${U.fmt(c.n)} แปลง</td></tr><tr><td>พื้นที่ปลูก</td><td>${U.fmt(c.rai)} ไร่</td></tr>${rows}
      <tr><td>ความเสี่ยงรากเน่าโคนเน่า</td><td>${Math.round(100 * c.rr / c.rai)}/100</td></tr></table>
      <div class="hint">ข้อมูลเผยแพร่แบบรวมกริด 1 กม. เพื่อคุ้มครองข้อมูลส่วนบุคคล</div></div>`;
  }

  /* ---------- Custom imported layers ---------- */
  const SOILIMP = { S1: SOILCOL[1], S2: SOILCOL[2], S3: SOILCOL[3], N: SOILCOL[4] };
  function addCustomLayer(name, geojson, opts = {}) {
    const color = opts.color || '#0e7490';
    const role = opts.role || 'custom';
    const isPoint = (f) => f.geometry && /Point/.test(f.geometry.type);
    const lyr = L.geoJSON(geojson, {
      pane: role === 'soil' ? 'soil' : role === 'flood' ? 'flood' : 'overlayPane',
      style: (f) => {
        if (role === 'soil') {
          const cls = Object.values(f.properties || {}).map(String).find((v) => /^(S1|S2|S3|N)$/i.test(v.trim()));
          return { color: '#57534e', weight: 0.6, fillColor: SOILIMP[(cls || '').toUpperCase()] || color, fillOpacity: 0.6 };
        }
        return { color, weight: 1.6, fillColor: color, fillOpacity: role === 'clean' ? 0.45 : 0.25 };
      },
      pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 6, color: '#fff', weight: 1.5, fillColor: color, fillOpacity: 0.95 }),
      onEachFeature: (f, l) => {
        const props = Object.entries(f.properties || {}).slice(0, 18).map(([k, v]) => `<tr><td>${U.esc(k)}</td><td>${U.esc(v)}</td></tr>`).join('');
        l.bindPopup(`<div class="pp"><h4>${U.esc(name)}</h4><table>${props}</table><div class="pp-src"><span class="badge src-import">นำเข้าโดยผู้ใช้</span></div></div>`);
      }
    }).addTo(map);
    const entry = { id: 'c' + Date.now() + Math.random().toString(36).slice(2, 6), name, role, color, layer: lyr, on: true, opacity: 1, count: (geojson.features || []).length, points: (geojson.features || []).filter(isPoint).length };
    custom.push(entry);
    try { map.fitBounds(lyr.getBounds(), { maxZoom: 13, padding: [30, 30] }); } catch (e) { /* empty layer */ }
    if (role === 'soil') drawSoil();
    KPP.App.renderLayerPanel();
    buildLegend();
    return entry;
  }
  function removeCustom(id) {
    const i = custom.findIndex((c) => c.id === id);
    if (i < 0) return;
    map.removeLayer(custom[i].layer);
    custom.splice(i, 1);
    if (S) drawSoil();
    KPP.App.renderLayerPanel(); buildLegend();
  }
  function setCustom(id, prop, val) {
    const c = custom.find((x) => x.id === id); if (!c) return;
    c[prop] = val;
    if (prop === 'on') { if (val) c.layer.addTo(map); else map.removeLayer(c.layer); }
    if (prop === 'opacity') c.layer.setStyle({ opacity: val, fillOpacity: val * 0.5 });
    buildLegend();
  }

  /* ---------- Legend ---------- */
  function legendClasses(classes) { return classes.map((c) => `<div class="cls-row"><span class="sw" style="background:${c.color}"></span>${c.label}</div>`).join(''); }
  function buildLegend() {
    const el = document.getElementById('legend');
    if (!el || !S) return;
    const h = [];
    if (L_.choro.on && scheme) {
      const m = scheme.m;
      h.push(`<h4>${m.label}</h4><div class="hint" style="margin:0 0 3px">${(tambonLevel() || S.district) ? 'รายตำบล' : 'รายอำเภอ'} · ปี ${S.year}${m.dist && (tambonLevel() || S.district) ? ' · มีข้อมูลรายอำเภอเท่านั้น' : ''}</div>`);
      if (L_.style === 'bivar' && BIVAR[module]) {
        const bv = BIVAR[module];
        h.push(`<div class="biv"><div class="biv-grid">${[2, 1, 0].map((yi) => [0, 1, 2].map((xi) => `<i style="background:${BIV_COLORS[yi][xi]}"></i>`).join('')).join('')}</div>
          <div class="biv-ax"><span>→ ${U.esc(bv.x.label)} (${bv.x.br.map(bv.x.fmt).join(' / ')})</span><span>↑ ${U.esc(bv.y.label)} (${bv.y.br.map(bv.y.fmt).join(' / ')})</span><span>สีแดงเข้ม = ${U.esc(bv.x.label)} สูง แต่ ${U.esc(bv.y.label)} ต่ำ (ควรเร่งดำเนินการ)</span></div></div>`);
      } else h.push(legendClasses(scheme.classes));
      if (L_.style === 'bubble') h.push('<div class="hint">ขนาดวงกลมตามค่าตัวชี้วัด</div>');
      if (units.some((u) => !U.isNum(m.get(u)))) h.push(`<div class="cls-row"><span class="sw" style="background:${NA}"></span>ไม่มีข้อมูลในระดับนี้</div>`);
    }
    if (L_.soil.on && window.KPP_LDD && !custom.some((c) => c.role === 'soil')) {
      h.push(`<h4>🟫 ความเหมาะสมดินมันสำปะหลัง</h4>${legendClasses(C.SOIL_CLASSES.map((s) => ({ color: s.color, label: s.label })))}<div class="lg-src"><span class="badge src-real" title="${U.esc(C.SOURCES.LDD.note)}">LDD Agri-Map 2564</span></div><div class="hint">คลิกบนแผนที่เพื่อดูชั้นดิน</div>`);
    }
    if (L_.series.on) h.push(seriesLegend());
    if (L_.disease.on && DA.D.rep.cmd && S.year === 2569) {
      h.push(`<h4>🦠 โรคใบด่างรายอำเภอ <span class="badge src-real">รายงานจริง</span></h4><div class="hint" style="margin:0">ขนาด = พื้นที่ระบาด · ตัวเลข = % ของพื้นที่ปลูก</div>`);
      DA.LV4.slice().reverse().forEach((l) => h.push(`<div class="lg-row"><span class="sw" style="background:${l.color};border-radius:50%"></span>${l.icon} ${l.label}</div>`));
    }
    if (L_.resist.on) h.push(`<h4>🛡️ พันธุ์ต้านทาน/ทนทาน</h4><div class="lg-row"><span class="proj-icon" style="width:18px;height:18px;font-size:9px"><b>n</b></span>แปลงส่งเสริมพันธุ์ (จำนวนแปลง/ตำบล)</div><div class="lg-row"><span class="sw" style="background:${VCOL.resistant};border-radius:50%"></span>ต้านทาน</div><div class="lg-row"><span class="sw" style="background:${VCOL.tolerant};border-radius:50%"></span>ทนทาน</div>`);
    if (L_.flood.on) h.push(`<h4>🌊 น้ำท่วมซ้ำซาก</h4><div class="lg-row"><span class="hatch-sw"></span>${DA.D.flood.polygons ? 'ขอบเขตที่นำเข้า' : 'ตำบลน้ำท่วม 2 ปี'}</div>${DA.D.flood.polygons ? '' : '<div class="lg-row"><span class="hatch-sw" style="border-width:2.5px"></span>ตำบลน้ำท่วม ≥ 3 ปี (2563–2569)</div>'}`);
    if (L_.networks.on) {
      h.push('<h4>🏠 ศูนย์เครือข่าย</h4>');
      Object.entries(NET).forEach(([k, n]) => { if (L_.networks[k]) h.push(`<div class="lg-row"><span class="net-icon ${n.sq ? 'sq' : ''}" style="background:${n.color};width:18px;height:18px;font-size:9px;border-width:1px">${n.glyph}</span>${n.label}</div>`); });
      if (module === 'rootrot') h.push('<div class="lg-row"><span class="net-icon tricho" style="background:#6250d6;width:18px;height:18px;font-size:9px;border-width:1px">จ</span>ศจช. ผลิตไตรโคเดอร์มา</div>');
    }
    if (L_.villages.on) h.push('<h4>🏠 หมู่บ้าน</h4><div class="lg-row"><span class="sw" style="background:#065F46;border-radius:50%"></span>จุดรวมแปลงรายหมู่ (ทะเบียน 2569)</div>');
    if (L_.parcels.on && map.getZoom() >= 12) {
      const items = module === 'soil' ? C.SOIL_CLASSES.map((s) => [s.color, s.label]) : module === 'rootrot' ? DA.LV4.map((l) => [l.color, 'เสี่ยง' + l.label]).reverse() : C.VARIETY_CLASSES.map((v) => [v.color, 'พันธุ์' + v.label]);
      h.push(`<h4>${DA.D.P.aggregated ? 'ช่องกริด 1 กม. (ซูม ≥ 12)' : 'แปลง (ซูม ≥ 12)'}</h4>${items.map(([c, l]) => `<div class="lg-row"><span class="sw" style="background:${c}"></span>${l}</div>`).join('')}`);
    }
    custom.filter((c) => c.on).forEach((c) => h.push(`<h4>${U.esc(c.name)}</h4><div class="lg-row"><span class="sw" style="background:${c.color}"></span>${c.count} รายการ (นำเข้า)</div>`));
    el.innerHTML = `<div class="lg-title" data-lgt>🗺️ คำอธิบายสัญลักษณ์ <span class="lg-caret">▾</span></div><div class="lg-body">${h.join('')}</div>`;
  }

  /* ---------- Static vector rendering (report & atlas export) ---------- */
  function drawStatic(g, x0, y0, W, H, opts) {
    const st = opts.state || S;
    const scopeFeat = st.tambon ? DA.D.tambons[st.tambon].feature : st.district ? DA.D.dByCode[st.district].feature : window.KPP_GEO.province;
    const bb = U.geomBBox(scopeFeat.geometry);
    const k = Math.cos(((bb[1] + bb[3]) / 2) * Math.PI / 180);
    const pad = 14, s = Math.min((W - 2 * pad) / ((bb[2] - bb[0]) * k), (H - 2 * pad) / (bb[3] - bb[1]));
    const ox = x0 + (W - (bb[2] - bb[0]) * k * s) / 2, oy = y0 + (H - (bb[3] - bb[1]) * s) / 2;
    const px = (lng, lat) => [ox + (lng - bb[0]) * k * s, oy + (bb[3] - lat) * s];
    const path = (geom) => {
      g.beginPath();
      const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
      polys.forEach((poly) => poly.forEach((ring) => ring.forEach((c, i) => { const [xx, yy] = px(c[0], c[1]); if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy); })));
    };
    g.save();
    g.beginPath(); g.rect(x0, y0, W, H); g.clip();
    g.fillStyle = '#ffffff'; g.fillRect(x0, y0, W, H);
    if (st.district) window.KPP_GEO.districts.features.forEach((f) => { path(f.geometry); g.fillStyle = '#f1f5f9'; g.fill('evenodd'); g.strokeStyle = '#94a3b8'; g.lineWidth = 0.8; g.stroke(); });
    if (opts.image && window.KPP_LDD) {
      const [[s0, w0], [n0, e0]] = window.KPP_LDD.bounds;
      const [ax, ay] = px(w0, n0), [bx, by] = px(e0, s0);
      g.globalAlpha = 0.85; g.drawImage(opts.image, ax, ay, bx - ax, by - ay); g.globalAlpha = 1;
    }
    opts.features.forEach(({ geometry, fill, stroke, width, alpha }) => {
      path(geometry);
      if (fill) { g.globalAlpha = alpha ?? 0.9; g.fillStyle = fill; g.fill('evenodd'); g.globalAlpha = 1; }
      g.strokeStyle = stroke || '#334155'; g.lineWidth = width || 0.6; g.stroke();
    });
    if (opts.hatch) {
      const p = document.createElement('canvas'); p.width = p.height = 8;
      const c = p.getContext('2d'); c.strokeStyle = '#1d4ed8'; c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(0, 8); c.lineTo(8, 0); c.moveTo(-2, 2); c.lineTo(2, -2); c.moveTo(6, 10); c.lineTo(10, 6); c.stroke();
      const pat = g.createPattern(p, 'repeat');
      opts.hatch.forEach((geom) => { path(geom); g.fillStyle = pat; g.fill('evenodd'); });
    }
    if (opts.districtLines !== false) window.KPP_GEO.districts.features.forEach((f) => { path(f.geometry); g.strokeStyle = '#065F46'; g.lineWidth = 1.2; g.stroke(); });
    path(window.KPP_GEO.province.geometry); g.strokeStyle = '#D97706'; g.lineWidth = 3; g.stroke();
    (opts.points || []).forEach((p) => {
      const [xx, yy] = px(p.lng, p.lat);
      g.beginPath(); g.arc(xx, yy, p.r || 6, 0, Math.PI * 2); g.fillStyle = p.color; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.stroke();
      if (p.glyph) { g.fillStyle = '#fff'; g.font = '600 9px Prompt, Tahoma, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.glyph, xx, yy + 0.5); }
    });
    (opts.circles || []).forEach((c) => { const [xx, yy] = px(c.lng, c.lat); g.setLineDash([5, 4]); g.strokeStyle = c.color; g.lineWidth = 1.2; g.beginPath(); g.arc(xx, yy, (c.km * 1000 / 111320) * s, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); });
    const labels = st.district ? (DA.D.tambonsByDistrict[st.district] || []).map((t) => [t.name, DA.D.centroid[t.code]])
      : DA.D.districts.map((d) => { const b = L.geoJSON(d.feature).getBounds().getCenter(); return [d.name, [b.lat, b.lng]]; });
    g.font = (st.district ? '500 ' : '600 ') + (opts.labelSize || 12) + 'px Prompt, Tahoma, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    labels.forEach(([n, c]) => { if (!c) return; const [xx, yy] = px(c[1], c[0]); g.lineWidth = 3.5; g.strokeStyle = '#fff'; g.strokeText(n, xx, yy); g.fillStyle = '#0f172a'; g.fillText(n, xx, yy); });
    g.restore();
  }
  function drawLegendBox(g, x, y, title, classes, opt = {}) {
    g.save();
    g.font = '600 12px Prompt, Tahoma, sans-serif';
    const w = Math.max(150, ...classes.map((c) => g.measureText(c.label).width + 34), g.measureText(title).width + 16);
    const h = 26 + classes.length * 17 + (opt.note ? 16 : 0);
    g.fillStyle = 'rgba(255,255,255,.94)'; g.strokeStyle = '#cbd5e1'; g.lineWidth = 1;
    g.fillRect(x, y - h, w, h); g.strokeRect(x, y - h, w, h);
    g.fillStyle = '#0f172a'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(title, x + 8, y - h + 13);
    g.font = '400 11px Prompt, Tahoma, sans-serif';
    classes.forEach((c, i) => { const yy = y - h + 30 + i * 17; g.fillStyle = c.color; g.fillRect(x + 8, yy - 6, 16, 12); g.strokeStyle = 'rgba(0,0,0,.2)'; g.strokeRect(x + 8, yy - 6, 16, 12); g.fillStyle = '#0f172a'; g.fillText(c.label, x + 30, yy); });
    if (opt.note) { g.fillStyle = '#7c3aed'; g.font = '400 10px Prompt, Tahoma, sans-serif'; g.fillText(opt.note, x + 8, y - 9); }
    g.restore();
  }

  /** แผนที่นิ่งของมุมมองปัจจุบัน (ใช้ในรายงาน PDF/PNG) */
  function renderStatic(W = 1056, H = 760) {
    const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2;
    const g = cv.getContext('2d'); g.scale(2, 2);
    const feats = [];
    if (G.choro) G.choro.eachLayer((l) => feats.push({ geometry: l.feature.geometry, fill: L_.choro.on ? l.options.fillColor : null, alpha: Math.max(l.options.fillOpacity, L_.choro.on ? 0.15 : 0), stroke: l.options.color, width: l.options.weight }));
    const hatch = []; if (G.flood && L_.flood.on) G.flood.eachLayer((l) => hatch.push(l.feature.geometry));
    const points = [];
    if (G.net) G.net.eachLayer((m) => { const html = m.options.icon.options.html; points.push({ lat: m.getLatLng().lat, lng: m.getLatLng().lng, color: (html.match(/background:([^"]+)"/) || [])[1] || '#334155', glyph: (html.match(/>([^<]+)<\/div>/) || [])[1] || '', r: 8 }); });
    if (G.hot) G.hot.eachLayer((m) => { const w = m.options.icon.options.iconSize[0]; const html = m.options.icon.options.html; const lv = (html.match(/cmd-mark (\w+)/) || [])[1]; points.push({ lat: m.getLatLng().lat, lng: m.getLatLng().lng, color: (DA.LV4.find((x) => x.key === lv) || {}).color || '#b2182b', r: w / 2.4, glyph: (html.match(/<b>([^<]+)<\/b>/) || [])[1] || '' }); });
    if (G.sym && L_.style === 'bubble') G.sym.eachLayer((c) => { if (c.getRadius) points.push({ lat: c.getLatLng().lat, lng: c.getLatLng().lng, color: c.options.fillColor, r: c.getRadius() }); });
    const circles = [];
    drawStatic(g, 0, 0, W, H, { features: feats, hatch, points, circles, image: L_.soil.on ? soilImageEl() : null, districtLines: !(tambonLevel() && !S.district) || true });
    return cv;
  }
  let soilImg = null;
  function soilImageEl() { if (!soilImg) { soilImg = new Image(); soilImg.src = 'assets/ldd_cassava_suitability.png'; } return soilImg.complete ? soilImg : null; }

  /* ---------- CMD atlas (4 maps) ---------- */
  const ATLAS = [
    { metric: 'planted', title: '1. พื้นที่ปลูกมันสำปะหลัง (ทะเบียนเกษตรกร)' },
    { metric: 'cmd', title: '2. พื้นที่ระบาดโรคใบด่าง' },
    { metric: 'resist', title: '3. พื้นที่ปลูกพันธุ์ต้านทาน + ทนทาน' },
    { metric: 'cmdIndex', title: '4. ดัชนีความเร่งด่วนการจัดการโรคใบด่าง' }
  ];
  const atlasMaps = [];
  function atlasData(st) {
    const us = st.district ? DA.byTambon(st.year, st.district) : DA.byDistrict(st.year);
    const by = {}; us.forEach((u) => { by[u.code] = u; });
    const feats = st.district ? (DA.D.tambonsByDistrict[st.district] || []).map((t) => t.feature) : window.KPP_GEO.districts.features;
    return ATLAS.map((a) => {
      const sch = classify(a.metric, us.filter((u) => a.metric === 'planted' || !(U.isNum(u.planted) && u.planted < 50)));
      return Object.assign({}, a, { sch, us, by, feats });
    });
  }
  function openAtlas(host, st) {
    atlasMaps.splice(0).forEach((m) => m.remove());
    host.innerHTML = '';
    const data = atlasData(st);
    let syncing = false;
    data.forEach((a, i) => {
      const cell = document.createElement('div'); cell.className = 'atlas-cell';
      cell.innerHTML = `<h4><span>${a.title}</span>${METRICS[a.metric].dist ? (st.district ? '<span class="badge src-est">มีข้อมูลรายอำเภอเท่านั้น</span>' : '<span class="badge src-real">รายงานจริง</span>') : ''}</h4><div class="amap" id="amap${i}"></div><div class="legend"><h4>${METRICS[a.metric].label}</h4>${legendClasses(a.sch.classes)}</div>`;
      host.appendChild(cell);
      const m = L.map('amap' + i, { zoomControl: i === 0, attributionControl: false, zoomSnap: 0.25 });
      L.geoJSON({ type: 'FeatureCollection', features: a.feats }, {
        style: (f) => ({ color: '#334155', weight: 1, fillColor: a.by[f.properties.code] ? a.sch.color(a.by[f.properties.code]) : NA, fillOpacity: 0.92 }),
        onEachFeature: (f, l) => {
          const u = a.by[f.properties.code];
          l.bindTooltip(`<b>${U.esc(u ? u.name : '')}</b><br>${METRICS[a.metric].label}: ${u ? METRICS[a.metric].fmt(METRICS[a.metric].get(u)) : '–'}`, { sticky: true });
        }
      }).addTo(m);
      L.geoJSON(window.KPP_GEO.province, { interactive: false, style: { color: '#D97706', weight: 3, fill: false } }).addTo(m);
      a.feats.forEach((f) => {
        const c = st.district ? DA.D.centroid[f.properties.code] : (() => { const b = L.geoJSON(f).getBounds().getCenter(); return [b.lat, b.lng]; })();
        if (c) L.marker(c, { interactive: false, icon: L.divIcon({ className: 'dlabel' + (st.district ? ' tlabel' : ''), html: U.esc(f.properties.name), iconSize: null }) }).addTo(m);
      });
      const scope = st.district ? DA.D.dByCode[st.district].feature : window.KPP_GEO.province;
      m.fitBounds(L.geoJSON(scope).getBounds(), { padding: [8, 8] });
      m.on('move', () => {
        if (syncing) return; syncing = true;
        atlasMaps.forEach((o) => { if (o !== m) o.setView(m.getCenter(), m.getZoom(), { animate: false }); });
        syncing = false;
      });
      atlasMaps.push(m);
    });
    setTimeout(() => atlasMaps.forEach((m) => m.invalidateSize()), 120);
  }
  function renderAtlasCanvas(st) {
    const data = atlasData(st);
    const W = 1600, H = 1180, cw = 790, ch = 540, top = 88;
    const cv = document.createElement('canvas'); cv.width = W * 1.5; cv.height = H * 1.5;
    const g = cv.getContext('2d'); g.scale(1.5, 1.5);
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#065F46'; g.fillRect(0, 0, W, 6);
    g.fillStyle = '#065F46'; g.font = '700 26px Prompt, Tahoma, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText('ชุดแผนที่วิเคราะห์พื้นที่การจัดการโรคใบด่างมันสำปะหลัง จังหวัดกำแพงเพชร', 20, 44);
    g.fillStyle = '#475569'; g.font = '400 15px Prompt, Tahoma, sans-serif';
    g.fillText(`ปีเพาะปลูก ${st.year} · ${st.district ? 'อ.' + DA.D.dByCode[st.district].name + ' (รายตำบล)' : 'รายอำเภอ'} · ข้อมูลระบาด ${DA.D.rep.cmd ? DA.D.rep.cmd.period : ''} · จัดทำ ${U.thaiDate()}`, 20, 70);
    data.forEach((a, i) => {
      const x = 10 + (i % 2) * (cw + 10), y = top + Math.floor(i / 2) * (ch + 10);
      g.strokeStyle = '#cbd5e1'; g.lineWidth = 1; g.strokeRect(x, y, cw, ch);
      g.fillStyle = '#0f172a'; g.font = '600 17px Prompt, Tahoma, sans-serif'; g.fillText(a.title, x + 12, y + 26);
      drawStatic(g, x + 1, y + 36, cw - 2, ch - 37, { state: st, features: a.feats.map((f) => ({ geometry: f.geometry, fill: a.by[f.properties.code] ? a.sch.color(a.by[f.properties.code]) : NA, stroke: '#334155', width: 0.8, alpha: 0.95 })), districtLines: false, labelSize: 11 });
      drawLegendBox(g, x + 10, y + ch - 10, METRICS[a.metric].label, a.sch.classes, { note: METRICS[a.metric].dist && st.district ? '* ยังไม่มีผลสำรวจรายตำบล' : '' });
    });
    g.fillStyle = '#64748b'; g.font = '400 12px Prompt, Tahoma, sans-serif';
    g.fillText(`แหล่งข้อมูล: ทะเบียนเกษตรกร ทบก. · รายงานระบาดโรคใบด่าง · ผังแปลงดิจิทัล กสก. · ดัชนี = 50% สัดส่วนระบาด (เต็มที่ 30%) + 30% พันธุ์อ่อนแอ + 20% การขาดพันธุ์ต้านทาน/ทนทาน · จัดทำโดย ${C.DEVELOPER} ${C.DEVELOPER_UNIT}`, 20, H - 14);
    return cv;
  }

  function fitScope() {
    if (!S) return;
    if (S.tambon) { const t = DA.D.tambons[S.tambon]; if (t) map.fitBounds(L.geoJSON(t.feature).getBounds(), { padding: [30, 30], maxZoom: 13 }); }
    else if (S.district) map.fitBounds(L.geoJSON(DA.D.dByCode[S.district].feature).getBounds(), { padding: [30, 30] });
    else map.fitBounds(L.geoJSON(window.KPP_GEO.province).getBounds(), { padding: [10, 10] });
  }

  return {
    init, render, setBase, setModule, fitScope, renderStatic, openAtlas, renderAtlasCanvas, classify, computeUnits,
    layers: L_, custom, addCustomLayer, removeCustom, setCustom, METRICS, MODULE_METRICS, NET, RAMP,
    get map() { return map; }, get baseKey() { return baseKey; }, get module() { return module; },
    refresh() { if (S) render(S); }, buildLegend, drawParcels
  };
})();
