# -*- coding: utf-8 -*-
"""สร้างไฟล์ข้อมูล data/*.js จากไฟล์ต้นทาง
  python tools/build_ldd_soil.py   (ครั้งแรก/เมื่อเปลี่ยนแผนที่ดิน)
  python tools/build_data.py            -> data/parcels.js แบบรวมกริด 1 กม. (ปลอดภัยสำหรับเผยแพร่)
  python tools/build_data.py --private  -> เพิ่ม data/private/ รายแปลงละเอียด (ใช้ภายใน ห้าม commit)
อ่าน: ผังแปลงเกษตรกรรมดิจิทัล_*.xlsx, แบบรายงานภัยพิบัติ*.xlsx, data/source/*
ไม่ส่งออกข้อมูลส่วนบุคคล (เลขบัตร ชื่อ เบอร์โทร ที่อยู่ เลขเอกสารสิทธิ์)"""
import glob, json, os, re, sys, csv
from collections import defaultdict
import pandas as pd
import openpyxl
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from shapely import wkt as shp_wkt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', 'source')
OUT = os.path.join(ROOT, 'data')
SEARCH = [ROOT, os.path.dirname(ROOT)]


def find(pattern):
    for d in SEARCH:
        m = sorted(glob.glob(os.path.join(d, pattern)))
        if m:
            return m[-1]
    sys.exit('ไม่พบไฟล์: ' + pattern)


PRIVATE = '--private' in sys.argv
GRID_M = 1000


def write_js(name, var, obj):
    path = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write('window.%s=' % var)
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    print('  ->', name, '%.0f KB' % (os.path.getsize(path) / 1024))


def rnd(geom, nd=5):
    def r(c):
        if isinstance(c[0], (list, tuple)):
            return [r(x) for x in c]
        return [round(c[0], nd), round(c[1], nd)]
    g = mapping(geom)
    return {'type': g['type'], 'coordinates': r(g['coordinates'])}


def num(v):
    try:
        if v is None or (isinstance(v, float) and v != v):
            return 0.0
        return float(str(v).replace(',', ''))
    except ValueError:
        return 0.0


# ---------- 1. Parcels ----------
print('[1] อ่านผังแปลงดิจิทัล ...')
pfile = find('ผังแปลงเกษตรกรรมดิจิทัล_*มันสำปะหลัง*.xlsx')
cols = ['a_code', 'a_name', 't_code', 't_name', 'MOO', 'parcel_lat', 'parcel_lng', 'LAT', 'LNG', 'ACT_RAI',
        'parcel_area_rai', 'DIS_RAI', 'BREED_NAME', 'PLANT_DATE', 'PRODUCE_DATE', 'YEAR_ACT', 'wkt', 'data_org']
df = pd.read_excel(pfile, engine='openpyxl', dtype=str, usecols=lambda c: c in cols)
print('   แปลง', len(df), 'จาก', os.path.basename(pfile))

breeds, breed_idx = [], {}
tambons = {}
rows, polys = [], []
skipped = 0
for r in df.itertuples(index=False):
    lat = num(r.parcel_lat) or num(r.LAT)
    lng = num(r.parcel_lng) or num(r.LNG)
    if not (15.5 < lat < 17.2 and 98.8 < lng < 100.3):
        skipped += 1
        continue
    b = (r.BREED_NAME or '-').strip()
    if b in ('-', '', 'nan'):
        b = 'ไม่ระบุพันธุ์'
    if b not in breed_idx:
        breed_idx[b] = len(breeds)
        breeds.append(b)
    tc = str(r.t_code)
    tambons.setdefault(tc, {'code': tc, 'name': r.t_name, 'district_code': str(r.a_code), 'district': r.a_name})
    rai = num(r.ACT_RAI) or num(r.parcel_area_rai)
    pm = (r.PLANT_DATE or '')[:7]
    hm = (r.PRODUCE_DATE or '')[:7]
    moo = re.sub(r'\D', '', str(r.MOO or '')) or '0'
    rows.append([round(lat, 5), round(lng, 5), round(rai, 2), breed_idx[b], tc, int(moo), pm, hm,
                 round(num(r.DIS_RAI), 2)])
    poly = None
    if isinstance(r.wkt, str) and r.wkt.startswith('POLYGON'):
        try:
            g = shp_wkt.loads(r.wkt).simplify(0.00003)
            ring = list(g.exterior.coords) if g.geom_type == 'Polygon' else []
            if ring:
                poly = [round(c, 5) for xy in ring for c in xy]
        except Exception:
            poly = None
    polys.append(poly)
print('   ข้ามแปลงพิกัดผิดพลาด', skipped)

