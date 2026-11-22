KPP.U = (function () {
  const nfInt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const safeDiv = (a, b) => (isNum(a) && isNum(b) && b !== 0 ? a / b : null);

  function fmt(v, digits) {
    if (!isNum(v)) return '–';
    if (digits === 1) return nf1.format(v);
    if (digits === 2) return nf2.format(v);
    return nfInt.format(v);
  }
  function fmtCompact(v) {
    if (!isNum(v)) return '–';
    const a = Math.abs(v);
    if (a >= 1e6) return nf1.format(v / 1e6) + ' ล.';
    if (a >= 1e4) return nf1.format(v / 1e3) + ' พัน';
    return nfInt.format(v);
  }
  const pct = (v, d = 1) => (isNum(v) ? (d === 1 ? nf1 : nf2).format(v * 100) + '%' : '–');

  /** ผลผลิตเฉลี่ย กก./ไร่ = ผลผลิต(ตัน) ÷ เนื้อที่เก็บเกี่ยว(ไร่) × 1,000 */
  const yieldKgPerRai = (prodTon, harvRai) => {
    const r = safeDiv(prodTon, harvRai);
    return r === null ? null : r * 1000;
  };

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371.0088, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /** UTM (WGS84) → [lat, lng]  — northern hemisphere; zone 47 = กำแพงเพชร */
  function utmToLatLng(easting, northing, zone = 47, south = false) {
    const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
    const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    const x = easting - 500000, y = south ? northing - 10000000 : northing;
    const lon0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
    const M = y / k0;
    const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256));
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
      + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
      + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
    const s = Math.sin(phi1), c = Math.cos(phi1), t = Math.tan(phi1);
    const N1 = a / Math.sqrt(1 - e2 * s * s);
    const T1 = t * t, C1 = ep2 * c * c;
    const R1 = a * (1 - e2) / Math.pow(1 - e2 * s * s, 1.5);
    const D = x / (N1 * k0);
    const lat = phi1 - (N1 * t / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
    const lng = lon0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6
      + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / c;
    return [lat * 180 / Math.PI, lng * 180 / Math.PI];
  }

  function seeded(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function pointInRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function pointInGeometry(lng, lat, geom) {
    if (!geom) return false;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    for (const poly of polys) {
      if (pointInRing(lng, lat, poly[0])) {
        let hole = false;
        for (let k = 1; k < poly.length; k++) if (pointInRing(lng, lat, poly[k])) { hole = true; break; }
        if (!hole) return true;
      }
    }
    return false;
  }
  function geomBBox(geom) {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    const walk = (c) => {
      if (typeof c[0] === 'number') { b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]); }
      else c.forEach(walk);
    };
    if (geom && geom.coordinates) walk(geom.coordinates);
    return b;
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function normDistrict(s) {
    return String(s || '').replace(/^(อำเภอ|อ\.)\s*/, '').replace(/\s+/g, '').trim();
  }
  function normTambon(s) {
    return String(s || '').replace(/^(ตำบล|ต\.)\s*/, '').replace(/\s+/g, '').trim();
  }
  function toNum(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const n = parseFloat(String(v).replace(/[, ]/g, ''));
    return isFinite(n) ? n : null;
  }

  function download(filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function toast(msg, type = 'info', ms = 3600) {
    const host = document.getElementById('toasts');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 400);
  }

  const thaiDate = (d = new Date()) => d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

  function store(key, val) {
    try {
      if (val === undefined) { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
      if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) { return null; }
  }

  return { isNum, safeDiv, fmt, fmtCompact, pct, yieldKgPerRai, haversineKm, utmToLatLng, seeded, hashStr,
    pointInGeometry, geomBBox, esc, normDistrict, normTambon, toNum, download, toast, thaiDate, store };
})();
