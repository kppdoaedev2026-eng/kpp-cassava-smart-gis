# -*- coding: utf-8 -*-
"""วิเคราะห์ผังแปลงมันสำปะหลังหลายปี -> data/parcel_trends.js (ข้อมูลสรุป เผยแพร่ได้ ไม่มีพิกัดรายแปลง/ข้อมูลบุคคล)

อ่าน : data/private/cassava_parcels_all.csv.gz (จาก tools/extract_parcels.py) · data/ldd_soilseries.js (tools/build_ldd_soilseries.py)
หลักการ:
  - หน่วยนับ = กิจกรรมการปลูก 1 รายการ (ACT ไม่ซ้ำ) · พื้นที่ = ACT_RAI (ถ้าว่างใช้ parcel_area_rai)
  - ปี = YEAR_ACT (ปีเพาะปลูกตามระบบทะเบียน) · ผังแปลงเป็นข้อมูลที่เกษตรกรขึ้นทะเบียน ไม่ใช่การสุ่มตัวอย่าง
    จึงรายงานเป็นสัดส่วน (ถ่วงพื้นที่) พร้อมจำนวนแปลง n และช่วงความเชื่อมั่น 95% แบบ Wilson ของสัดส่วนเชิงจำนวนแปลง
  - ความต่อเนื่องรายแปลง: จับคู่แปลงข้ามปีตามตำแหน่ง (ห่าง ≤ 25 ม. พื้นที่ต่าง ≤ 30%) เพราะรหัสแปลงไม่คงที่ข้ามปี -> ตารางเปลี่ยนพันธุ์
  - คุณภาพข้อมูล: พิกัดนอกจังหวัด, ไม่ระบุพันธุ์, พื้นที่ ≤ 0, พื้นที่กิจกรรม > 1.2 เท่าของพื้นที่แปลง (ตัดออกจากผลรวม), วันปลูกผิดปกติ
  - ชุดดิน: ตำแหน่งแปลง (จุดศูนย์กลาง) ซ้อนทับชั้นชุดดิน LDD 1:25,000
python tools/analyze_parcels.py"""
import json, math, os, re
import numpy as np
import pandas as pd
from pyproj import Transformer
from shapely import STRtree, points
from shapely.geometry import shape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', 'private', 'cassava_parcels_all.csv.gz')
OUT = os.path.join(ROOT, 'data', 'parcel_trends.js')
MIN_N = 30            # ปีที่มีแปลงน้อยกว่านี้ไม่ใช้เปรียบเทียบแนวโน้ม

df = pd.read_csv(SRC, dtype=str, compression='gzip')
q = {'rows_raw': int(len(df))}
num = lambda s: pd.to_numeric(s.str.replace(',', '', regex=False), errors='coerce')
df['year'] = num(df['YEAR_ACT']).astype('Int64')
df['act'] = num(df['ACT_RAI'])
df['par'] = num(df['parcel_area_rai'])
df['rai'] = df['act'].where(df['act'] > 0, df['par'])
df['lat'] = num(df['parcel_lat']).where(num(df['parcel_lat']).notna(), num(df['LAT']))
df['lng'] = num(df['parcel_lng']).where(num(df['parcel_lng']).notna(), num(df['LNG']))
df['dc'] = df['a_code'].str.strip().str[-4:]
df['tc'] = df['t_code'].str.strip().str[-6:]
b = df['BREED_NAME'].fillna('').str.strip()
df['breed'] = b.where(~b.isin(['', '-', 'nan']), 'ไม่ระบุพันธุ์')

