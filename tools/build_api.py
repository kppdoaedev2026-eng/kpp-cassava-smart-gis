# -*- coding: utf-8 -*-
"""สร้าง API สาธารณะ (JSON แบบ static, CORS เปิดโดย GitHub Pages) สำหรับระบบอื่นดึงข้อมูล -> api/v1/*.json

เผยแพร่เฉพาะข้อมูลสรุป (รายจังหวัด/อำเภอ/ตำบล) ไม่มีข้อมูลบุคคลและไม่มีพิกัดรายแปลง
อ่านจาก data/*.js ที่สร้างไว้แล้ว: stats.js, reports.js, parcel_trends.js, ldd_soilseries.js(ชื่อชุดดิน), geo.js
python tools/build_api.py   (รันหลัง build_data.py / build_reports.py / analyze_parcels.py)
ตัวอย่างเรียก: https://kppdoaedev2026-eng.github.io/kpp-cassava-smart-gis/api/v1/index.json
"""
import datetime, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'api', 'v1')
BASE = 'https://kppdoaedev2026-eng.github.io/kpp-cassava-smart-gis/api/v1/'
os.makedirs(OUT, exist_ok=True)


def load(name):
    p = os.path.join(ROOT, 'data', name)
    if not os.path.exists(p):
        return None
    s = open(p, encoding='utf-8').read()
    return json.loads(s[s.index('=') + 1:].rstrip().rstrip(';'))


def cfg(key):
    c = open(os.path.join(ROOT, 'js', 'config.js'), encoding='utf-8').read()
    m = re.search(key + r":\s*'([^']+)'", c)
    return m.group(1) if m else None


VERSION = cfg('VERSION')
NOW = datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:%S+07:00')
geo, stats, rep, tr = load('geo.js'), load('stats.js'), load('reports.js'), load('parcel_trends.js')
dnames = {f['properties']['code']: f['properties']['name'] for f in geo['districts']['features']}
tnames = {c: t['name'] for c, t in geo['tambon_index'].items()}
files = {}


def put(name, obj, desc):
    doc = {'api': 'kpp-cassava', 'version': 'v1', 'app_version': VERSION, 'generated_at': NOW, 'license': 'ข้อมูลสรุปเพื่อการบริหาร สนง.เกษตรจังหวัดกำแพงเพชร — โปรดอ้างอิงแหล่งที่มา', **obj}
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    files[name] = {'url': BASE + name, 'description': desc, 'bytes': os.path.getsize(os.path.join(OUT, name))}


put('districts.json', {'districts': [{'code': c, 'name': n} for c, n in sorted(dnames.items())],
                       'tambons': [{'code': c, 'name': n, 'district_code': c[:4]} for c, n in sorted(tnames.items())]},
    'รหัสและชื่ออำเภอ/ตำบล (รหัสตามกรมการปกครอง)')

if stats:
    rows = [{'year': r['year'], 'district_code': r['district_code'], 'district': r['district'],
             'planted_rai': r['planted'], 'harvested_rai': r['harvested'], 'production_ton': r['production'],
             'yield_kg_per_rai': round(r['production'] / r['harvested'] * 1000, 1) if r['harvested'] else None} for r in stats['rows']]
    put('production.json', {'unit_note': 'ปี พ.ศ. · พื้นที่ไร่ · ผลผลิตตัน · ผลผลิตต่อไร่ = ผลผลิต/พื้นที่เก็บเกี่ยว×1000', 'source': stats['source'], 'rows': rows},
        'สถิติพื้นที่ปลูก/เก็บเกี่ยว/ผลผลิต/ผลผลิตต่อไร่ รายอำเภอ รายปี (สถิติทางการ)')

