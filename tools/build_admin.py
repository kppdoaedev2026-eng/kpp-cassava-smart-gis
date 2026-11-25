# -*- coding: utf-8 -*-
"""สร้าง admin.html (หน้าเจ้าหน้าที่/แอดมิน) จาก index.html (หน้าสาธารณะ) — รันทุกครั้งที่แก้ index.html หรือเปลี่ยนเวอร์ชัน
หน้าสาธารณะไม่มีปุ่มเข้าสู่ระบบ/นำเข้าข้อมูล/js/admin.js · admin.html = หน้าเดียวกัน + ส่วนเจ้าหน้าที่ (ไม่ให้ search engine จัดทำดัชนี)"""
import io, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s = io.open(os.path.join(ROOT, 'index.html'), encoding='utf-8', newline='').read().replace('\r\n', '\n')
ver = re.search(r'js/app\.js\?v=([\d.]+)', s).group(1)


def put(before, add, s):
    if before not in s:
        sys.exit('ไม่พบจุดแทรก: ' + before[:50])
    return s.replace(before, add + before, 1)


s = re.sub(r'      <a class="btn admin-only" id="btnStaffLink".*?</a>\n', '', s, flags=re.S)
s = put('      <button class="btn icon" id="btnTheme"', '      <button class="btn" id="btnAdmin" title="เข้าสู่ระบบแอดมิน/เจ้าหน้าที่">🔐 เจ้าหน้าที่</button>\n      <button class="btn admin-only" id="btnImport">📥 นำเข้าข้อมูล</button>\n', s)
s = put('<!-- About -->', '''<!-- Admin / Staff -->
<div class="modal" id="adminModal" hidden role="dialog" aria-modal="true" aria-labelledby="admTitle">
  <div class="modal-card narrow">
    <div class="modal-h"><h2 id="admTitle">🔐 เจ้าหน้าที่ / แอดมิน</h2><button class="btn icon" data-close aria-label="ปิด">✕</button></div>
    <div class="modal-b" id="adminBody"></div>
  </div>
</div>

''', s)
s = put('<script src="js/app.js', '<script src="js/admin.js?v=%s"></script>\n' % ver, s)
s = s.replace('v<span id="appVer"></span></span>', 'v<span id="appVer"></span> · <a href="./">หน้าสาธารณะ</a></span>', 1)
s = s.replace('<title>ระบบส่งเสริมและจัดการมันสำปะหลังจังหวัดกำแพงเพชร</title>', '<title>เจ้าหน้าที่ · ระบบส่งเสริมและจัดการมันสำปะหลังจังหวัดกำแพงเพชร</title>\n<meta name="robots" content="noindex,nofollow">', 1)
io.open(os.path.join(ROOT, 'admin.html'), 'w', encoding='utf-8', newline='').write(s)
print('admin.html v' + ver)