flags = pd.DataFrame(index=df.index)
flags['no_year'] = df['year'].isna()
flags['bad_coord'] = ~((df['lat'] > 15.5) & (df['lat'] < 17.2) & (df['lng'] > 98.8) & (df['lng'] < 100.3))
flags['bad_area'] = ~(df['rai'] > 0) | (df['rai'] > 1000)
flags['area_gt_parcel'] = (df['act'] > 0) & (df['par'] > 0) & (df['act'] > 1.2 * df['par'])
pd_ = pd.to_datetime(df['PLANT_DATE'], errors='coerce')
flags['bad_plant_date'] = pd_.isna() | (pd_.dt.year < 2015) | (pd_ > pd.Timestamp('2027-12-31'))
flags['no_breed'] = df['breed'] == 'ไม่ระบุพันธุ์'
excl = flags['no_year'] | flags['bad_area'] | flags['area_gt_parcel']
df['plant_m'] = pd_.dt.month
hd_ = pd.to_datetime(df['PRODUCE_DATE'], errors='coerce')
df['harv_m'] = hd_.dt.month
df['grow_mo'] = ((hd_ - pd_).dt.days / 30.44).where(lambda x: (x >= 5) & (x <= 24))   # อายุเก็บเกี่ยว (เดือน) ตัดค่าผิดปกติ < 5 หรือ > 24
q['by_flag'] = {k: int(v) for k, v in flags.sum().items()}
q['excluded_from_totals'] = int(excl.sum())
d = df[~excl].copy()
q['rows_used'] = int(len(d))

# ---------- ปริมาณรายปี ----------
years = sorted(int(y) for y in d['year'].dropna().unique())
yinfo = {}
for y in years:
    s = d[d['year'] == y]
    yinfo[y] = {'n': int(len(s)), 'rai': round(float(s['rai'].sum()), 2), 'parcels': int(s['AREA_ID'].nunique()),
                'no_breed_share': round(float(s.loc[s['breed'] == 'ไม่ระบุพันธุ์', 'rai'].sum() / s['rai'].sum()), 4) if len(s) else None,
                'files': sorted(s['src_file'].str.extract(r'_(\d+)\.xlsx$')[0].fillna('มันฯ').where(~s['src_file'].str.contains('มันสำปะหลัง'), 'มันฯ').unique().tolist())}
# ปีที่ข้อมูลครบพอเปรียบเทียบ: n ≥ MIN_N และพื้นที่ ≥ 50% ของค่ามัธยฐานทุกปี (ปีที่ส่งออกข้อมูลไม่ครบจะถูกระบุว่าไม่ครบ)
med = float(np.median([v['rai'] for v in yinfo.values()])) if yinfo else 0
for y, v in yinfo.items():
    v['coverage_vs_median'] = round(v['rai'] / med, 3) if med else None
    v['comparable'] = bool(v['n'] >= MIN_N and med and v['rai'] >= 0.5 * med)

# ---------- พันธุ์ รายปี × อำเภอ × ตำบล (ชื่อพันธุ์ดิบ ให้หน้าเว็บจัดกลุ่มตามการตั้งค่า) ----------
g = d.groupby(['year', 'dc', 'tc', 'breed']).agg(n=('rai', 'size'), rai=('rai', 'sum')).reset_index()
breeds = sorted(g['breed'].unique().tolist())
bix = {b: i for i, b in enumerate(breeds)}
vrows = [[int(r.year), r.dc, r.tc, bix[r.breed], int(r.n), round(float(r.rai), 2)] for r in g.itertuples(index=False)]

# ---------- เดือนปลูก รายปี × อำเภอ ----------
m = d.dropna(subset=['plant_m']).groupby(['year', 'dc', 'plant_m']).agg(n=('rai', 'size'), rai=('rai', 'sum')).reset_index()
mrows = [[int(r.year), r.dc, int(r.plant_m), int(r.n), round(float(r.rai), 2)] for r in m.itertuples(index=False)]
h = d.dropna(subset=['harv_m']).groupby(['year', 'dc', 'harv_m']).agg(n=('rai', 'size'), rai=('rai', 'sum')).reset_index()
hrows = [[int(r.year), r.dc, int(r.harv_m), int(r.n), round(float(r.rai), 2)] for r in h.itertuples(index=False)]
gbins = [5, 8, 10, 12, 14, 24.01]
gd = d.dropna(subset=['grow_mo']).copy()
gd['gb'] = pd.cut(gd['grow_mo'], gbins, right=False, labels=['5-8', '8-10', '10-12', '12-14', '14+'])
g2 = gd.groupby(['year', 'dc', 'gb'], observed=True).agg(n=('rai', 'size'), rai=('rai', 'sum')).reset_index()
grows = [[int(r.year), r.dc, str(r.gb), int(r.n), round(float(r.rai), 2)] for r in g2.itertuples(index=False)]
gmed = {int(y): round(float(v), 1) for y, v in gd.groupby('year')['grow_mo'].median().items()}
q['bad_harvest_date'] = int(hd_.isna().sum()); q['growth_outside_5_24'] = int((pd_.notna() & hd_.notna()).sum() - df['grow_mo'].notna().sum())