if rep:
    if rep.get('registry'):
        r = rep['registry']
        put('registry.json', {'source': r['source'], 'province': r['province'],
                              'districts': [dict(code=c, **v) for c, v in r['districts'].items()],
                              'tambons': [dict(code=c, **v) for c, v in r['tambons'].items()]},
            'ทะเบียนเกษตรกรมันสำปะหลัง ปี 2569 (เกษตรกร/แปลง/ไร่) รายอำเภอ/ตำบล')
    if rep.get('cmd_history'):
        put('cmd.json', {'source': rep['cmd']['source'], 'history': rep['cmd_history'],
                         'latest_by_district': [{'code': c, 'name': dnames.get(c), 'planted_rai': v['standing']['total']['rai'], 'cmd_rai': v['now']['total']['rai'],
                                                 'cmd_farmers': v['now']['total']['farmers']} for c, v in rep['cmd']['districts'].items()],
                         'severity_thresholds_pct_of_planted': {'low': '<5', 'moderate': '5-15', 'high': '15-30', 'critical': '>=30'}},
            'สถานการณ์ระบาดโรคใบด่างมันสำปะหลังรายรอบรายงาน (รายอำเภอ)')
    if rep.get('support'):
        put('support.json', {'source': rep['support']['source'], 'stalks_per_rai': rep['support']['stalks_per_rai'], 'records': rep['support']['records']},
            'การสนับสนุนท่อนพันธุ์ทุกโครงการ (รวมรายโครงการ/อำเภอ ไม่มีข้อมูลเกษตรกร)')
    if rep.get('resist_plots'):
        put('resist_plots.json', {'source': rep['resist_plots']['source'], 'total': rep['resist_plots']['total'],
                                  'tambons': [dict(code=c, name=tnames.get(c), **{k: v for k, v in t.items() if k in ('plots', 'rai', 'cuttings', 'varieties')}) for c, t in rep['resist_plots']['tambons'].items()]},
            'แปลงส่งเสริมพันธุ์ต้านทาน/ทนทาน รวมรายตำบล')
    if rep.get('plot_monitor'):
        pm = rep['plot_monitor']
        put('plot_monitor.json', {'fetched_at': pm.get('fetched_at'), 'updated_at': pm.get('updatedAt'), 'summary': pm.get('summary'), 'by_district': pm.get('byDistrict'), 'by_variety': pm.get('byVariety')},
            'สรุปจากระบบติดตามแปลงส่งเสริม CassavaPlot Monitor')

if tr:
    put('trends.json', {'source': tr['source'], 'method': tr['method'], 'years': tr['years'], 'breeds': tr['breeds'], 'variety': tr['variety'], 'plant_month': tr['plant_month'],
                        'harvest_month': tr.get('harvest_month'), 'growth': tr.get('growth'), 'data_quality': {k: v for k, v in tr['quality'].items() if k != 'panel_match'}},
        'ผังแปลงหลายปี 2563–2569: พันธุ์ เดือนปลูก/เก็บเกี่ยว อายุเก็บเกี่ยว รายปี/อำเภอ/ตำบล (รวมกลุ่ม)')

c = open(os.path.join(ROOT, 'js', 'config.js'), encoding='utf-8').read()
pm = re.search(r"PRICES:\s*\[(.*?)\n  \],", c, re.S)
if pm:
    prices = [dict(date=d, place=p, price_baht_per_kg=float(v), kind=k, source=s) for d, p, v, k, s in
              re.findall(r"date: '([^']+)', place: '([^']+)', price: ([\d.]+), kind: '([^']+)', src: '([^']+)'", pm.group(1))]
    put('prices.json', {'prices': prices}, 'ราคาหัวมันสำปะหลังสด (บาท/กก.) พร้อมแหล่งอ้างอิง')

put('index.json', {'name': 'KPP Cassava API', 'description': 'API ข้อมูลสรุปมันสำปะหลังจังหวัดกำแพงเพชร (อ่านอย่างเดียว) — เป็น JSON static รองรับ CORS', 'docs': 'https://kppdoaedev2026-eng.github.io/kpp-cassava-smart-gis/api/README.md',
                    'endpoints': files}, 'รายการ endpoint ทั้งหมด')
print('API v1: %d ไฟล์ -> %s' % (len(files), OUT))
for n, v in files.items():
    print('  %-22s %7.1f KB  %s' % (n, v['bytes'] / 1024, v['description']))
