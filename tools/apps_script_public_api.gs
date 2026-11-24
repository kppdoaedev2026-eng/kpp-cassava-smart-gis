/**
 * ช่องทางข้อมูลสาธารณะ (JSON) ของ CassavaPlot Monitor สำหรับระบบส่งเสริมและจัดการมันสำปะหลังจังหวัดกำแพงเพชร
 *
 * วิธีติดตั้ง (ทำครั้งเดียว ในโปรเจกต์ Apps Script ของ CassavaPlot Monitor):
 *   1) วางฟังก์ชัน kppPublicApi_ ด้านล่างไว้ในไฟล์ .gs ใดก็ได้ของโปรเจกต์
 *   2) เพิ่มบรรทัดนี้เป็นบรรทัดแรกในฟังก์ชัน doGet(e) เดิม:
 *        var api = kppPublicApi_(e); if (api) return api;
 *   3) Deploy › Manage deployments › แก้ไข deployment เดิม › Version: New version › Deploy
 *      (ใช้ URL /exec เดิม ไม่ต้องเปลี่ยนในระบบ)
 *   4) ทดสอบ: เปิด <URL /exec>?api=public  ต้องได้ JSON ที่มี "ok":true
 *
 * ส่งออกเฉพาะข้อมูลสรุปที่หน้า "แดชบอร์ดสาธารณะ" แสดงอยู่แล้ว (api_publicDashboard):
 * จำนวนแปลง พื้นที่ ต้นพันธุ์ รายอำเภอ/รายพันธุ์ สถานะ เป้าหมาย — ไม่มีชื่อ เบอร์โทร เลขบัตร หรือพิกัดรายแปลง
 */
function kppPublicApi_(e) {
  var p = (e && e.parameter) || {};
  if (p.api !== 'public') return null;
  var json;
  try {
    json = callAPI('api_publicDashboard', JSON.stringify({ year: p.year || '' }), '');
  } catch (err) {
    json = JSON.stringify({ ok: false, error: String(err && err.message || err) });
  }
  if (typeof json !== 'string') json = JSON.stringify(json);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
