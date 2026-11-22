/* Standardized Data Adapter + Decision Support Engine */
KPP.Data = (function () {
  const U = KPP.U, C = KPP.CONFIG;
  const VK = C.VARIETY_CLASSES.map((v) => v.key);             // resistant, tolerant, modsus, susceptible
  const VCODE = { resistant: 2, tolerant: 1, modsus: 0, susceptible: -1 };
  const CODEV = { 2: 'resistant', 1: 'tolerant', 0: 'modsus', '-1': 'susceptible' };
  const SOILK = ['none', 'S1', 'S2', 'S3', 'N'];
  const D = {
    districts: [], dByCode: {}, tambons: {}, tambonsByDistrict: {},
    P: null, villages: [], official: {}, avgYield: {},
    flood: { byTambon: {}, events: [], polygons: null },
    imports: { records: [], layers: [] },
    settings: { varietyMap: {}, extraVarieties: [], price: C.PRICE_BAHT_PER_KG },
    simYearScale: {
      cmd: { 2565: 0.32, 2566: 0.5, 2567: 0.74, 2568: 0.9, 2569: 1 },
      rootrot: { 2565: 1.25, 2566: 0.9, 2567: 0.85, 2568: 1.1, 2569: 1 },
      mealybug: { 2565: 1.3, 2566: 1.15, 2567: 1.0, 2568: 0.95, 2569: 1 },
      whitefly: { 2565: 0.4, 2566: 0.55, 2567: 0.8, 2568: 0.95, 2569: 1 },
      broom: { 2565: 1.1, 2566: 1.0, 2567: 1.05, 2568: 0.95, 2569: 1 }
    }
  };
  const DIS = C.DISEASES.map((d) => d.key);
  const RR_BREAKS = [35, 50, 62];
  const RRW = { flood: 0.45, soil: 0.35, rain: 0.20 };   // น้ำหนักปัจจัยรากเน่าโคนเน่า

  /* ---------- variety classification ---------- */
  const normV = (s) => String(s || '').replace(/มันสำปะหลัง|พันธุ์/g, '').replace(/[\s()]/g, '').toLowerCase();
  const ALIAS = Object.fromEntries(Object.entries(C.VARIETY_ALIASES).map(([k, v]) => [normV(k), normV(v)]));
  const canon = (name) => { const n = normV(name); return ALIAS[n] || n || normV('ไม่ระบุพันธุ์'); };
  function defaultVarietyMap() {
    const m = {};
    Object.entries(C.VARIETY_DEFAULTS).forEach(([cls, names]) => names.forEach((n) => { m[canon(n)] = cls; }));
    return m;
  }
  function varietyClass(name) {
    const c = canon(name);
    return D.settings.varietyMap[c] || C.VARIETY_DEFAULT_CLASS;
  }
  function allVarieties() {
    const seen = new Map();
    D.P.breeds.forEach((b) => seen.set(canon(b), b));
    D.settings.extraVarieties.forEach((b) => { if (!seen.has(canon(b))) seen.set(canon(b), b); });
    Object.values(C.VARIETY_DEFAULTS).flat().forEach((b) => { if (!seen.has(canon(b))) seen.set(canon(b), b); });
    return [...seen.values()];
  }

  function init() {
    const G = window.KPP_GEO, S = window.KPP_STATS, PR = window.KPP_PARCELS, FL = window.KPP_FLOOD;
    D.settings.varietyMap = defaultVarietyMap();
    const saved = U.store('kpp.settings.v2');
    if (saved) {
      if (saved.varietyMap) Object.assign(D.settings.varietyMap, saved.varietyMap);
      if (Array.isArray(saved.extraVarieties)) D.settings.extraVarieties = saved.extraVarieties;
      if (U.isNum(saved.price)) D.settings.price = saved.price;
    }

    G.districts.features.forEach((f) => {
      const p = f.properties;
      const d = { code: p.code, name: p.name, name_en: p.name_en, area_sqkm: p.area_sqkm, feature: f };
      D.districts.push(d); D.dByCode[p.code] = d;
    });
    D.districts.sort((a, b) => a.code.localeCompare(b.code));
    G.tambons.features.forEach((f) => {
      const p = f.properties;
      const t = { code: p.code, name: p.name, district_code: p.district_code, feature: f };
      D.tambons[p.code] = t;
      (D.tambonsByDistrict[p.district_code] = D.tambonsByDistrict[p.district_code] || []).push(t);
    });
    Object.values(D.tambonsByDistrict).forEach((a) => a.sort((x, y) => x.name.localeCompare(y.name, 'th')));

    S.rows.forEach((r) => { (D.official[r.year] = D.official[r.year] || {})[r.district_code] = r; });
    D.districts.forEach((d) => {
      let p = 0, h = 0;
      [2565, 2566, 2567].forEach((y) => { const r = D.official[y] && D.official[y][d.code]; if (r) { p += r.production; h += r.harvested; } });
      D.avgYield[d.code] = U.yieldKgPerRai(p, h);
    });
    D.ldd = window.KPP_LDD || null;
    D.ldd7 = {};
    if (D.ldd && D.ldd.table7) D.ldd.table7.rows.forEach((r) => { D.ldd7[r.district_code] = r; });

    decodeParcels(PR);
    D.flood.events = FL.events;
    buildFlood();
    const imp = U.store('kpp.imports');
    if (imp && Array.isArray(imp.records)) D.imports.records = imp.records;
    rebuild();
  }

  function decodeParcels(PR) {
    const n = PR.rows.length, f = PR.fields;
    const ix = (k) => f.indexOf(k);
    const iSoil = ix('soil'), iN = ix('n');
    const P = {
      n, breeds: PR.breeds, source: PR.source, asof: PR.asof, aggregated: !!PR.aggregated, grid: PR.grid_m || 0,
      lat: new Float64Array(n), lng: new Float64Array(n), rai: new Float32Array(n), breed: new Uint16Array(n),
      tcode: new Array(n), dcode: new Array(n), moo: new Uint8Array(n), plant: new Array(n), harvest: new Array(n),
      disRai: new Float32Array(n), res: new Int8Array(n), flood: new Uint8Array(n), floodW: new Float32Array(n), early: new Uint8Array(n),
      soil: new Uint8Array(n), cnt: new Uint16Array(n), rain: new Uint8Array(n), rr: new Float32Array(n)
    };
    DIS.forEach((k) => { P[k] = new Float32Array(n); });
    let parcels = 0;
    PR.rows.forEach((r, i) => {
      P.lat[i] = r[0]; P.lng[i] = r[1]; P.rai[i] = r[2]; P.breed[i] = r[3]; P.tcode[i] = r[4];
      P.dcode[i] = r[4].slice(0, 4); P.moo[i] = r[5]; P.plant[i] = r[6]; P.harvest[i] = r[7]; P.disRai[i] = r[8];
      P.soil[i] = iSoil >= 0 ? r[iSoil] : 0; P.cnt[i] = iN >= 0 ? r[iN] : 1;
      const pm = +String(r[6] || '').slice(5, 7);
      P.rain[i] = C.RAINY_PLANT_MONTHS.includes(pm) ? 1 : 0;
      parcels += P.cnt[i];
    });
    P.parcels = parcels;
    D.P = P;
  }

  function buildFlood() {
    const by = {};
    D.flood.events.filter((e) => e.hazard === 'flood' && e.tcode).forEach((e) => {
      const t = by[e.tcode] = by[e.tcode] || { tcode: e.tcode, years: new Set(), field: 0, total: 0, aid: 0, farmers: 0, events: 0 };
      t.years.add(e.year); t.field += e.field; t.total += e.total; t.aid += e.aid; t.farmers += e.farmers; t.events++;
    });
    Object.values(by).forEach((t) => {
      t.nYears = t.years.size;
      t.avgField = t.nYears ? t.field / t.nYears : 0;
      t.level = t.nYears >= C.FLOOD_HIGH_YEARS ? 2 : t.nYears >= C.FLOOD_REPEAT_MIN_YEARS ? 1 : 0;
      t.yearList = [...t.years].sort();
    });
    D.flood.byTambon = by;
  }

  /** คำนวณค่าอนุพันธ์ทั้งหมดใหม่ (เมื่อเปลี่ยนการจัดกลุ่มพันธุ์ / นำเข้าชั้นน้ำท่วม) */
  function rebuild() {
    const P = D.P, polys = D.flood.polygons;
    const bCls = P.breeds.map((b) => VCODE[varietyClass(b)]);
    const tRai = {};
    for (let i = 0; i < P.n; i++) tRai[P.tcode[i]] = (tRai[P.tcode[i]] || 0) + P.rai[i];
    Object.values(D.flood.byTambon).forEach((t) => {
      t.cassavaRai = tRai[t.tcode] || 0;
      t.exposure = t.level > 0 && t.cassavaRai > 0 ? Math.min(1, t.avgField / t.cassavaRai) : 0;
    });
    const SOILF = [0.4, 0, 0.3, 0.7, 1];
    for (let i = 0; i < P.n; i++) {
      P.res[i] = bCls[P.breed[i]];
      let lvl = 0, w = 0;
      if (polys) {
        for (const pg of polys) {
          const bb = pg.bbox;
          if (P.lng[i] < bb[0] || P.lng[i] > bb[2] || P.lat[i] < bb[1] || P.lat[i] > bb[3]) continue;
          if (U.pointInGeometry(P.lng[i], P.lat[i], pg.geometry)) { lvl = 2; w = 1; break; }
        }
      } else {
        const ft = D.flood.byTambon[P.tcode[i]];
        if (ft && ft.level) { lvl = ft.level; w = ft.exposure; }
      }
      P.flood[i] = lvl; P.floodW[i] = w;
      const age = ageMonthsAtPeak(P.plant[i]);
      P.early[i] = lvl > 0 && age !== null && age < C.EARLY_HARVEST_MIN_MONTHS ? 1 : 0;
      // ความเสี่ยงรากเน่าโคนเน่ารายแปลง: ประวัติน้ำท่วม (ปี/7) + ข้อจำกัดดิน LDD + ปลูกช่วงฤดูฝน
      const ft = D.flood.byTambon[P.tcode[i]];
      const fFlood = polys ? (lvl ? 1 : 0) : ft ? Math.min(ft.nYears / 7, 1) : 0;
      P.rr[i] = RRW.flood * fFlood + RRW.soil * SOILF[P.soil[i]] + RRW.rain * (P.rain[i] ? 1 : 0.2);
    }
    simulateDiseases();
    buildVillages();
    buildCentroids();
    cache.clear();
  }

  function ageMonthsAtPeak(plant) {
    if (!plant || plant.length < 7) return null;
    const [y, m] = plant.split('-').map(Number);
    if (!y || !m) return null;
    const [pm] = C.FLOOD_PEAK.split('-').map(Number);
    const peakY = m > pm ? y + 1 : y;
    return (peakY - y) * 12 + (pm - m);
  }

  /* ---------- SIMULATED disease survey (deterministic, clearly tagged) ---------- */
  function simulateDiseases() {
    const P = D.P, tRate = {};
    const rate = (tcode) => {
      if (tRate[tcode]) return tRate[tcode];
      const r = U.seeded(U.hashStr('cmd' + tcode));
      const dr = U.seeded(U.hashStr('d' + tcode.slice(0, 4)))();
      const hot = r() < 0.22 ? 3.2 : 1;
      tRate[tcode] = {
        cmd: (0.004 + dr * 0.03) * hot * (0.6 + r() * 0.8),
        mealybug: 0.012 * (0.4 + r() * 1.4),
        whitefly: 0.008 * hot * (0.5 + r()),
        broom: 0.003 * (0.3 + r() * 1.4)
      };
      return tRate[tcode];
    };
    const VF = { 2: 0.1, 1: 0.45, 0: 1.2, '-1': 2.2 };
    for (let i = 0; i < P.n; i++) {
      const r = U.seeded(i * 7919 + 17);
      const tr = rate(P.tcode[i]);
      const vf = VF[P.res[i]];
      DIS.forEach((k) => {
        const p = k === 'rootrot' ? 0.003 + 0.05 * P.rr[i] * P.rr[i] : k === 'cmd' || k === 'whitefly' ? tr[k] * vf : tr[k];
        P[k][i] = r() < p ? P.rai[i] * (0.25 + r() * 0.75) : 0;
      });
    }
  }

  function buildVillages() {
    const P = D.P, m = {};
    for (let i = 0; i < P.n; i++) {
      const key = P.tcode[i] + '-' + P.moo[i];
      const v = m[key] = m[key] || { key, tcode: P.tcode[i], moo: P.moo[i], lat: 0, lng: 0, w: 0, n: 0, rai: 0, resist: 0, resistant: 0, tolerant: 0, cmd: 0, flood: 0 };
      v.lat += P.lat[i] * P.rai[i]; v.lng += P.lng[i] * P.rai[i]; v.w += P.rai[i]; v.n += P.cnt[i]; v.rai += P.rai[i];
      if (P.res[i] === 2) { v.resistant += P.rai[i]; v.resist += P.rai[i]; }
      if (P.res[i] === 1) { v.tolerant += P.rai[i]; v.resist += P.rai[i]; }
      v.cmd += P.cmd[i];
      if (P.flood[i]) v.flood += P.rai[i] * P.floodW[i];
    }
    D.villages = Object.values(m).filter((v) => v.w > 0).map((v) => Object.assign(v, { lat: v.lat / v.w, lng: v.lng / v.w }));
  }

  function buildCentroids() {
    const P = D.P, acc = {};
    for (let i = 0; i < P.n; i++) {
      [P.dcode[i], P.tcode[i]].forEach((k) => {
        const a = acc[k] = acc[k] || [0, 0, 0];
        a[0] += P.lat[i] * P.rai[i]; a[1] += P.lng[i] * P.rai[i]; a[2] += P.rai[i];
      });
    }
    D.centroid = {};
    Object.entries(acc).forEach(([k, a]) => { if (a[2] > 0) D.centroid[k] = [a[0] / a[2], a[1] / a[2]]; });
    const polyCenter = (f) => { const b = U.geomBBox(f.geometry); return [(b[1] + b[3]) / 2, (b[0] + b[2]) / 2]; };
    D.districts.forEach((d) => { if (!D.centroid[d.code]) D.centroid[d.code] = polyCenter(d.feature); });
    Object.values(D.tambons).forEach((t) => { if (!D.centroid[t.code]) D.centroid[t.code] = polyCenter(t.feature); });
  }

  /* ---------- Aggregation ---------- */
  const cache = new Map();

  function parcelSums(filterFn) {
    const P = D.P;
    const s = { planted: 0, n: 0, resist: 0, resistant: 0, tolerant: 0, modsus: 0, susceptible: 0, flood: 0, floodZone: 0, floodHigh: 0, early: 0, disRai: 0,
      soil_none: 0, soil_S1: 0, soil_S2: 0, soil_S3: 0, soil_N: 0, rainy: 0, rrSum: 0, rrHigh: 0, rrFlood: 0, rrSoil: 0, rrRain: 0 };
    DIS.forEach((k) => { s[k] = 0; });
    const SOILF = [0.4, 0, 0.3, 0.7, 1];
    for (let i = 0; i < P.n; i++) {
      if (!filterFn(i)) continue;
      const r = P.rai[i];
      s.planted += r; s.n += P.cnt[i];
      s[CODEV[P.res[i]]] += r;
      if (P.res[i] >= 1) s.resist += r;
      if (P.flood[i]) { s.flood += r * P.floodW[i]; s.floodZone += r; if (P.flood[i] === 2) s.floodHigh += r * P.floodW[i]; }
      if (P.early[i]) s.early += r * P.floodW[i];
      s.disRai += P.disRai[i];
      s['soil_' + SOILK[P.soil[i]]] += r;
      if (P.rain[i]) s.rainy += r;
      s.rrSum += P.rr[i] * r;
      if (P.rr[i] >= 0.55) s.rrHigh += r;
      const ft = D.flood.byTambon[P.tcode[i]];
      s.rrFlood += (D.flood.polygons ? (P.flood[i] ? 1 : 0) : ft ? Math.min(ft.nYears / 7, 1) : 0) * RRW.flood * r;
      s.rrSoil += SOILF[P.soil[i]] * RRW.soil * r;
      s.rrRain += (P.rain[i] ? 1 : 0.2) * RRW.rain * r;
      DIS.forEach((k) => { s[k] += P[k][i]; });
    }
    return s;
  }

  function parcelScope(scope) {
    const key = 'ps:' + scope;
    if (cache.has(key)) return cache.get(key);
    const P = D.P;
    const fn = scope === 'all' ? () => true : scope.length === 4 ? (i) => P.dcode[i] === scope : (i) => P.tcode[i] === scope;
    const s = parcelSums(fn);
    cache.set(key, s);
    return s;
  }

  function importSum(year, dcode, tcode, field) {
    let sum = null;
    for (const r of D.imports.records) {
      if (r.year !== year || r[field] == null) continue;
      if (tcode ? r.tcode !== tcode : r.dcode !== dcode) continue;
      sum = (sum || 0) + r[field];
    }
    return sum;
  }

  const VSUM = ['resist', 'resistant', 'tolerant', 'modsus', 'susceptible'];
  /** ค่ารายอำเภอ/ตำบล 1 หน่วย ก่อนรวม */
  function unit(year, dcode, tcode) {
    const ps = parcelScope(tcode || dcode);
    const out = { src: {} };
    let planted = null, harvested = null, production = null, srcArea = null, srcProd = null;
    if (year === 2569) {
      if (ps.planted > 0 || !tcode) {
        planted = ps.planted; harvested = ps.planted; srcArea = 'PARCEL';
        const y = D.avgYield[dcode];
        production = y !== null ? ps.planted * y / 1000 : null; srcProd = 'PROJECTED';
      }
    } else if (!tcode) {
      const o = D.official[year] && D.official[year][dcode];
      if (o) { planted = o.planted; harvested = o.harvested; production = o.production; srcArea = srcProd = 'OFFICIAL'; }
      else if (year === 2568) {
        let p = 0, h = 0, pr = 0, k = 0;
        [2565, 2566, 2567].forEach((yy) => { const r = D.official[yy] && D.official[yy][dcode]; if (r) { p += r.planted; h += r.harvested; pr += r.production; k++; } });
        if (k) { planted = p / k; harvested = h / k; production = pr / k; srcArea = srcProd = 'ESTIMATE'; }
      }
    }
    const ip = importSum(year, dcode, tcode, 'planted');
    if (ip !== null) { planted = ip; srcArea = 'IMPORT'; }
    const ih = importSum(year, dcode, tcode, 'harvested');
    if (ih !== null) { harvested = ih; srcArea = 'IMPORT'; } else if (ip !== null) harvested = ip;
    const ipr = importSum(year, dcode, tcode, 'production');
    if (ipr !== null) { production = ipr; srcProd = 'IMPORT'; }
    else if (ip !== null && srcProd === 'PROJECTED' && D.avgYield[dcode] !== null) production = harvested * D.avgYield[dcode] / 1000;
    Object.assign(out, { planted, harvested, production });
    out.src.area = srcArea; out.src.prod = srcProd;

    const scale = ps.planted > 0 && planted !== null ? planted / ps.planted : (year === 2569 ? 1 : null);

    let anyImportDisease = false;
    DIS.forEach((k) => {
      const iv = importSum(year, dcode, tcode, k);
      if (iv !== null) { out[k] = iv; anyImportDisease = true; }
      else out[k] = scale !== null ? ps[k] * scale * (D.simYearScale[k][year] || 1) : null;
    });
    out.src.disease = anyImportDisease ? 'IMPORT' : 'SIMULATED';

    // พันธุ์: ข้อมูลรายพันธุ์มีเฉพาะทะเบียน 2569 — ปีอื่นใช้สัดส่วนจากทะเบียน 2569 (ระบุแหล่งเป็นประมาณการ)
    const ir = importSum(year, dcode, tcode, 'resist');
    if (ir !== null) { out.resist = ir; out.src.resist = 'IMPORT'; VSUM.slice(1).forEach((k) => { out[k] = null; }); }
    else if (year === 2569) { VSUM.forEach((k) => { out[k] = ps[k]; }); out.src.resist = 'PARCEL'; }
    else if (scale !== null) { VSUM.forEach((k) => { out[k] = ps[k] * scale; }); out.src.resist = 'ESTIMATE'; }
    else { VSUM.forEach((k) => { out[k] = null; }); out.src.resist = null; }

    out.flood = scale !== null ? ps.flood * scale : null;
    out.floodHigh = scale !== null ? ps.floodHigh * scale : null;
    out.early = scale !== null ? ps.early * scale : null;
    out.disRai = year === 2569 ? ps.disRai : null;
    out.src.flood = D.flood.polygons ? 'IMPORT' : 'FLOOD';
    out.parcels = year === 2569 ? ps.n : null;
    // ชั้นดิน (ทะเบียน 2569 x แผนที่ LDD) และดัชนีรากเน่า (ไม่ขึ้นกับปี)
    ['soil_none', 'soil_S1', 'soil_S2', 'soil_S3', 'soil_N', 'rainy', 'rrSum', 'rrHigh', 'rrFlood', 'rrSoil', 'rrRain'].forEach((k) => { out[k] = ps[k]; });
    out.regPlanted = ps.planted;
    return out;
  }

  const SUM_FIELDS = ['planted', 'harvested', 'production', 'flood', 'floodHigh', 'early', 'disRai', 'parcels', 'regPlanted',
    'soil_none', 'soil_S1', 'soil_S2', 'soil_S3', 'soil_N', 'rainy', 'rrSum', 'rrHigh', 'rrFlood', 'rrSoil', 'rrRain'].concat(DIS, VSUM);

  function agg(year, f = {}) {
    const key = 'agg:' + year + ':' + (f.district || '') + ':' + (f.tambon || '') + ':' + D.imports.records.length;
    if (cache.has(key)) return cache.get(key);
    let units;
    if (f.tambon) units = [unit(year, f.tambon.slice(0, 4), f.tambon)];
    else if (f.district) units = [unit(year, f.district)];
    else units = D.districts.map((d) => unit(year, d.code));
    const out = { src: {} };
    SUM_FIELDS.forEach((k) => {
      const vals = units.map((u) => u[k]).filter(U.isNum);
      out[k] = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
    });
    ['area', 'prod', 'disease', 'resist', 'flood'].forEach((k) => {
      const ss = [...new Set(units.map((u) => u.src[k]).filter(Boolean))];
      out.src[k] = ss.length === 1 ? ss[0] : ss.includes('IMPORT') ? 'IMPORT' : ss[0] || null;
    });
    finalize(out);
    cache.set(key, out);
    return out;
  }

  function finalize(o) {
    o.yield = U.yieldKgPerRai(o.production, o.harvested);
    o.cmdPct = U.safeDiv(o.cmd, o.planted);
    o.resistPct = U.safeDiv(o.resist, o.planted);
    VSUM.slice(1).forEach((k) => { o[k + 'Pct'] = U.safeDiv(o[k], o.planted); });
    o.floodPct = U.safeDiv(o.flood, o.planted);
    o.cmdSeverity = severity(o.cmdPct);
    o.lossValue = U.isNum(o.flood) && U.isNum(o.yield) ? o.flood * o.yield * D.settings.price : null;
    o.aidBudget = U.isNum(o.flood) ? o.flood * C.AID_BAHT_PER_RAI : null;
    o.diseaseTotal = DIS.reduce((a, k) => a + (o[k] || 0), 0);
    // ดัชนีความเร่งด่วนจัดการโรคใบด่าง (0–100)
    const reg = o.regPlanted || 0;
    const susShare = reg ? ((o.susceptible || 0) + 0.5 * (o.modsus || 0)) / Math.max(o.planted || reg, 1) : null;
    o.cmdIndex = U.isNum(o.cmdPct) && U.isNum(o.resistPct)
      ? Math.round(50 * Math.min(o.cmdPct / 0.05, 1) + 30 * Math.min(susShare || 0, 1) + 20 * (1 - Math.min(o.resistPct / 0.3, 1))) : null;
    o.cmdLevel = level4(o.cmdIndex, [20, 40, 60]);
    // ดัชนีความเสี่ยงรากเน่าโคนเน่า (0–100) จากทะเบียนแปลง 2569
    o.rrIndex = reg > 0 ? Math.round(100 * o.rrSum / reg) : null;
    o.rrLevel = level4(o.rrIndex, RR_BREAKS);
    o.rrHighPct = reg > 0 ? o.rrHigh / reg : null;
    o.rrParts = reg > 0 ? { flood: 100 * o.rrFlood / reg, soil: 100 * o.rrSoil / reg, rain: 100 * o.rrRain / reg } : null;
    const soilTot = (o.soil_S1 || 0) + (o.soil_S2 || 0) + (o.soil_S3 || 0) + (o.soil_N || 0);
    o.soilPoorPct = soilTot > 0 ? ((o.soil_S3 || 0) + (o.soil_N || 0)) / soilTot : null;
    o.rainyPct = reg > 0 ? o.rainy / reg : null;
    return o;
  }

  const LV4 = [
    { key: 'good', label: 'ต่ำ', icon: '▼', color: '#1a9850' },
    { key: 'warning', label: 'ปานกลาง', icon: '●', color: '#f2c12e' },
    { key: 'serious', label: 'สูง', icon: '▲', color: '#f46d43' },
    { key: 'critical', label: 'วิกฤต', icon: '■', color: '#b2182b' }
  ];
  function level4(v, br) {
    if (!U.isNum(v)) return { key: 'na', label: 'ไม่มีข้อมูล', icon: '–', color: '#cbd5e1' };
    return LV4[v >= br[2] ? 3 : v >= br[1] ? 2 : v >= br[0] ? 1 : 0];
  }

  function severity(p) {
    if (!U.isNum(p)) return { key: 'na', label: 'ไม่มีข้อมูล', icon: '–' };
    if (p >= 0.03) return { key: 'critical', label: 'รุนแรง', icon: '▲' };
    if (p >= 0.01) return { key: 'warning', label: 'ปานกลาง', icon: '●' };
    return { key: 'good', label: 'ต่ำ', icon: '▼' };
  }

  function yoy(year, f) {
    const cur = agg(year, f), prev = C.YEARS.includes(year - 1) || D.official[year - 1] ? agg(year - 1, f) : null;
    if (!prev || !U.isNum(cur.planted) || !U.isNum(prev.planted) || prev.planted === 0) return { value: null, comparable: false };
    const comparable = cur.src.area === prev.src.area || (cur.src.area !== 'PARCEL' && prev.src.area !== 'PARCEL');
    return { value: (cur.planted - prev.planted) / prev.planted, comparable, prevSrc: prev.src.area };
  }

  const byDistrict = (year) => D.districts.map((d) => Object.assign({ code: d.code, name: d.name }, agg(year, { district: d.code })));
  const byTambon = (year, dcode) => (D.tambonsByDistrict[dcode] || []).map((t) => Object.assign({ code: t.code, name: t.name, district_code: dcode }, agg(year, { tambon: t.code })));
  const allTambons = (year) => D.districts.flatMap((d) => byTambon(year, d.code));
  const trend = (f) => C.YEARS.map((y) => Object.assign({ year: y }, agg(y, f)));

  function varietyBreakdown(f = {}) {
    const P = D.P, m = {};
    for (let i = 0; i < P.n; i++) {
      if (f.tambon ? P.tcode[i] !== f.tambon : f.district ? P.dcode[i] !== f.district : false) continue;
      const b = P.breeds[P.breed[i]];
      m[b] = (m[b] || 0) + P.rai[i];
    }
    return Object.entries(m).map(([name, rai]) => ({ name, rai, cls: varietyClass(name) })).sort((a, b) => b.rai - a.rai);
  }

  /* ---------- Proximity ---------- */
  function nearest(lat, lng, rows) {
    let best = null;
    for (const r of rows) {
      const km = U.haversineKm(lat, lng, r.lat, r.lng);
      if (!best || km < best.km) best = { row: r, km };
    }
    return best;
  }
  const nearestPest = (code, filter) => {
    const c = D.centroid[code];
    const rows = filter ? window.KPP_NETWORKS.pest.rows.filter(filter) : window.KPP_NETWORKS.pest.rows;
    return c && rows.length ? nearest(c[0], c[1], rows) : null;
  };
  const hasTricho = (r) => /ไตรโค/.test(String(r.bio || '') + String(r.other || ''));

  /* ---------- Risk & Action Matrices ---------- */
  function riskMatrix(year, dcode) {
    const units = dcode ? byTambon(year, dcode) : byDistrict(year);
    const pest = window.KPP_NETWORKS.pest.rows;
    return units.map((u) => {
      const np = nearestPest(u.code);
      const pestCount = pest.filter((p) => (dcode ? p.tambon === u.name && p.district_code === dcode : p.district_code === u.code)).length;
      const cmdN = Math.min((u.cmdPct || 0) / 0.05, 1);
      const resN = U.isNum(u.resistPct) ? 1 - Math.min(u.resistPct / 0.3, 1) : 0.5;
      const floodN = Math.min((u.floodPct || 0) / 0.3, 1);
      const minor = !U.isNum(u.planted) || u.planted < 500;
      const score = minor ? null : Math.round(100 * (0.45 * cmdN + 0.25 * resN + 0.30 * floodN));
      const level = score === null ? { key: 'na', label: 'พื้นที่ปลูกน้อย', icon: '–' } : level4(score, [25, 40, 55]);
      const flags = {
        cmdUrgent: !minor && (u.cmdPct || 0) >= 0.02 && (!U.isNum(u.resistPct) || u.resistPct < 0.1),
        floodRisk: !minor && ((u.floodPct || 0) >= 0.1 || (u.early || 0) >= 1000),
        farPest: !minor && np && np.km > 15,
        lowResist: !minor && U.isNum(u.resistPct) && u.resistPct < 0.05
      };
      const actions = [];
      if (flags.cmdUrgent) actions.push(`เร่งควบคุมโรคใบด่าง: สำรวจ-ถอนทำลายต้นเป็นโรค ${U.fmt(u.cmd)} ไร่ และกระจายท่อนพันธุ์สะอาดต้านทาน/ทนทานผ่าน ${np ? np.row.name : 'ศจช. ใกล้เคียง'}`);
      if (flags.floodRisk) actions.push(`วางแผนหลบน้ำหลาก: พื้นที่ทับซ้อนน้ำท่วมซ้ำซาก ${U.fmt(u.flood)} ไร่ (อายุพืชไม่ถึง ${C.EARLY_HARVEST_MIN_MONTHS} เดือน ณ ช่วงน้ำหลาก ${U.fmt(u.early)} ไร่) — ปรับรอบปลูก/สำรองงบช่วยเหลือ ≈ ${U.fmtCompact(u.aidBudget)} บาท`);
      if (flags.lowResist) actions.push(`ส่งเสริมพันธุ์ต้านทาน/ทนทาน (ปัจจุบัน ${U.pct(u.resistPct)}) — ตั้งแปลงขยายพันธุ์สะอาดในพื้นที่`);
      if (flags.farPest) actions.push(`ศจช. ที่ใกล้ที่สุดห่าง ${U.fmt(np.km, 1)} กม. — พิจารณาจัดตั้งจุดบริการชีวภัณฑ์/ท่อนพันธุ์เพิ่ม`);
      if (!actions.length && !minor) actions.push('เฝ้าระวังตามปกติ และรายงานผลสำรวจรายเดือน');
      return Object.assign({}, u, { nearestPest: np, pestCount, score, level, flags, actions, minor });
    }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }

  function cmdMatrix(year, dcode) {
    const units = dcode ? byTambon(year, dcode) : byDistrict(year);
    return units.map((u) => {
      const minor = !U.isNum(u.planted) || u.planted < 300;
      const np = nearestPest(u.code);
      const acts = [];
      if (minor) acts.push('พื้นที่ปลูกน้อย — เฝ้าระวังตามปกติ');
      else {
        if ((u.cmdPct || 0) >= 0.02) acts.push(`ระบาด ${U.pct(u.cmdPct)}: ตั้งจุดตรวจ/ถอนทำลายต้นเป็นโรค ห้ามเคลื่อนย้ายท่อนพันธุ์ออกนอกพื้นที่`);
        if ((u.susceptiblePct || 0) >= 0.2) acts.push(`พันธุ์อ่อนแอ ${U.pct(u.susceptiblePct)} (${U.fmt(u.susceptible)} ไร่): เร่งทดแทนด้วยพันธุ์ต้านทานอิทธิ 1–3 / ทนทานห้วยบง 60, เกษตรศาสตร์ 50`);
        if ((u.resistPct || 0) < 0.1) acts.push(`พันธุ์ต้านทาน+ทนทานเพียง ${U.pct(u.resistPct)}: ตั้งแปลงขยายท่อนพันธุ์สะอาดผ่าน ${np ? np.row.name : 'ศจช.'}${np ? ' (' + U.fmt(np.km, 1) + ' กม.)' : ''}`);
        if (!acts.length) acts.push('สถานการณ์ควบคุมได้ — รักษาสัดส่วนพันธุ์ต้านทาน และสำรวจแมลงหวี่ขาวต่อเนื่อง');
      }
      return Object.assign({}, u, { minor, nearestPest: np, actions: acts });
    }).sort((a, b) => (b.cmdIndex ?? -1) - (a.cmdIndex ?? -1));
  }

  function rootRotMatrix(dcode) {
    const units = dcode ? byTambon(2569, dcode) : allTambons(2569);
    const tricho = window.KPP_NETWORKS.pest.rows.filter(hasTricho);
    return units.filter((u) => u.regPlanted > 0).map((u) => {
      const ft = D.flood.byTambon[u.code];
      const np = nearestPest(u.code, hasTricho);
      const acts = [];
      if ((u.rrIndex || 0) >= RR_BREAKS[1]) acts.push('ยกร่องปลูก/ทำทางระบายน้ำ หลีกเลี่ยงแปลงน้ำขัง');
      if (ft && ft.nYears >= 3) acts.push(`ท่วมซ้ำ ${ft.nYears} ปี (${ft.yearList.join(', ')}) — เลื่อนปลูกหลังน้ำลด (ต.ค.–ม.ค.) หรือปลูกต้นฤดูแล้ว`);
      if ((u.soilPoorPct || 0) >= 0.4) acts.push(`ดิน S3/N ${U.pct(u.soilPoorPct)} — ปรับปรุงดินด้วยอินทรียวัตถุ/พิจารณาพืชทางเลือกตามคำแนะนำ LDD`);
      if ((u.rainyPct || 0) >= 0.6) acts.push(`ปลูกช่วงฤดูฝน ${U.pct(u.rainyPct)} — ชุบท่อนพันธุ์ด้วยสารป้องกันกำจัดเชื้อรา/ไตรโคเดอร์มาก่อนปลูก`);
      if (np) acts.push(`รับเชื้อไตรโคเดอร์มาจาก ${np.row.name} (${U.fmt(np.km, 1)} กม.)`);
      return Object.assign({}, u, { flood: ft || null, nearestTricho: np, actions: acts });
    }).sort((a, b) => (b.rrIndex ?? -1) - (a.rrIndex ?? -1));
  }

  /* ---------- Imports ---------- */
  function resolveDistrict(name) {
    const n = U.normDistrict(name);
    const d = D.districts.find((x) => U.normDistrict(x.name) === n || (x.name_en || '').toLowerCase() === String(name || '').trim().toLowerCase() || x.code === String(name).trim());
    return d ? d.code : null;
  }
  function resolveTambon(dcode, name) {
    if (!name) return null;
    const n = U.normTambon(name);
    const list = dcode ? D.tambonsByDistrict[dcode] || [] : Object.values(D.tambons);
    const t = list.find((x) => U.normTambon(x.name) === n || x.code === String(name).trim());
    return t ? t.code : null;
  }
  function addImportRecords(recs) {
    D.imports.records = D.imports.records.concat(recs);
    persistImports();
    cache.clear();
  }
  function clearImports() {
    D.imports.records = []; D.flood.polygons = null;
    persistImports(); rebuild();
  }
  function persistImports() { U.store('kpp.imports', { records: D.imports.records }); }
  function setFloodPolygons(features) {
    D.flood.polygons = features ? features.filter((f) => f.geometry && /Polygon/.test(f.geometry.type)).map((f) => ({ geometry: f.geometry, bbox: U.geomBBox(f.geometry) })) : null;
    rebuild();
  }
  function setVarietyClass(name, cls) { D.settings.varietyMap[canon(name)] = cls; }
  function addVariety(name, cls) {
    const n = String(name || '').trim();
    if (!n) return false;
    if (!allVarieties().some((v) => canon(v) === canon(n))) D.settings.extraVarieties.push(n);
    setVarietyClass(n, cls);
    return true;
  }
  function resetVarieties() { D.settings.varietyMap = defaultVarietyMap(); D.settings.extraVarieties = []; }
  function saveSettings() {
    U.store('kpp.settings.v2', D.settings);
    rebuild();
  }

  return { D, init, rebuild, agg, unit, byDistrict, byTambon, allTambons, trend, yoy, severity, level4, varietyBreakdown, riskMatrix, cmdMatrix, rootRotMatrix,
    nearestPest, nearest, hasTricho, resolveDistrict, resolveTambon, addImportRecords, clearImports, setFloodPolygons, saveSettings,
    RRW, RR_BREAKS, varietyClass, setVarietyClass, addVariety, resetVarieties, allVarieties, canon, ageMonthsAtPeak, DIS, VK, LV4 };
})();