# ชั้นความเหมาะสมดิน LDD รายแปลง (0=นอกพื้นที่ประเมิน 1=S1 2=S2 3=S3 4=N)
import numpy as np
from pyproj import Transformer
to_utm = Transformer.from_crs(4326, 32647, always_xy=True)
npz_path = os.path.join(SRC, 'ldd_cassava_class.npz')
utm_e, utm_n = to_utm.transform(np.array([r[1] for r in rows]), np.array([r[0] for r in rows]))
if os.path.exists(npz_path):
    z = np.load(npz_path)
    cls = z['cls']; e0, n0, pm = float(z['e0']), float(z['n0']), float(z['px_m'])
    px = np.clip(((utm_e - e0) / pm).astype(int), 0, cls.shape[1] - 1)
    py = np.clip(((n0 - utm_n) / pm).astype(int), 0, cls.shape[0] - 1)
    soil = cls[py, px].tolist()
else:
    print('   ไม่พบ ldd_cassava_class.npz — รัน tools/build_ldd_soil.py ก่อน')
    soil = [0] * len(rows)
for r, s in zip(rows, soil):
    r.append(int(s))
    r.append(1)

FIELDS = ['lat', 'lng', 'rai', 'breed', 'tcode', 'moo', 'plant', 'harvest', 'dis_rai', 'soil', 'n']
meta = {
    'source': 'ผังแปลงเกษตรกรรมดิจิทัล กรมส่งเสริมการเกษตร (' + os.path.basename(pfile) + ')',
    'asof': re.search(r'(\d{1,2}-\d{1,2}-\d{4})', pfile).group(1) if re.search(r'(\d{1,2}-\d{1,2}-\d{4})', pfile) else '',
    'year': 2569, 'fields': FIELDS, 'breeds': breeds}

