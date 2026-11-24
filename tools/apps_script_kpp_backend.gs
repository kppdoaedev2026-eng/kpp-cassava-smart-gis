/**
 * KPP Backend — ระบบเข้าสู่ระบบ (แอดมิน/เจ้าหน้าที่) + ข้อมูลส่วนบุคคลใน Google Sheet ส่วนตัว (ไม่เผยแพร่)
 * สำหรับ "ระบบส่งเสริมและจัดการมันสำปะหลังจังหวัดกำแพงเพชร"
 *
 * ติดตั้ง (ทำครั้งเดียว ใช้บัญชี Google ของแอดมิน):
 *  1) script.google.com › โครงการใหม่ › วางโค้ดไฟล์นี้ทั้งไฟล์ (ตั้งชื่อ KPP Backend)
 *  2) รันฟังก์ชัน setup() หนึ่งครั้ง (อนุญาตสิทธิ์) — จะสร้าง Google Sheet ส่วนตัว "KPP_PRIVATE" ในไดรฟ์ของคุณ
 *     และพิมพ์ URL ชีตกับรหัสผ่านแอดมินเริ่มต้นใน Execution log (เก็บเป็นความลับ)
 *  3) เปลี่ยนรหัสแอดมิน: รัน setAdminPin('รหัสใหม่อย่างน้อย 8 ตัว') แล้วลบรหัสออกจากประวัติการรัน
 *  4) Deploy › New deployment › Web app · Execute as: Me · Who has access: Anyone → คัดลอก URL /exec
 *     ไปใส่ใน js/config.js ที่ BACKEND_URL
 *  5) เพิ่มเจ้าหน้าที่: เปิดชีต KPP_PRIVATE แท็บ "staff" เพิ่มแถว (code, name, role=staff, active=TRUE, pin_hash)
 *     หรือรัน addStaff('รหัสเจ้าหน้าที่','ชื่อ','รหัสผ่านชั่วคราว')
 *
 * ความปลอดภัย:
 *  - ชีตเป็นของบัญชีแอดมินเท่านั้น ไม่แชร์สาธารณะ · เว็บเข้าถึงผ่านสคริปต์นี้ด้วย token ที่หมดอายุ (8 ชม.)
 *  - รหัสผ่านเก็บแบบ SHA-256 + salt · ล็อกชั่วคราวเมื่อใส่ผิด 5 ครั้ง · ทุกการเข้าถึงข้อมูลส่วนบุคคลบันทึกใน "audit"
 *  - สิทธิ์: public (ไม่ต้องล็อกอิน: ข้อมูลสรุป) · staff (เห็นพิกัด/ผังแปลงตามที่แอดมินเปิด) · admin (ทุกอย่าง + ตั้งค่า + ข้อมูลส่วนบุคคล)
 *  - แอดมินควบคุมได้ในแท็บ "settings": show_parcel_names, show_personal, map_mode (grid|parcel), staff_can_view_parcels
 */
var SHEETS = { settings: ['key', 'value', 'updated_at', 'updated_by'], staff: ['code', 'name', 'role', 'active', 'pin_hash', 'salt', 'last_login'],
               audit: ['time', 'user', 'action', 'detail'], parcels_private: ['key', 'year', 'district', 'tambon', 'moo', 'lat', 'lng', 'rai', 'variety', 'plant_date', 'harvest_date', 'owner_name', 'phone', 'note'],
               sessions: ['token', 'code', 'role', 'expires'], fails: ['code', 'count', 'locked_until'] };
var DEFAULTS = { show_parcel_names: 'FALSE', show_personal: 'FALSE', map_mode: 'grid', staff_can_view_parcels: 'TRUE', staff_can_view_names: 'FALSE' };
var TOKEN_TTL_MS = 8 * 3600 * 1000, MAX_FAILS = 5, LOCK_MS = 15 * 60 * 1000;

function props_() { return PropertiesService.getScriptProperties(); }
function ss_() { return SpreadsheetApp.openById(props_().getProperty('SHEET_ID')); }
function sh_(name) { return ss_().getSheetByName(name); }
function hash_(pin, salt) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pin + '|' + props_().getProperty('PEPPER'), Utilities.Charset.UTF_8)); }
function rows_(name) { var s = sh_(name), v = s.getDataRange().getValues(), h = v.shift(); return v.map(function (r, i) { var o = { _row: i + 2 }; h.forEach(function (k, j) { o[k] = r[j]; }); return o; }); }
function audit_(user, action, detail) { sh_('audit').appendRow([new Date(), user || '', action, String(detail || '').slice(0, 300)]); }