# ---------- การเปลี่ยนพันธุ์ในแปลงเดิม: จับคู่ตามตำแหน่ง (AREA_ID/PAR_ID ไม่คงที่ข้ามปี) ----------
# แปลงปี y จับคู่กับแปลงปีถัดไปที่เปรียบเทียบได้ เมื่อจุดศูนย์กลางห่าง ≤ MATCH_M เมตร และพื้นที่ต่างกันไม่เกิน 30%
# จับคู่หนึ่งต่อหนึ่งตามระยะใกล้สุดก่อน (greedy) · ตัดแปลงที่ไม่มีพิกัดถูกต้อง
from scipy.spatial import cKDTree
MATCH_M, AREA_TOL = 25.0, 0.30
to_utm = Transformer.from_crs(4326, 32647, always_xy=True)
okc = d[~flags.loc[d.index, 'bad_coord']].copy()
okc['e'], okc['nn'] = to_utm.transform(okc['lng'].to_numpy(), okc['lat'].to_numpy())
comp_years = [y for y in years if yinfo[y]['comparable']]
trans, match_info = [], {}
for y0, y1 in zip(comp_years, comp_years[1:]):
    A = okc[okc['year'] == y0].reset_index(drop=True); B = okc[okc['year'] == y1].reset_index(drop=True)
    if not len(A) or not len(B):
        continue
    tree = cKDTree(B[['e', 'nn']].to_numpy())
    dist, idx = tree.query(A[['e', 'nn']].to_numpy(), k=3, distance_upper_bound=MATCH_M)
    cand = []
    for i in range(len(A)):
        for dd, j in zip(dist[i], idx[i]):
            if np.isfinite(dd) and j < len(B):
                ra, rb = A.at[i, 'rai'], B.at[j, 'rai']
                if abs(ra - rb) <= AREA_TOL * max(ra, rb):
                    cand.append((dd, i, j))
    cand.sort()
    ua, ub, pairs = set(), set(), []
    for dd, i, j in cand:
        if i in ua or j in ub:
            continue
        ua.add(i); ub.add(j); pairs.append((i, j))
    if not pairs:
        continue
    P = pd.DataFrame({'dc': A.loc[[i for i, _ in pairs], 'dc'].to_numpy(), 'b0': A.loc[[i for i, _ in pairs], 'breed'].to_numpy(),
                      'b1': B.loc[[j for _, j in pairs], 'breed'].to_numpy(), 'rai': B.loc[[j for _, j in pairs], 'rai'].to_numpy()})
    t = P.groupby(['dc', 'b0', 'b1']).agg(n=('rai', 'size'), rai=('rai', 'sum')).reset_index()
    for r in t.itertuples(index=False):
        trans.append([y0, y1, r.dc, bix.get(r.b0, -1), bix.get(r.b1, -1), int(r.n), round(float(r.rai), 2)])
    match_info['%d-%d' % (y0, y1)] = {'n0': int(len(A)), 'n1': int(len(B)), 'matched': len(pairs), 'rate': round(len(pairs) / len(A), 4)}
q['panel_match'] = {'method': 'จุดศูนย์กลางแปลงห่าง ≤ %d ม. และพื้นที่ต่างกัน ≤ %d%% จับคู่หนึ่งต่อหนึ่ง' % (MATCH_M, AREA_TOL * 100), 'pairs': match_info}