# --- สาธารณะ: รวมแปลงตามกริด UTM 1 กม. + ตำบล + หมู่ + พันธุ์ + เดือนปลูก/เก็บเกี่ยว + ชั้นดิน (ไม่มีพิกัด/รูปแปลงรายแปลง)
to_ll = Transformer.from_crs(32647, 4326, always_xy=True)
groups = {}
for r, e, n in zip(rows, utm_e, utm_n):
    ce, cn = int(e // GRID_M), int(n // GRID_M)
    key = (ce, cn, r[4], r[5], r[3], r[6], r[7], r[9])
    g = groups.get(key)
    if g is None:
        groups[key] = [r[2], r[8], 1]
    else:
        g[0] += r[2]; g[1] += r[8]; g[2] += 1
pub_rows = []
for (ce, cn, tc, moo, br, pm, hm, so), (rai, dis, cnt) in groups.items():
    lng, lat = to_ll.transform((ce + 0.5) * GRID_M, (cn + 0.5) * GRID_M)
    pub_rows.append([round(lat, 4), round(lng, 4), round(rai, 2), br, tc, moo, pm, hm, round(dis, 2), so, cnt])
print('   สาธารณะ: %d กลุ่ม (กริด %d ม.) จาก %d แปลง' % (len(pub_rows), GRID_M, len(rows)))
write_js('parcels.js', 'KPP_PARCELS', dict(meta, rows=pub_rows, aggregated=True, grid_m=GRID_M))
stale = os.path.join(OUT, 'parcel_polys.js')
if os.path.exists(stale):
    os.remove(stale)
if PRIVATE:
    write_js(os.path.join('private', 'parcels.js'), 'KPP_PARCELS', dict(meta, rows=rows, aggregated=False))
    write_js(os.path.join('private', 'parcel_polys.js'), 'KPP_PARCEL_POLYS', polys)

# ---------- 2. Boundaries ----------
print('[2] ขอบเขตการปกครอง ...')
dgj = json.load(open(os.path.join(SRC, 'kpp_districts.json'), encoding='utf-8'))
dist_info = {r['district_code']: r for r in csv.DictReader(open(os.path.join(SRC, 'districts.csv'), encoding='utf-8'))}
dshapes = []
for f in dgj['features']:
    c = f['properties']['code']
    g = shape(f['geometry']).buffer(0)
    dshapes.append(g)
    f['properties'].update({'area_sqkm': float(dist_info.get(c, {}).get('area_sqkm', 0) or 0)})
province = unary_union(dshapes).buffer(0.0008).buffer(-0.0008).simplify(0.001)

TH_NAMES = {'620101': 'ในเมือง', '620413': 'เกาะตาล', '620502': 'ท่ามะเขือ', '620505': 'แม่ลาด',
            '620506': 'วังยาง', '620513': 'วังบัว', '620607': 'คุยบ้านโอง', '621001': 'บึงสามัคคี',
            '621002': 'วังชะโอน', '621003': 'ระหาน'}
tgj = json.load(open(os.path.join(SRC, 'kpp_tambons.geojson'), encoding='utf-8'))
tfeat = []
for f in tgj['features']:
    p = f['properties']
    tc = p['tam_code']
    info = tambons.get(tc)
    name = info['name'] if info else TH_NAMES.get(tc, p['tam_en'])
    g = shape(f['geometry']).simplify(0.0006, preserve_topology=True)
    tfeat.append({'type': 'Feature', 'properties': {'code': tc, 'name': name, 'name_en': p['tam_en'],
                  'district_code': p['amp_code'], 'area_sqkm': round(p['area_sqkm'], 2), 'thai_name_from_parcels': bool(info)},
                  'geometry': rnd(g)})
    tambons.setdefault(tc, {'code': tc, 'name': name, 'district_code': p['amp_code']})
dname = {f['properties']['code']: f['properties']['name'] for f in dgj['features']}
for t in tambons.values():
    t['district'] = dname.get(t['district_code'], t.get('district'))

write_js('geo.js', 'KPP_GEO', {
    'districts': dgj,
    'tambons': {'type': 'FeatureCollection', 'features': tfeat},
    'province': {'type': 'Feature', 'properties': {'name': 'จังหวัดกำแพงเพชร'}, 'geometry': rnd(province)},
    'tambon_index': tambons,
    'sources': {'districts': 'KPP Agri Data Center (kpp_districts.json)',
                'tambons': 'OpenGISData-Thailand (chingchai) — ชื่อไทยจากทะเบียนแปลง DOAE'}})

# ---------- 3. Official stats ----------
print('[3] สถิติทางการ ...')
stats = []
for r in csv.DictReader(open(os.path.join(SRC, 'agri_data.csv'), encoding='utf-8')):
    if r['crop'] != 'มันสำปะหลัง':
        continue
    stats.append({'year': int(r['year']), 'district_code': r['district_code'], 'district': r['district'],
                  'planted': num(r['planted']), 'harvested': num(r['harvested']), 'production': num(r['production'])})
write_js('stats.js', 'KPP_STATS', {'source': 'สถิติการปลูกพืช สำนักงานเกษตรจังหวัดกำแพงเพชร (KPP Agri Data Center)',
                                    'rows': stats})

# ---------- 4. Networks ----------
print('[4] ศูนย์เครือข่าย ...')
def load_rows(fn):
    d = json.load(open(os.path.join(SRC, fn), encoding='utf-8'))
    return d.get('source', fn), d['rows']
net = {}
for key, fn in [('pest', 'pest_centers.json'), ('soil', 'soil_centers.json'), ('lc', 'lc_centers.json'), ('farm', 'large_farms.json')]:
    src, rws = load_rows(fn)
    if key == 'farm':
        rws = [x for x in rws if 'มันสำปะหลัง' in (str(x.get('commodity')) + str(x.get('commodity2')))]
    rws = [x for x in rws if x.get('lat') and x.get('lng')]
    net[key] = {'source': src, 'rows': rws}
    print('   ', key, len(rws))
write_js('networks.js', 'KPP_NETWORKS', net)

# ---------- 5. Flood disaster report ----------
print('[5] รายงานอุทกภัย ...')
ffile = find('แบบรายงานภัยพิบัติ*.xlsx')
wb = openpyxl.load_workbook(ffile, read_only=True, data_only=True)
name_to_code = defaultdict(dict)
for t in tambons.values():
    name_to_code[t['district']][str(t['name']).strip()] = t['code']
events, unmatched = [], set()
for sheet, hazard in [('อุทกภัย', 'flood'), ('วาตภัย', 'storm')]:
    ws = wb[sheet]
    year = dist = event = None
    for r in ws.iter_rows(values_only=True):
        a, b, c, d = r[0], r[1], r[2], r[3]
        if isinstance(b, str) and re.match(r'^ปี\s*25\d\d', b.strip()):
            year = int(re.search(r'25\d\d', b).group(0)); continue
        if a is not None and re.match(r'^25\d\d$', str(a).strip()):
            year = int(str(a).strip())
        if isinstance(b, str) and 'ช่วงเวลา' in b:
            event = re.sub(r'\s+', ' ', b.replace('\xa0', ' ')).strip()
        if c:
            dist = str(c).strip()
        if not d or not year or not dist or str(d).strip() == 'รวม':
            continue
        tname = str(d).strip()
        field = num(r[5]); total = num(r[7])
        if total <= 0 and num(r[8]) <= 0:
            continue
        code = name_to_code.get(dist, {}).get(tname)
        if not code:
            unmatched.add(dist + '/' + tname)
        events.append({'hazard': hazard, 'year': year, 'district': dist, 'tambon': tname, 'tcode': code,
                       'event': event, 'rice': num(r[4]), 'field': field, 'hort': num(r[6]), 'total': total,
                       'farmers': num(r[8]), 'aid': num(r[9])})
print('   เหตุการณ์', len(events), 'ไม่พบรหัสตำบล', len(unmatched), sorted(unmatched)[:20])
write_js('flood.js', 'KPP_FLOOD', {'source': 'แบบรายงานภัยพิบัติ ปี 2563-2569 สำนักงานเกษตรจังหวัดกำแพงเพชร',
                                    'events': events})
print('เสร็จสิ้น')