/** รันครั้งเดียว: สร้างชีตส่วนตัวและแอดมินเริ่มต้น */
function setup() {
  var p = props_();
  if (p.getProperty('SHEET_ID')) { Logger.log('ตั้งค่าแล้ว: ' + SpreadsheetApp.openById(p.getProperty('SHEET_ID')).getUrl()); return; }
  var ss = SpreadsheetApp.create('KPP_PRIVATE (ห้ามแชร์สาธารณะ)');
  p.setProperty('SHEET_ID', ss.getId());
  p.setProperty('PEPPER', Utilities.getUuid() + Utilities.getUuid());
  Object.keys(SHEETS).forEach(function (n, i) { var s = i === 0 ? ss.getSheets()[0].setName(n) : ss.insertSheet(n); s.appendRow(SHEETS[n]); s.setFrozenRows(1); });
  Object.keys(DEFAULTS).forEach(function (k) { sh_('settings').appendRow([k, DEFAULTS[k], new Date(), 'setup']); });
  var pin = Utilities.getUuid().slice(0, 10);
  var salt = Utilities.getUuid();
  sh_('staff').appendRow(['admin', 'ผู้ดูแลระบบ', 'admin', true, hash_(pin, salt), salt, '']);
  Logger.log('ชีตส่วนตัว: ' + ss.getUrl());
  Logger.log('รหัสแอดมินเริ่มต้น (เปลี่ยนทันทีด้วย setAdminPin): ' + pin);
}
function setAdminPin(pin) { setPin_('admin', pin); }
/** เพิ่มเจ้าหน้าที่ — districts = รหัสอำเภอที่รับผิดชอบคั่นด้วยจุลภาค เช่น '6201,6204' (ว่าง = ไม่เห็นพิกัดแปลง) */
function addStaff(code, name, pin, districts) {
  if (!code || !pin || pin.length < 6) throw new Error('รหัสผ่านอย่างน้อย 6 ตัว');
  var salt = Utilities.getUuid();
  sh_('staff').appendRow([code, name, 'staff', true, hash_(pin, salt), salt, '', districts || '']);
}
function setPin_(code, pin) {
  if (!pin || pin.length < 8) throw new Error('รหัสผ่านอย่างน้อย 8 ตัว');
  var r = rows_('staff').filter(function (x) { return x.code === code; })[0];
  if (!r) throw new Error('ไม่พบผู้ใช้');
  var salt = Utilities.getUuid();
  sh_('staff').getRange(r._row, 5, 1, 2).setValues([[hash_(pin, salt), salt]]);
  audit_(code, 'set_pin', '');
}

function settings_() {
  var o = {}; Object.keys(DEFAULTS).forEach(function (k) { o[k] = DEFAULTS[k]; });
  rows_('settings').forEach(function (r) { o[r.key] = String(r.value); });
  return o;
}
function publicSettings_() { var s = settings_(); return { map_mode: s.map_mode, show_parcel_names: false }; }   // ผู้ไม่ล็อกอินเห็นได้เฉพาะแผนที่กริด

function login_(b) {
  var code = String(b.code || '').trim(), pin = String(b.pin || '');
  var f = rows_('fails').filter(function (x) { return x.code === code; })[0];
  if (f && f.locked_until && new Date(f.locked_until) > new Date()) return { ok: false, error: 'ล็อกชั่วคราว ลองใหม่ภายหลัง 15 นาที' };
  var u = rows_('staff').filter(function (x) { return String(x.code) === code && (x.active === true || String(x.active).toUpperCase() === 'TRUE'); })[0];
  var ok = u && hash_(pin, u.salt) === u.pin_hash;
  if (!ok) {
    var n = (f ? Number(f.count) : 0) + 1, lock = n >= MAX_FAILS ? new Date(Date.now() + LOCK_MS) : '';
    if (f) sh_('fails').getRange(f._row, 2, 1, 2).setValues([[n >= MAX_FAILS ? 0 : n, lock]]); else sh_('fails').appendRow([code, n, lock]);
    audit_(code, 'login_fail', '');
    return { ok: false, error: 'รหัสไม่ถูกต้อง' };
  }
  if (f) sh_('fails').getRange(f._row, 2, 1, 2).setValues([[0, '']]);
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  sh_('sessions').appendRow([token, u.code, u.role, new Date(Date.now() + TOKEN_TTL_MS)]);
  sh_('staff').getRange(u._row, 7).setValue(new Date());
  audit_(u.code, 'login', u.role);
  return { ok: true, token: token, role: u.role, name: u.name, settings: settings_() };
}
function auth_(token) {
  if (!token) return null;
  var r = rows_('sessions').filter(function (x) { return x.token === token && new Date(x.expires) > new Date(); })[0];
  return r ? { code: r.code, role: r.role } : null;
}
function logout_(b) { var r = rows_('sessions').filter(function (x) { return x.token === b.token; })[0]; if (r) sh_('sessions').deleteRow(r._row); return { ok: true }; }

