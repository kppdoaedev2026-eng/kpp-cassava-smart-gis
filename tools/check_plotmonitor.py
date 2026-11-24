# -*- coding: utf-8 -*-
"""ตรวจการเชื่อมต่อ CassavaPlot Monitor (Apps Script) ว่าติดตั้ง tools/apps_script_public_api.gs สำเร็จหรือยัง
python tools/check_plotmonitor.py            # ใช้ PLOT_MONITOR_URL ใน js/config.js
python tools/check_plotmonitor.py <URL /exec>"""
import json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def plot_monitor_url():
    cfg = open(os.path.join(ROOT, 'js', 'config.js'), encoding='utf-8').read()
    m = re.search(r"PLOT_MONITOR_URL:\s*'([^']+)'", cfg)
    return m.group(1) if m else None


def probe(url, api):
    """คืน (สถานะ, ข้อมูล) — สถานะ: json / html / error"""
    try:
        with urllib.request.urlopen(url + '?api=' + api, timeout=90) as r:
            body = r.read().decode('utf-8', 'replace')
            ctype = r.headers.get('Content-Type', '')
    except Exception as e:
        return 'error', str(e)[:200]
    try:
        return 'json', json.loads(body)
    except ValueError:
        return ('html' if '<html' in body[:500].lower() or 'text/html' in ctype else 'error'), body[:120]


def post_public(url):
    """ช่องทางหลัก: doPost ของ CassavaPlot (api_publicDashboard อยู่ใน PUBLIC_FNS ไม่ต้องล็อกอิน)"""
    try:
        req = urllib.request.Request(url, data=json.dumps({'fn': 'api_publicDashboard', 'args': {'year': ''}}).encode('utf-8'),
                                     headers={'Content-Type': 'text/plain;charset=utf-8'}, method='POST')
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode('utf-8'))
    except Exception as e:
        return {'ok': False, 'error': str(e)[:200]}


def diagnose(url):
    d = post_public(url)
    if d.get('ok'):
        s = d.get('summary') or {}
        return True, 'เชื่อมต่อสำเร็จผ่าน doPost · แปลง %s · พื้นที่ %s ไร่ · อัปเดต %s' % (s.get('plotCount'), s.get('totalArea'), d.get('updatedAt'))
    print('  doPost ไม่สำเร็จ: %s — ตรวจช่องทางสำรอง ?api=public' % d.get('error'))
    st, ping = probe(url, 'ping')
    if st == 'html':
        return False, ('URL /exec ยังรันเวอร์ชันเก่า (?api=ping ได้หน้าเว็บ ไม่ใช่ JSON)\n'
                       '  สาเหตุที่เป็นไปได้: 1) ยังไม่ได้ Deploy › Manage deployments › Edit › New version (กด Save อย่างเดียวไม่พอ)\n'
                       '                    2) สร้างเป็น New deployment ซึ่งได้ URL ใหม่ — ให้นำ URL ใหม่มาใส่ PLOT_MONITOR_URL ใน js/config.js\n'
                       '                    3) บรรทัด kppPublicApi_ ไม่ได้อยู่ใน doGet ตัวที่ใช้งาน — รัน testKppPublicApi ในตัวแก้ไข Apps Script เพื่อตรวจ')
    if st == 'error':
        return False, 'เชื่อมต่อไม่ได้: ' + str(ping)
    if not (isinstance(ping, dict) and ping.get('api') == 'kpp-public'):
        return False, 'ได้ JSON แต่ไม่ใช่ช่องทาง kpp-public: ' + json.dumps(ping, ensure_ascii=False)[:160]
    st, pub = probe(url, 'public')
    if st != 'json':
        return False, '?api=ping ทำงานแล้ว แต่ ?api=public ไม่ได้ JSON: ' + str(pub)[:160]
    if not pub.get('ok'):
        return False, '?api=public ตอบกลับไม่สำเร็จ: ' + str(pub.get('error')) + '\n  ถ้าเป็นเรื่องสิทธิ์/token แสดงว่า callAPI ไม่อนุญาต api_publicDashboard โดยไม่ล็อกอิน'
    s = pub.get('summary') or {}
    return True, 'เชื่อมต่อสำเร็จ (v%s) · แปลง %s · พื้นที่ %s ไร่ · อัปเดต %s' % (pub.get('version'), s.get('plotCount'), s.get('totalArea'), pub.get('updatedAt'))


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    u = sys.argv[1] if len(sys.argv) > 1 else plot_monitor_url()
    if not u:
        sys.exit('ไม่พบ PLOT_MONITOR_URL ใน js/config.js')
    ok, msg = diagnose(u)
    print(('✔ ' if ok else '✘ ') + msg)
    sys.exit(0 if ok else 1)
