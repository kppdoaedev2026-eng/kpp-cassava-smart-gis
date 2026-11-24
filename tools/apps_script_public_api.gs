/**
 * ช่องทางข้อมูลสาธารณะ (JSON) ของ CassavaPlot Monitor สำหรับระบบส่งเสริมและจัดการมันสำปะหลังจังหวัดกำแพงเพชร  — v2
 *
 * วิธีติดตั้ง (ทำครั้งเดียว ในโปรเจกต์ Apps Script ของ CassavaPlot Monitor):
 *   1) สร้างไฟล์ใหม่ (+ › Script) ชื่อ KppPublicApi แล้ววางโค้ดทั้งไฟล์นี้
 *   2) เปิดไฟล์ที่มี function doGet(e) เดิม แล้วเพิ่มบรรทัดนี้เป็นบรรทัดแรกภายใน doGet:
 *        var api = kppPublicApi_(e); if (api) return api;
 *      (ถ้าโปรเจกต์มี doGet มากกว่าหนึ่งตัว Apps Script ใช้ตัวที่ประกาศทีหลัง — ต้องใส่ในตัวนั้น)
 *   3) ทดสอบก่อน Deploy: เลือกฟังก์ชัน testKppPublicApi ในแถบด้านบน › Run › ดู Execution log
 *      ต้องเห็น  "ping: OK"  และ  "public: ok=true แปลง=..."
 *   4) Deploy › Manage deployments › ไอคอนดินสอ (Edit) ที่ deployment เดิม › Version: New version › Deploy
 *      (ห้ามเลือก New deployment เพราะจะได้ URL ใหม่) — การกด Save อย่างเดียว URL /exec จะยังรันเวอร์ชันเก่า
 *   5) เปิด <URL /exec>?api=ping  ต้องได้ {"ok":true,"api":"kpp-public",...}
 *      แล้วเปิด <URL /exec>?api=public  ต้องได้ JSON ที่มี "ok":true
 *
 * ส่งออกเฉพาะข้อมูลสรุปที่หน้า "แดชบอร์ดสาธารณะ" แสดงอยู่แล้ว (api_publicDashboard):
 * จำนวนแปลง พื้นที่ ต้นพันธุ์ รายอำเภอ/รายพันธุ์ สถานะ เป้าหมาย — ไม่มีชื่อ เบอร์โทร เลขบัตร หรือพิกัดรายแปลง
 */
var KPP_PUBLIC_API_VERSION = 2;

function kppPublicApi_(e) {
  var p = (e && e.parameter) || {};
  if (p.api !== 'public' && p.api !== 'ping') return null;
  var out;
  if (p.api === 'ping') {
    out = { ok: true, api: 'kpp-public', version: KPP_PUBLIC_API_VERSION, time: new Date().toISOString() };
  } else {
    try {
      var json = callAPI('api_publicDashboard', JSON.stringify({ year: p.year || '' }), '');
      out = typeof json === 'string' ? JSON.parse(json) : json;
    } catch (err) {
      out = { ok: false, error: 'callAPI api_publicDashboard: ' + String(err && err.message || err) };
    }
    if (out && typeof out === 'object') { out.api = 'kpp-public'; out.version = KPP_PUBLIC_API_VERSION; }
  }
  var text = JSON.stringify(out);
  // JSONP (?callback=ชื่อฟังก์ชัน) สำหรับเบราว์เซอร์ที่ถูกบล็อก CORS
  if (p.callback && /^[A-Za-z_$][\w$.]{0,60}$/.test(p.callback)) {
    return ContentService.createTextOutput(p.callback + '(' + text + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

/** รันในตัวแก้ไข Apps Script เพื่อทดสอบก่อน Deploy (ดูผลที่ Execution log) */
function testKppPublicApi() {
  var ping = kppPublicApi_({ parameter: { api: 'ping' } });
  Logger.log('ping: ' + (ping && JSON.parse(ping.getContent()).ok ? 'OK' : 'ไม่ทำงาน'));
  var pub = kppPublicApi_({ parameter: { api: 'public' } });
  var d = JSON.parse(pub.getContent());
  Logger.log('public: ok=' + d.ok + (d.ok ? ' แปลง=' + ((d.summary || {}).plotCount) + ' พื้นที่=' + ((d.summary || {}).totalArea) : ' error=' + d.error));
  if (typeof doGet === 'function') {
    var r = doGet({ parameter: { api: 'ping' } });
    var isJson = r && typeof r.getContent === 'function' && /kpp-public/.test(String(r.getContent()));
    Logger.log('doGet(?api=ping): ' + (isJson ? 'OK — ใส่บรรทัดใน doGet ถูกต้องแล้ว เหลือ Deploy เวอร์ชันใหม่' : 'ยังส่งหน้าเว็บ — ยังไม่ได้ใส่บรรทัด kppPublicApi_ ใน doGet ตัวที่ใช้งาน'));
  }
}
