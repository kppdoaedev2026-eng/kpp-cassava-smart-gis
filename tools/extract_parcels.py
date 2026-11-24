# -*- coding: utf-8 -*-
"""ดึงข้อมูลจากผังแปลงเกษตรกรรมดิจิทัลทั้งจังหวัด (ทุกพืช หลายไฟล์ ไฟล์ละ ~140 MB) แบบไม่เก็บข้อมูลส่วนบุคคล

อ่าน : ../ข้อมูลผังแปลง/ผังแปลงเกษตรกรรมดิจิทัล_62_กำแพงเพชร_*.xlsx  และ  ผังแปลงเกษตรกรรมดิจิทัล_*มันสำปะหลัง*.xlsx
เขียน: data/private/cassava_parcels_all.csv.gz  — แปลงมันสำปะหลังทุกปี (มีพิกัด/รูปแปลง ใช้ภายในเท่านั้น ไม่ commit)
       data/source/landuse_tambon_year.json     — พื้นที่ทุกชนิดพืชรวมรายตำบล/ปี (ข้อมูลสรุป เผยแพร่ได้)
ไม่อ่านคอลัมน์: IDCARD NAME SURNAME ADDRESS_* MOBILE DOC_NO parcel_user_id
ลบรายการซ้ำด้วย ACT (= parcel_activity_id รหัสกิจกรรมการปลูก ไม่ซ้ำ) — ไฟล์ต่างชุดอาจมีแถวซ้ำกัน
  หมายเหตุ: PAR_ID ว่างทุกแถว · PAR_ACT มีค่าซ้ำแบบ placeholder ห้ามใช้เป็นคีย์ · AREA_ID = รหัสแปลงที่ดิน (ใช้เชื่อมข้ามปี)
python tools/extract_parcels.py"""
import csv, glob, gzip, json, os, re, sys, time
import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARENT = os.path.dirname(ROOT)
OUT_PRIV = os.path.join(ROOT, 'data', 'private', 'cassava_parcels_all.csv.gz')
OUT_LU = os.path.join(ROOT, 'data', 'source', 'landuse_tambon_year.json')
KEEP = ['a_code', 'a_name', 't_code', 't_name', 'MOO', 'data_org', 'parcel_lat', 'parcel_lng', 'LAT', 'LNG', 'parcel_area_rai',
        'ACT', 'AREA_ID', 'PAR_ACT', 'TYPE_NAME', 'DETAIL_NAME', 'BREED_NAME', 'ACT_RAI', 'DIS_RAI', 'PLANT_DATE', 'PRODUCE_DATE',
        'YEAR_ACT', 'PLANT_ROUND', 'DOC_TYPE_NAME', 'UPDATE_DATE', 'wkt']
PII = {'IDCARD', 'NAME', 'SURNAME', 'ADDRESS_HOUSENUMBER', 'ADDRESS_MOO', 'ADDRESS_TAMBON', 'ADDRESS_AMPHUR', 'ADDRESS_PROVINCE',
       'MOBILE', 'DOC_NO', 'parcel_user_id'}
assert not PII & set(KEEP)

files = sorted(glob.glob(os.path.join(PARENT, 'ข้อมูลผังแปลง', 'ผังแปลงเกษตรกรรมดิจิทัล_*.xlsx')),
               key=lambda p: int(re.search(r'_(\d+)\.xlsx$', p).group(1)) if re.search(r'_(\d+)\.xlsx$', p) else 0)
files += glob.glob(os.path.join(ROOT, 'ผังแปลงเกษตรกรรมดิจิทัล_*มันสำปะหลัง*.xlsx'))
if not files:
    sys.exit('ไม่พบไฟล์ผังแปลง')


def num(v):
    try:
        return float(str(v).replace(',', ''))
    except (TypeError, ValueError):
        return 0.0


seen, landuse, stats = set(), {}, {}
os.makedirs(os.path.dirname(OUT_PRIV), exist_ok=True)
with gzip.open(OUT_PRIV, 'wt', encoding='utf-8', newline='') as fo:
    w = csv.writer(fo)
    w.writerow(KEEP + ['src_file'])
    for path in files:
        t0 = time.time()
        wb = openpyxl.load_workbook(path, read_only=True)
        ws = wb.worksheets[0]
        it = ws.iter_rows(values_only=True)
        hdr = [str(h) if h is not None else '' for h in next(it)]
        ix = {h: i for i, h in enumerate(hdr)}
        miss = [k for k in KEEP if k not in ix]
        n = nc = dup = 0
        for r in it:
            n += 1
            g = lambda k: r[ix[k]] if k in ix and ix[k] < len(r) else None
            key = str(g('ACT') or g('parcel_activity_id') or '') or None
            if key and key in seen:
                dup += 1
                continue
            if key:
                seen.add(key)
            year = str(g('YEAR_ACT') or '').strip()
            tc = str(g('t_code') or '').strip()
            crop = (str(g('TYPE_NAME') or '') + '|' + str(g('DETAIL_NAME') or '')).strip()
            rai = num(g('ACT_RAI')) or num(g('parcel_area_rai'))
            lu = landuse.setdefault(year, {}).setdefault(tc, {})
            lu[crop] = round(lu.get(crop, 0) + rai, 2)
            if 'มันสำปะหลัง' in crop:
                nc += 1
                w.writerow([g(k) for k in KEEP] + [os.path.basename(path)])
        wb.close()
        stats[os.path.basename(path)] = {'rows': n, 'cassava': nc, 'dup': dup, 'missing_cols': miss}
        print('%-70s แถว %7d มันฯ %6d ซ้ำ %6d  %.0fs' % (os.path.basename(path)[-60:], n, nc, dup, time.time() - t0), flush=True)

with open(OUT_LU, 'w', encoding='utf-8') as f:
    json.dump({'source': 'ผังแปลงเกษตรกรรมดิจิทัล กสก. (รวมรายตำบล ทุกชนิดพืช)', 'files': stats, 'by_year_tambon_crop': landuse},
              f, ensure_ascii=False, separators=(',', ':'))
print('->', OUT_PRIV, '%.1f MB' % (os.path.getsize(OUT_PRIV) / 1e6))
print('->', OUT_LU, '%.0f KB' % (os.path.getsize(OUT_LU) / 1e3))
