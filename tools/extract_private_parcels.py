# -*- coding: utf-8 -*-
"""ดึงข้อมูลรายแปลงมันสำปะหลัง "รวมข้อมูลส่วนบุคคลบางส่วน" สำหรับนำเข้า Google Sheet ส่วนตัว (KPP_PRIVATE) — ใช้ภายในเท่านั้น

อ่าน : ../ข้อมูลผังแปลง/ผังแปลงเกษตรกรรมดิจิทัล_*.xlsx และไฟล์มันสำปะหลัง
เขียน: data/private/parcels_for_sheet.csv.gz  (อยู่ใน .gitignore ห้าม commit)
เก็บ : รหัสกิจกรรม, ปี, อำเภอ, ตำบล, หมู่, พิกัด, ไร่, พันธุ์, วันปลูก/เก็บเกี่ยว, ชื่อ-สกุล, เบอร์โทร, ที่อยู่ (บ้านเลขที่/หมู่/ตำบล/อำเภอ), ประเภทเอกสารสิทธิ์
ไม่เก็บ: เลขบัตรประชาชน (IDCARD), เลขที่เอกสารสิทธิ์ (DOC_NO), รหัสผู้ใช้ (parcel_user_id), รูปแปลง (wkt)
"""
import csv, glob, gzip, os, re, sys, time
import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARENT = os.path.dirname(ROOT)
OUT = os.path.join(ROOT, 'data', 'private', 'parcels_for_sheet.csv.gz')
COLS = ['key', 'year', 'district', 'tambon', 'moo', 'lat', 'lng', 'rai', 'variety', 'plant_date', 'harvest_date', 'owner_name', 'phone', 'note']
files = sorted(glob.glob(os.path.join(PARENT, 'ข้อมูลผังแปลง', 'ผังแปลงเกษตรกรรมดิจิทัล_*.xlsx')),
               key=lambda p: int(re.search(r'_(\d+)\.xlsx$', p).group(1)) if re.search(r'_(\d+)\.xlsx$', p) else 0)
files += glob.glob(os.path.join(ROOT, 'ผังแปลงเกษตรกรรมดิจิทัล_*มันสำปะหลัง*.xlsx'))


def num(v):
    try:
        return float(str(v).replace(',', ''))
    except (TypeError, ValueError):
        return 0.0


seen, total = set(), 0
with gzip.open(OUT, 'wt', encoding='utf-8', newline='') as fo:
    w = csv.writer(fo)
    w.writerow(COLS)
    for path in files:
        t0 = time.time()
        wb = openpyxl.load_workbook(path, read_only=True)
        it = wb.worksheets[0].iter_rows(values_only=True)
        hdr = [str(h) if h is not None else '' for h in next(it)]
        ix = {h: i for i, h in enumerate(hdr)}
        g = lambda r, k: (r[ix[k]] if k in ix and ix[k] < len(r) else None)
        n = 0
        for r in it:
            if 'มันสำปะหลัง' not in str(g(r, 'DETAIL_NAME') or ''):
                continue
            key = str(g(r, 'ACT') or g(r, 'parcel_activity_id') or '')
            if not key or key in seen:
                continue
            seen.add(key)
            lat = num(g(r, 'parcel_lat')) or num(g(r, 'LAT')); lng = num(g(r, 'parcel_lng')) or num(g(r, 'LNG'))
            name = ' '.join(x for x in [str(g(r, 'NAME') or '').strip(), str(g(r, 'SURNAME') or '').strip()] if x)
            addr = ' '.join(x for x in ['บ้านเลขที่ ' + str(g(r, 'ADDRESS_HOUSENUMBER')).strip() if g(r, 'ADDRESS_HOUSENUMBER') else '',
                                        'หมู่ ' + str(g(r, 'ADDRESS_MOO')).strip() if g(r, 'ADDRESS_MOO') else '',
                                        'ต.' + str(g(r, 'ADDRESS_TAMBON')).strip() if g(r, 'ADDRESS_TAMBON') else '',
                                        'อ.' + str(g(r, 'ADDRESS_AMPHUR')).strip() if g(r, 'ADDRESS_AMPHUR') else ''] if x)
            note = ' | '.join(x for x in [addr, 'เอกสารสิทธิ์: ' + str(g(r, 'DOC_TYPE_NAME')) if g(r, 'DOC_TYPE_NAME') else ''] if x)
            w.writerow([key, g(r, 'YEAR_ACT'), str(g(r, 'a_code') or '')[-4:], str(g(r, 't_code') or '')[-6:], g(r, 'MOO'),
                        round(lat, 6) if lat else '', round(lng, 6) if lng else '', num(g(r, 'ACT_RAI')) or num(g(r, 'parcel_area_rai')),
                        str(g(r, 'BREED_NAME') or '').strip(), str(g(r, 'PLANT_DATE') or '')[:10], str(g(r, 'PRODUCE_DATE') or '')[:10],
                        name, str(g(r, 'MOBILE') or '').strip(), note])
            n += 1
        wb.close(); total += n
        print('%-60s มันฯ %6d  %.0fs' % (os.path.basename(path)[-52:], n, time.time() - t0), flush=True)
print('รวม', total, 'แปลง ->', OUT, '%.1f MB' % (os.path.getsize(OUT) / 1e6))