function handle_(b) {
  var a = b.action || '';
  if (a === 'ping') return { ok: true, api: 'kpp-backend', version: 1 };
  if (a === 'public_settings') return { ok: true, settings: publicSettings_() };
  if (a === 'login') return login_(b);
  if (a === 'import_rows') {                   // นำเข้าชุดข้อมูลรายปีด้วยคีย์ชั่วคราว (ตั้งด้วย PropertiesService 'IMPORT_KEY' แล้วลบด้วย clearImportKey() เมื่อเสร็จ)
    var ik = props_().getProperty('IMPORT_KEY');
    if (!ik || b.importKey !== ik) return { ok: false, error: 'คีย์นำเข้าไม่ถูกต้องหรือปิดแล้ว', code: 403 };
    var nm = 'parcels_' + String(b.year).replace(/\D/g, ''), sp = ss_().getSheetByName(nm);
    if (!sp) { sp = ss_().insertSheet(nm); sp.getRange('A:N').setNumberFormat('@'); sp.appendRow(SHEETS.parcels_private); sp.setFrozenRows(1); }
    if (b.reset) { sp.clearContents(); sp.appendRow(SHEETS.parcels_private); }
    var ir = b.rows || [];
    if (ir.length) sp.getRange(sp.getLastRow() + 1, 1, ir.length, 14).setValues(ir);
    audit_('import', 'import_rows', nm + ' n=' + ir.length + ' total=' + (sp.getLastRow() - 1));
    return { ok: true, sheet: nm, imported: ir.length, total: sp.getLastRow() - 1 };
  }
  var u = auth_(b.token);
  if (!u) return { ok: false, error: 'ต้องเข้าสู่ระบบ', code: 401 };
  if (a === 'logout') return logout_(b);
  if (a === 'whoami') return { ok: true, user: u, settings: settings_() };
  var s = settings_(), isAdmin = u.role === 'admin';
  if (a === 'get_settings') return { ok: true, settings: s };
  if (a === 'set_settings') {
    if (!isAdmin) return { ok: false, error: 'เฉพาะแอดมิน', code: 403 };
    var allowed = Object.keys(DEFAULTS), changed = [];
    allowed.forEach(function (k) {
      if (b.settings && b.settings[k] !== undefined) {
        var v = String(b.settings[k]); if (k === 'map_mode' && ['grid', 'parcel'].indexOf(v) < 0) return;
        var r = rows_('settings').filter(function (x) { return x.key === k; })[0];
        if (r) sh_('settings').getRange(r._row, 2, 1, 3).setValues([[v, new Date(), u.code]]); else sh_('settings').appendRow([k, v, new Date(), u.code]);
        changed.push(k + '=' + v);
      }
    });
    audit_(u.code, 'set_settings', changed.join(', '));
    return { ok: true, settings: settings_() };
  }
  if (a === 'change_pin') {
    var me = rows_('staff').filter(function (x) { return String(x.code) === String(u.code); })[0];
    if (!me || hash_(String(b.old_pin || ''), me.salt) !== me.pin_hash) { audit_(u.code, 'change_pin_fail', ''); return { ok: false, error: 'รหัสเดิมไม่ถูกต้อง' }; }
    if (!b.new_pin || String(b.new_pin).length < 8) return { ok: false, error: 'รหัสใหม่ต้องมีอย่างน้อย 8 ตัว' };
    setPin_(u.code, String(b.new_pin));
    return { ok: true };
  }
  if (a === 'parcels') {                       // พิกัด/ผังแปลง — แอดมินเห็นทั้งหมด · เจ้าหน้าที่เห็นเฉพาะอำเภอที่รับผิดชอบ (คอลัมน์ districts) และเมื่อแอดมินอนุญาต
    var myDistricts = isAdmin ? null : staffDistricts_(u.code);
    if (!isAdmin && (s.staff_can_view_parcels !== 'TRUE' || !myDistricts.length)) return { ok: false, error: 'ยังไม่ได้รับสิทธิ์ดูพิกัดแปลง (ต้องกำหนดอำเภอที่รับผิดชอบ)', code: 403 };
    var showNames = isAdmin ? (s.show_personal === 'TRUE' || s.show_parcel_names === 'TRUE') : (s.staff_can_view_names === 'TRUE' && s.show_parcel_names === 'TRUE');
    var yr = b.year ? String(b.year).replace(/\D/g, '') : '2569';
    var psh = ss_().getSheetByName('parcels_' + yr);
    if (!psh || psh.getLastRow() < 2) return { ok: true, count: 0, names: showNames, mode: s.map_mode, rows: [], year: yr };
    var vals = psh.getDataRange().getValues(), hh = vals.shift(), ix = {};
    hh.forEach(function (k, j) { ix[k] = j; });
    var dwant = b.district ? String(b.district) : '';
    var out = [];
    for (var ri = 0; ri < vals.length && out.length < 60000; ri++) {
      var r = vals[ri], d = String(r[ix.district]);
      if (dwant && d !== dwant) continue;
      if (myDistricts && myDistricts.indexOf(d) < 0) continue;
      var o = { key: r[ix.key], year: r[ix.year], district: d, tambon: r[ix.tambon], moo: r[ix.moo], lat: r[ix.lat], lng: r[ix.lng], rai: r[ix.rai], variety: r[ix.variety], plant_date: r[ix.plant_date], harvest_date: r[ix.harvest_date] };
      if (showNames) { o.owner_name = r[ix.owner_name]; o.name_note = r[ix.note]; }
      if (isAdmin && s.show_personal === 'TRUE') o.phone = r[ix.phone];
      out.push(o);
    }
    audit_(u.code, 'view_parcels', 'year=' + yr + ' district=' + (dwant || 'all') + ' n=' + out.length + (showNames ? ' +names' : ''));
    return { ok: true, count: out.length, names: showNames, mode: s.map_mode, rows: out, year: yr };
  }
  if (a === 'import_parcels') {               // แอดมินนำเข้าข้อมูลรายแปลง (รวมข้อมูลส่วนบุคคล) เข้าชีตส่วนตัวเป็นชุด
    if (!isAdmin) return { ok: false, error: 'เฉพาะแอดมิน', code: 403 };
    var rowsIn = (b.rows || []).map(function (r) { return [r.key, r.year, r.district, r.tambon, r.moo, r.lat, r.lng, r.rai, r.variety, r.plant_date, r.harvest_date, r.owner_name || '', r.phone || '', r.note || '']; });
    if (rowsIn.length) sh_('parcels_private').getRange(sh_('parcels_private').getLastRow() + 1, 1, rowsIn.length, 14).setValues(rowsIn);
    audit_(u.code, 'import_parcels', 'n=' + rowsIn.length);
    return { ok: true, imported: rowsIn.length };
  }
  if (a === 'audit') { if (!isAdmin) return { ok: false, error: 'เฉพาะแอดมิน', code: 403 }; var au = rows_('audit'); return { ok: true, rows: au.slice(-200).reverse() }; }
  return { ok: false, error: 'ไม่รู้จัก action: ' + a };
}

