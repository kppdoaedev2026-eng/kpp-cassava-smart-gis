# -*- coding: utf-8 -*-
"""ชั้นชุดดิน/กลุ่มชุดดิน จ.กำแพงเพชร ของกรมพัฒนาที่ดิน (มาตราส่วน 1:25,000) -> data/ldd_soilseries.js

ต้นทาง (ดาวน์โหลดจาก https://tswc.ldd.go.th/DownloadGIS/):
  web_Soil/SoilSeries/N/sr_kpt.rar           ชุดดิน  (texture_to, fertility, pH_top, soilgroup, soilseries, seriesname)
  web_Soilgroup/DataSoilgroup/N/sg_kpt.rar   กลุ่มชุดดิน (fer_top, tex_top, tex_low, pH_top, pH_low)
แตกไฟล์ไว้ที่ data/source/ldd_soil/ (ไม่ commit) หรือระบุโฟลเดอร์: python tools/build_ldd_soilseries.py <โฟลเดอร์>
ระบบพิกัดต้นทาง WGS84 UTM 47N -> WGS84 lat/lng · ลดความละเอียดเส้นขอบ 20 ม. สำหรับแสดงผลบนเว็บ
"""
import glob, json, os, sys
import shapefile
from shapely.geometry import shape, mapping
from shapely.ops import transform
from pyproj import Transformer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'data', 'source', 'ldd_soil')
OUT = os.path.join(ROOT, 'data', 'ldd_soilseries.js')
SIMPLIFY_M = 20
sr_shp = (glob.glob(os.path.join(SRC, '**', 'Soil_*.shp'), recursive=True) or [None])[0]
sg_shp = (glob.glob(os.path.join(SRC, '**', 'soilgroup_*.shp'), recursive=True) or [None])[0]
if not sr_shp:
    sys.exit('ไม่พบ Soil_*.shp ใน ' + SRC)
to_wgs = Transformer.from_crs(32647, 4326, always_xy=True).transform

# กลุ่มชุดดิน: คุณสมบัติรายกลุ่ม (ดินล่าง/pH ดินล่าง) — ค่าคงที่ต่อกลุ่ม ใช้ค่าที่พบบ่อยที่สุด
groups = {}
if sg_shp:
    r = shapefile.Reader(sg_shp, encoding='cp874')
    f = [x[0] for x in r.fields[1:]]
    for rec in r.iterRecords():
        d = dict(zip(f, rec))
        g = str(d['soilgroup']).strip()
        k = (d['fer_top'], d['tex_top'], d['tex_low'], d['pH_top'], d['pH_low'])
        groups.setdefault(g, {}).setdefault(k, 0)
        groups[g][k] += 1
    groups = {g: dict(zip(['fer', 'tex_top', 'tex_low', 'ph_top', 'ph_low'], max(v, key=v.get))) for g, v in groups.items()}

r = shapefile.Reader(sr_shp, encoding='cp874')
fields = [x[0] for x in r.fields[1:]]
units, uidx, feats = [], {}, []
area_by_unit = {}
for sr in r.iterShapeRecords():
    d = dict(zip(fields, sr.record))
    key = (str(d['soilgroup']).strip(), str(d['soilseries']).strip(), str(d['seriesname']).strip(),
           str(d['texture_to']).strip(), str(d['fertility']).strip(), str(d['pH_top']).strip().replace('ถุง', 'ถึง'))   # แก้คำพิมพ์ผิดในต้นฉบับ
    if key not in uidx:
        uidx[key] = len(units)
        g = groups.get(key[0], {})
        units.append({'group': key[0], 'code': key[1], 'name': key[2], 'texture': key[3], 'fertility': key[4], 'ph': key[5],
                      'tex_low': g.get('tex_low'), 'ph_range_top': g.get('ph_top'), 'ph_range_low': g.get('ph_low')})
    geo = sr.shape.__geo_interface__
    geo = {'type': geo['type'], 'coordinates': [[[c[0], c[1]] for c in ring] for ring in geo['coordinates']]} if geo['type'] == 'Polygon' else \
          {'type': geo['type'], 'coordinates': [[[[c[0], c[1]] for c in ring] for ring in poly] for poly in geo['coordinates']]}
    g = shape(geo).buffer(0)
    if g.is_empty:
        continue
    i = uidx[key]
    area_by_unit[i] = area_by_unit.get(i, 0) + g.area / 1600.0          # ตร.ม. -> ไร่
    gs = transform(to_wgs, g.simplify(SIMPLIFY_M, preserve_topology=True))
    if gs.is_empty:
        continue
    m = mapping(gs)

    def rnd(c):
        return [rnd(x) for x in c] if isinstance(c[0], (list, tuple)) else [round(c[0], 5), round(c[1], 5)]
    feats.append({'type': 'Feature', 'properties': {'u': i}, 'geometry': {'type': m['type'], 'coordinates': rnd(m['coordinates'])}})

for i, u in enumerate(units):
    u['rai'] = round(area_by_unit.get(i, 0))
out = {'source': 'กรมพัฒนาที่ดิน: ข้อมูลชุดดินและกลุ่มชุดดิน จ.กำแพงเพชร มาตราส่วน 1:25,000 (tswc.ldd.go.th/DownloadGIS, ปรับปรุงไฟล์ เม.ย. 2567)',
       'note': 'เส้นขอบลดความละเอียด %d ม. เพื่อแสดงผลบนเว็บ · ความอุดมสมบูรณ์และ pH เป็นค่าประจำหน่วยแผนที่จากการสำรวจดิน ไม่ใช่ผลวิเคราะห์ดินรายแปลง' % SIMPLIFY_M,
       'units': units, 'geojson': {'type': 'FeatureCollection', 'features': feats}}
with open(OUT, 'w', encoding='utf-8') as fo:
    fo.write('window.KPP_SOILSERIES=')
    json.dump(out, fo, ensure_ascii=False, separators=(',', ':'))
    fo.write(';\n')
print('หน่วยแผนที่ดิน %d · polygon %d · กลุ่มชุดดิน %d -> %s %.1f MB' % (len(units), len(feats), len(groups), OUT, os.path.getsize(OUT) / 1e6))