# ---------- ชุดดิน LDD ที่ตำแหน่งแปลง ----------
soil_rows, soil_units = [], None
ss_path = os.path.join(ROOT, 'data', 'ldd_soilseries.js')
if os.path.exists(ss_path):
    s = open(ss_path, encoding='utf-8').read()
    SS = json.loads(s[s.index('=') + 1:].rstrip().rstrip(';'))
    soil_units = SS['units']
    geoms = [shape(f['geometry']) for f in SS['geojson']['features']]
    uids = np.array([f['properties']['u'] for f in SS['geojson']['features']])
    tree = STRtree(geoms)
    ok = d[~flags.loc[d.index, 'bad_coord']]
    pts = points(ok['lng'].to_numpy(), ok['lat'].to_numpy())
    pi, gi = tree.query(pts, predicate='intersects')
    unit = np.full(len(ok), -1)
    unit[pi] = uids[gi]                      # ถ้าตกหลาย polygon ใช้ตัวสุดท้าย (ขอบเขตชนกันเท่านั้น)
    ok = ok.assign(u=unit)
    q['soil_matched'] = int((unit >= 0).sum()); q['soil_unmatched'] = int((unit < 0).sum())
    sg = ok.groupby(['year', 'dc', 'u']).agg(n=('rai', 'size'), rai=('rai', 'sum')).reset_index()
    soil_rows = [[int(r.year), r.dc, int(r.u), int(r.n), round(float(r.rai), 2)] for r in sg.itertuples(index=False)]

out = {'source': 'ผังแปลงเกษตรกรรมดิจิทัล กสก. จ.กำแพงเพชร (ไฟล์ทุกพืช 22-11-2569) — กิจกรรมปลูกมันสำปะหลัง',
       'method': 'หน่วยนับ = กิจกรรมการปลูก (ACT ไม่ซ้ำ) · พื้นที่ ACT_RAI · ตัดรายการที่ไม่มีปี/พื้นที่ผิดปกติ/พื้นที่กิจกรรมเกินพื้นที่แปลง 20% · '
                 'สัดส่วนรายงานแบบถ่วงพื้นที่ · ข้อมูลจากการขึ้นทะเบียน (ไม่ใช่การสุ่ม) ใช้อธิบายกลุ่มที่ขึ้นทะเบียน',
       'min_n': MIN_N, 'rule': 'ปีที่นำมาเปรียบเทียบ: แปลง ≥ %d และพื้นที่ ≥ 50%% ของค่ามัธยฐานรายปี' % MIN_N, 'quality': q, 'years': yinfo, 'breeds': breeds,
       'variety': {'fields': ['year', 'dc', 'tc', 'breed', 'n', 'rai'], 'rows': vrows},
       'plant_month': {'fields': ['year', 'dc', 'month', 'n', 'rai'], 'rows': mrows},
       'harvest_month': {'fields': ['year', 'dc', 'month', 'n', 'rai'], 'rows': hrows, 'note': 'เดือนที่คาดว่าจะเก็บเกี่ยว (PRODUCE_DATE ตามที่เกษตรกรแจ้งขึ้นทะเบียน)'},
       'growth': {'fields': ['year', 'dc', 'bin', 'n', 'rai'], 'rows': grows, 'median_months': gmed, 'note': 'อายุเก็บเกี่ยว = PRODUCE_DATE − PLANT_DATE (เดือน) ตัดค่า < 5 หรือ > 24 เดือน'},
       'transitions': {'fields': ['y0', 'y1', 'dc', 'breed0', 'breed1', 'n', 'rai'], 'rows': trans},
       'soil': {'fields': ['year', 'dc', 'unit', 'n', 'rai'], 'rows': soil_rows,
                'units': [{k: u.get(k) for k in ('group', 'code', 'name', 'texture', 'fertility', 'ph')} for u in (soil_units or [])]}}
with open(OUT, 'w', encoding='utf-8') as fo:
    fo.write('window.KPP_TRENDS=')
    json.dump(out, fo, ensure_ascii=False, separators=(',', ':'))
    fo.write(';\n')
print('ปี:', {y: (v['n'], round(v['rai'])) for y, v in yinfo.items()})
print('คุณภาพ:', q)
print('->', OUT, '%.0f KB' % (os.path.getsize(OUT) / 1e3))