function doPost(e) {
  var out;
  try { out = handle_(JSON.parse(e.postData.contents)); } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function doGet(e) {
  var p = (e && e.parameter) || {}, out;
  try { out = p.action === 'public_settings' || p.action === 'ping' ? handle_({ action: p.action }) : { ok: true, api: 'kpp-backend', hint: 'ใช้ POST' }; }
  catch (err) { out = { ok: false, error: String(err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function staffDistricts_(code) {
  var r = rows_('staff').filter(function (x) { return String(x.code) === String(code); })[0];
  return r && r.districts ? String(r.districts).split(/[,\s]+/).filter(String) : [];
}
/** รันครั้งเดียวหลังอัปเกรด: เพิ่มคอลัมน์ districts ในแท็บ staff */
function kppUpgrade() {
  var s = sh_('staff'), h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
  if (h.indexOf('districts') < 0) s.getRange(1, h.length + 1).setValue('districts');
  Logger.log('staff header: ' + s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].join(','));
}
function clearImportKey() { props_().deleteProperty('IMPORT_KEY'); Logger.log('ปิดคีย์นำเข้าแล้ว'); }

/** ออกรหัสแอดมินใหม่แบบสุ่ม (ไม่ต้องใส่พารามิเตอร์) — ดูรหัสใน Execution log แล้วล็อกอินเปลี่ยนเป็นรหัสที่ต้องการในหน้าเว็บ */
function resetAdminPin() { var pin = Utilities.getUuid().replace(/-/g, '').slice(0, 12); setPin_('admin', pin); Logger.log('รหัสแอดมินใหม่ (ใช้ล็อกอินแล้วเปลี่ยนในหน้าเว็บ): ' + pin); }
